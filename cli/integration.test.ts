import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);

it('the built command frees a real listener and leaves another server running', async () => {
  const children: ChildProcess[] = [];
  async function startServer(): Promise<{ child: ChildProcess; port: number }> {
    const child = spawn(process.execPath, ['-e', `
      const server = require('node:net').createServer();
      server.listen(0, '127.0.0.1', () => process.send(server.address().port));
    `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    const [port] = await once(child, 'message');
    return { child, port: port as number };
  }

  try {
    const target = await startServer();
    const other = await startServer();
    const cli = path.resolve('bin/portkill.cjs');
    const { stdout } = await exec(process.execPath, [cli, String(target.port)], { timeout: 15_000 });
    expect(stdout).toContain(`Freed port ${target.port}`);

    const probe = net.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(target.port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));

    const socket = net.connect(other.port, '127.0.0.1');
    try { await once(socket, 'connect'); } finally { socket.destroy(); }
    expect(other.child.exitCode).toBeNull();
    expect((await exec(process.execPath, [cli, String(target.port)])).stdout).toContain('already free');
  } finally {
    await Promise.all(children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }));
  }
}, 30_000);
