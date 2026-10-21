import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import net from 'node:net';
import { expect, it } from 'vitest';
import { findDockerListeners } from '../electron/docker-service';

const exec = promisify(execFile);

// Explicit opt-in: uses the local daemon and an already available alpine image.
// Never touches preexisting containers; cleanup uses only IDs created by this test.
it.skipIf(process.env.PORTKILL_DOCKER_TEST !== '1')('frees real Docker bindings without stopping an unrelated container', async () => {
  const owned: string[] = [];
  let host: string | undefined;
  const docker = async (...args: string[]) => (await exec('docker', [...(host ? ['--host', host] : []), ...args], {
    timeout: 15_000,
    env: host ? { ...process.env, DOCKER_CONTEXT: '', DOCKER_HOST: '' } : process.env,
  })).stdout.trim();
  host = process.env.DOCKER_CONTEXT || !process.env.DOCKER_HOST
    ? JSON.parse(await docker('context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}')) as string
    : process.env.DOCKER_HOST;
  expect(host, 'Docker integration tests require a local socket/pipe endpoint').toMatch(/^(unix:\/\/|npipe:\/\/)/);
  const start = async () => {
    const id = await docker('create', '--pull=never', '--restart=always', '-p', '127.0.0.1::80', 'alpine:latest', 'sleep', '300');
    owned.push(id);
    await docker('start', id);
    const bindings = JSON.parse(await docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', id));
    return { id, port: Number(bindings['80/tcp'][0].HostPort) };
  };
  try {
    const control = await start();
    for (const graceful of [false, true]) {
      const target = await start();
      expect((await findDockerListeners()).get(target.port)).toEqual(expect.arrayContaining([expect.objectContaining({ containerId: target.id })]));
      const { stdout } = await exec(process.execPath, [path.resolve('bin/portkill.cjs'), String(target.port), ...(graceful ? ['--graceful'] : [])], { timeout: 20_000 });
      expect(stdout).toContain(`Freed port ${target.port}`);
      expect(await docker('inspect', '--format', '{{.State.Running}}', target.id)).toBe('false');
      expect(await docker('inspect', '--format', '{{.State.Running}}', control.id)).toBe('true');
      const probe = net.createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(target.port, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    if (owned.length) await docker('rm', '-f', ...owned);
  }
}, 60_000);
