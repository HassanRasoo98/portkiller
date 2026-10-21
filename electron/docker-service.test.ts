import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from './system-command';
import { findDockerListeners, parseDockerBindings } from './docker-service';
import { findListenersOnPort, killPort } from './port-service';

vi.mock('./system-command', () => ({ run: vi.fn() }));
const host = 'unix:///tmp/docker-test.sock';
const id = 'a'.repeat(64);
const otherId = 'b'.repeat(64);
const metadata = (overrides = {}) => JSON.stringify({
  id, name: '/test-nginx', running: true,
  ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }, { HostIp: '::', HostPort: '8080' }] },
  ...overrides,
});
const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
const fail = (stderr = 'unavailable') => ({ stdout: '', stderr, code: 1 });
let inspection: string;
let native: string;
let stopped: boolean;
beforeEach(() => {
  vi.stubEnv('DOCKER_CONTEXT', '');
  vi.stubEnv('DOCKER_HOST', '');
  inspection = metadata();
  native = '';
  stopped = false;
  vi.mocked(run).mockImplementation(async (command, args) => {
    if (command === 'docker') {
      if (args[0] === 'context') return ok(JSON.stringify(host));
      if (args.includes('ls')) return ok(stopped ? '' : id);
      if (args.includes('inspect')) return ok(inspection);
      if (args.includes('stop')) { stopped = true; return ok(id); }
    }
    if (command === 'lsof') return ok(native);
    if (command === 'netstat') return ok('');
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('Docker published ports', () => {
  it('uses published host ports, deduplicates IPv4/IPv6, and excludes UDP, exposed, and stopped containers', () => {
    const snapshot = parseDockerBindings([
      metadata({ ports: {
        '80/tcp': [{ HostPort: '8080' }, { HostPort: '8080' }, { HostPort: '8081' }],
        '90/tcp': null, '53/udp': [{ HostPort: '5353' }],
      } }),
      metadata({ id: otherId, running: false }),
    ].join('\n'), host);
    expect([...snapshot.keys()]).toEqual([8080, 8081]);
    expect(snapshot.get(8080)).toEqual([{
      name: 'Docker: test-nginx', containerName: 'test-nginx', containerId: id, dockerHost: host,
    }]);
    expect(snapshot.get(8080)![0].pid).toBeUndefined();
  });

  it('retains different containers bound on different host addresses of the same port', () => {
    expect(parseDockerBindings(`${metadata()}\n${metadata({ id: otherId })}`, host).get(8080)).toHaveLength(2);
  });

  it('rejects malformed metadata rather than inventing a PID or claiming a free port', () => {
    expect(() => parseDockerBindings('not json', host)).toThrow();
    expect(() => parseDockerBindings(metadata({ id: '8080' }), host)).toThrow('Invalid Docker');
  });

  it('detects a published port even when host tools cannot see a listener', async () => {
    expect(await findListenersOnPort(8080)).toMatchObject([{ containerId: id, containerName: 'test-nginx' }]);
    expect(await findListenersOnPort(80)).toEqual([]);
  });

  it('uses a scan snapshot without querying Docker again', async () => {
    const snapshot = parseDockerBindings(metadata(), host);
    expect(await findListenersOnPort(8080, snapshot)).toHaveLength(1);
    expect(vi.mocked(run).mock.calls.every(([command]) => command !== 'docker')).toBe(true);
  });

  it.each(['com.docker.backend', 'com.docke', 'docker-proxy', 'vpnkit', 'rootlesskit'])('hides the shared forwarding process %s', async (name) => {
    native = `p4242\nc${name}\n`;
    expect(await findListenersOnPort(8080)).toHaveLength(1);
  });

  it.each([true, false])('stops only the matching container and verifies release (force=%s)', async (force) => {
    native = 'p4242\ncnode\n';
    expect(await killPort(8080, force)).toEqual({ killed: [], failed: [] });
    expect(run).toHaveBeenCalledWith('docker', ['--host', host, 'container', 'stop', '--time', force ? '0' : '5', id]);
    expect(vi.mocked(run).mock.calls.some(([command]) => ['kill', 'taskkill'].includes(command))).toBe(false);
    native = '';
    expect(await findListenersOnPort(8080)).toEqual([]);
  });

  it('reports container stop failures', async () => {
    const implementation = vi.mocked(run).getMockImplementation()!;
    vi.mocked(run).mockImplementation((command, args) => args.includes('stop')
      ? Promise.resolve(fail('permission denied')) : implementation(command, args));
    expect((await killPort(8080)).failed).toEqual([{ pid: 0, error: expect.stringContaining('permission denied') }]);
  });

  it('refuses to kill a Docker forwarding process if container lookup is unavailable', async () => {
    vi.stubEnv('DOCKER_HOST', 'ssh://remote');
    native = 'p4242\nccom.docke\n';
    expect((await killPort(8080)).failed[0].error).toContain('refusing');
    expect(vi.mocked(run).mock.calls.some(([command]) => ['kill', 'taskkill'].includes(command))).toBe(false);
  });

  it.each(['ssh://production', 'tcp://remote:2376', 'tcp://localhost:2375'])('never inspects or stops containers on remote/ambiguous endpoint %s', async (endpoint) => {
    vi.stubEnv('DOCKER_HOST', endpoint);
    expect(await findDockerListeners()).toEqual(new Map());
    expect(run).not.toHaveBeenCalled();
  });

  it('honors DOCKER_CONTEXT ahead of DOCKER_HOST and rejects its remote endpoint', async () => {
    vi.stubEnv('DOCKER_CONTEXT', 'production');
    vi.stubEnv('DOCKER_HOST', host);
    vi.mocked(run).mockResolvedValue(ok(JSON.stringify('ssh://production')));
    expect(await findDockerListeners()).toEqual(new Map());
    expect(run).toHaveBeenCalledExactlyOnceWith('docker', ['context', 'inspect', 'production', '--format', '{{json .Endpoints.docker.Host}}']);
  });

  it('supports Windows named pipe endpoints', async () => {
    vi.stubEnv('DOCKER_HOST', 'npipe:////./pipe/docker_engine');
    expect((await findDockerListeners()).get(8080)?.[0].dockerHost).toBe('npipe:////./pipe/docker_engine');
  });

  it('keeps native scanning available with an absent CLI or stopped daemon', async () => {
    vi.mocked(run).mockImplementation(async (command) => command === 'docker' ? fail() : ok('p4242\ncnode\n'));
    expect(await findListenersOnPort(3000)).toEqual([{ pid: 4242, name: 'node' }]);
  });

  it('does not silently accept partial Docker inspection failures', async () => {
    const implementation = vi.mocked(run).getMockImplementation()!;
    vi.mocked(run).mockImplementation((command, args) => args.includes('inspect') && args.includes('container')
      ? Promise.resolve(fail('container disappeared')) : implementation(command, args));
    await expect(findListenersOnPort(8080)).rejects.toThrow('Could not inspect Docker');
  });

  it('can identify a container even if native scanning tools are unavailable', async () => {
    const implementation = vi.mocked(run).getMockImplementation()!;
    vi.mocked(run).mockImplementation((command, args) => command !== 'docker'
      ? Promise.resolve(fail('missing tools')) : implementation(command, args));
    expect(await findListenersOnPort(8080)).toMatchObject([{ containerId: id }]);
    await expect(findListenersOnPort(3000)).rejects.toThrow('Could not scan');
  });
});
