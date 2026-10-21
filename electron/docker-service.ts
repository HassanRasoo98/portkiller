import type { DockerPortProcess } from '../shared/common-ports';
import { run } from './system-command';

export type DockerSnapshot = Map<number, DockerPortProcess[]>;

export function isDockerProcess(name: string): boolean {
  return /docker|^com\.dock|vpnkit|rootlesskit/i.test(name);
}

/** Only actual, published TCP bindings count; exposed ports and UDP do not. */
export function parseDockerBindings(stdout: string, dockerHost: string): DockerSnapshot {
  const ports: DockerSnapshot = new Map();
  for (const line of stdout.split(/\r?\n/).filter((line) => line.trim())) {
    const container = JSON.parse(line) as {
      id: string; name: string; running: boolean;
      ports: Record<string, Array<{ HostPort: string }> | null> | null;
    };
    if (!/^[a-f0-9]{64}$/.test(container.id) || typeof container.name !== 'string') {
      throw new Error('Invalid Docker container metadata');
    }
    if (!container.running) continue;
    for (const [binding, mappings] of Object.entries(container.ports ?? {})) {
      if (!binding.endsWith('/tcp')) continue;
      for (const mapping of mappings ?? []) {
        const port = Number(mapping.HostPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
        const listeners = ports.get(port) ?? [];
        if (!listeners.some((listener) => listener.containerId === container.id)) {
          const name = container.name.replace(/^\//, '');
          listeners.push({ name: `Docker: ${name}`, containerId: container.id, containerName: name, dockerHost });
          ports.set(port, listeners);
        }
      }
    }
  }
  return ports;
}

// Pin discovery and termination to a local endpoint even if the active context changes.
async function dockerHost(): Promise<string | undefined> {
  let host = process.env.DOCKER_CONTEXT ? undefined : process.env.DOCKER_HOST;
  if (!host) {
    const context = await run('docker', ['context', 'inspect', ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : []), '--format', '{{json .Endpoints.docker.Host}}']);
    if (context.code !== 0) return;
    try { host = JSON.parse(context.stdout.trim()) as string; } catch { return; }
  }
  return typeof host === 'string' && /^(unix:\/\/|npipe:\/\/)/.test(host) ? host : undefined;
}

export async function findDockerListeners(): Promise<DockerSnapshot> {
  const host = await dockerHost();
  if (!host) return new Map();
  const list = await run('docker', ['--host', host, 'container', 'ls', '--quiet', '--no-trunc']);
  // Docker is optional: an absent CLI or stopped/inaccessible daemon leaves native scanning available.
  if (list.code !== 0 || !list.stdout.trim()) return new Map();
  const ids = list.stdout.trim().split(/\s+/);
  if (ids.some((id) => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Invalid Docker container list');
  const result = await run('docker', ['--host', host, 'container', 'inspect', '--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"ports":{{json .NetworkSettings.Ports}}}', ...ids]);
  // A container disappearing between list and inspect is safe to retry on the next scan.
  // Never interpret a partial/failed inspection as proof that ports are free.
  if (result.code !== 0) throw new Error(`Could not inspect Docker port bindings: ${result.stderr}`);
  return parseDockerBindings(result.stdout, host);
}

export async function stopContainers(containers: DockerPortProcess[], force: boolean): Promise<{
  killed: number[]; failed: Array<{ pid: number; error: string }>;
}> {
  const failed: Array<{ pid: number; error: string }> = [];
  for (const container of containers) {
    const result = await run('docker', ['--host', container.dockerHost, 'container',
      'stop', '--time', force ? '0' : '5', container.containerId]);
    if (result.code !== 0) failed.push({ pid: 0, error: `Docker container ${container.containerName} (${container.containerId.slice(0, 12)}): ${result.stderr || result.stdout || 'termination failed'}` });
  }
  return { killed: [], failed };
}
