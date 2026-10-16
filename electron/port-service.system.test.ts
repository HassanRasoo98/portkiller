import { afterEach, describe, expect, it, vi } from 'vitest';

const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => {}, {
    [Symbol.for('nodejs.util.promisify.custom')]: command,
  }),
}));
import { findListenersOnPort, killProcesses } from './port-service';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
function platform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  command.mockReset();
});

describe('platform commands', () => {
  it('uses only TCP listeners on Unix and allows a real PID equal to the port', async () => {
    platform('darwin');
    command.mockResolvedValue({ stdout: 'p3000\ncnode\n', stderr: '' });
    expect(await findListenersOnPort(3000)).toEqual([{ pid: 3000, name: 'node' }]);
    expect(command).toHaveBeenCalledWith('lsof', ['-nP', '-Fpc', '-iTCP:3000', '-sTCP:LISTEN'], expect.any(Object));
  });

  it('treats the normal lsof no-match exit as a free port', async () => {
    platform('darwin');
    command.mockRejectedValue({ code: 1, stdout: '', stderr: '' });
    expect(await findListenersOnPort(3000)).toEqual([]);
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('uses ss when lsof is unavailable', async () => {
    platform('linux');
    command.mockRejectedValueOnce({ code: 'ENOENT', message: 'lsof unavailable' })
      .mockResolvedValueOnce({ stdout: 'LISTEN 0 511 *:3000 *:* users:(("node",pid=4242,fd=23))', stderr: '' });
    expect(await findListenersOnPort(3000)).toEqual([{ pid: 4242, name: 'node' }]);
    expect(command).toHaveBeenLastCalledWith('ss', ['-tlnp', 'sport = :3000'], expect.any(Object));
  });

  it('does not claim a port is free when all scanning tools fail', async () => {
    platform('linux');
    command.mockRejectedValue({ code: 'ENOENT', message: 'missing tool' });
    await expect(findListenersOnPort(3000)).rejects.toThrow('Install lsof');
  });

  it('does not mistake a timed-out scanner for a normal no-match exit', async () => {
    platform('linux');
    command.mockRejectedValue({ code: null, killed: true, stdout: '', stderr: '' });
    await expect(findListenersOnPort(3000)).rejects.toThrow('Could not scan');
  });

  it('reports listeners hidden by ss permissions', async () => {
    platform('linux');
    command.mockRejectedValueOnce({ code: 'ENOENT' })
      .mockResolvedValueOnce({ stdout: 'LISTEN 0 511 *:3000 *:*', stderr: '' });
    await expect(findListenersOnPort(3000)).rejects.toThrow('privileges');
  });

  it('reports a hidden listener even when another listener has a visible PID', async () => {
    platform('linux');
    command.mockRejectedValueOnce({ code: 'ENOENT' })
      .mockResolvedValueOnce({ stdout: 'LISTEN 0 511 *:3000 *:*\nLISTEN 0 511 [::]:3000 *:* users:(("node",pid=4242,fd=23))', stderr: '' });
    await expect(findListenersOnPort(3000)).rejects.toThrow('privileges');
  });

  it('matches Windows IPv4/IPv6 local listeners, excluding connections and other ports', async () => {
    platform('win32');
    command.mockResolvedValueOnce({ stdout: [
      'TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 4242',
      'TCP [::]:3000 [::]:0 LISTENING 4242',
      'TCP 127.0.0.1:3001 127.0.0.1:3000 ESTABLISHED 9999',
      'TCP 0.0.0.0:13000 0.0.0.0:0 LISTENING 8888',
    ].join('\r\n'), stderr: '' })
      .mockResolvedValueOnce({ stdout: '"node.exe","4242","Console","1","123 K"', stderr: '' });
    const listeners = await findListenersOnPort(3000);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toMatchObject({ pid: 4242, name: 'node.exe' });
  });

  it('reports Windows netstat failure', async () => {
    platform('win32');
    command.mockRejectedValue({ code: 1, stderr: 'Access denied' });
    await expect(findListenersOnPort(3000)).rejects.toThrow('netstat');
  });

  it.each([['win32', true, 'taskkill', ['/PID', '4242', '/F']], ['win32', false, 'taskkill', ['/PID', '4242']], ['darwin', true, 'kill', ['-9', '4242']], ['linux', false, 'kill', ['-TERM', '4242']]])(
    'terminates on %s (force=%s)', async (os, force, executable, args) => {
      platform(os as string);
      command.mockResolvedValue({ stdout: '', stderr: '' });
      expect(await killProcesses([4242, 4242], force as boolean)).toEqual({ killed: [4242], failed: [] });
      expect(command).toHaveBeenCalledExactlyOnceWith(executable, args, expect.any(Object));
    },
  );

  it('refuses unsafe PIDs before running any command', async () => {
    const result = await killProcesses([0, -1, 1, 1.5, NaN, process.pid]);
    expect(result.killed).toEqual([]);
    expect(result.failed).toHaveLength(6);
    expect(command).not.toHaveBeenCalled();
  });
});
