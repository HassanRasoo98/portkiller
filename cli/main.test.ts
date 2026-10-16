import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findListenersOnPort, killProcesses } from '../electron/port-service';
import { runCli } from './main';

vi.mock('../electron/port-service', () => ({
  findListenersOnPort: vi.fn(),
  killProcesses: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('portkill CLI', () => {
  it.each([[], ['0'], ['65536'], ['-1'], ['3.14'], ['1e3'], ['3000junk'], ['3000', '4000'], ['3000', '--force']])(
    'rejects invalid arguments %j without scanning or killing', async (...args) => {
      expect(await runCli(args as string[], '1.0.0')).toBe(2);
      expect(findListenersOnPort).not.toHaveBeenCalled();
      expect(killProcesses).not.toHaveBeenCalled();
    },
  );

  it('shows help and version without scanning', async () => {
    expect(await runCli(['--help'], '1.2.3')).toBe(0);
    expect(await runCli(['--version'], '1.2.3')).toBe(0);
    expect(console.log).toHaveBeenCalledWith('1.2.3');
    expect(findListenersOnPort).not.toHaveBeenCalled();
  });

  it('succeeds without killing when already free', async () => {
    vi.mocked(findListenersOnPort).mockResolvedValue([]);
    expect(await runCli(['3000'], '1.0.0')).toBe(0);
    expect(killProcesses).not.toHaveBeenCalled();
  });

  it.each([false, true])('kills listeners and verifies release (graceful=%s)', async (graceful) => {
    vi.mocked(findListenersOnPort)
      .mockResolvedValueOnce([{ pid: 4242, name: 'node' }])
      .mockResolvedValueOnce([{ pid: 4242, name: 'node' }])
      .mockResolvedValue([]);
    vi.mocked(killProcesses).mockResolvedValue({ killed: [4242], failed: [] });
    const result = runCli(graceful ? ['3000', '--graceful'] : ['3000'], '1.0.0');
    await vi.runAllTimersAsync();
    expect(await result).toBe(0);
    expect(killProcesses).toHaveBeenCalledWith([4242], !graceful);
    expect(findListenersOnPort).toHaveBeenCalledTimes(3);
  });

  it('returns failure if a killed server respawns', async () => {
    vi.mocked(findListenersOnPort).mockResolvedValue([{ pid: 4242, name: 'node' }]);
    vi.mocked(killProcesses).mockResolvedValue({ killed: [4242], failed: [] });
    const result = runCli(['3000'], '1.0.0');
    await vi.runAllTimersAsync();
    expect(await result).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('still in use'));
  });

  it('reports permission failures', async () => {
    vi.mocked(findListenersOnPort).mockResolvedValue([{ pid: 4242, name: 'node' }]);
    vi.mocked(killProcesses).mockResolvedValue({ killed: [], failed: [{ pid: 4242, error: 'Permission denied' }] });
    const result = runCli(['3000'], '1.0.0');
    await vi.runAllTimersAsync();
    expect(await result).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
  });

  it('reports scan errors instead of claiming the port is free', async () => {
    vi.mocked(findListenersOnPort).mockRejectedValue(new Error('Install lsof or ss'));
    expect(await runCli(['3000'], '1.0.0')).toBe(1);
    expect(killProcesses).not.toHaveBeenCalled();
  });
});
