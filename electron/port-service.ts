import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PortProcess } from '../shared/common-ports';

const execFileAsync = promisify(execFile);

function uniqueByPid(processes: PortProcess[]): PortProcess[] {
  const seen = new Set<number>();
  return processes.filter((proc) => {
    if (seen.has(proc.pid)) return false;
    seen.add(proc.pid);
    return true;
  });
}

async function run(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
      code: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

function parseLsof(stdout: string): PortProcess[] {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Skip header if present
  const dataLines = lines[0]?.startsWith('COMMAND') ? lines.slice(1) : lines;
  const processes: PortProcess[] = [];

  for (const line of dataLines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const pid = Number(parts[1]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const user = parts[2];
    processes.push({
      pid,
      name,
      user,
      command: line,
    });
  }

  return uniqueByPid(processes);
}

async function findListenersUnix(port: number): Promise<PortProcess[]> {
  // Prefer lsof when available (macOS + many Linux distros)
  const lsof = await run('lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
  ]);
  if (lsof.code === 0 && lsof.stdout.trim()) {
    return parseLsof(lsof.stdout);
  }

  // Fallback: ss (Linux)
  const ss = await run('ss', ['-tlnp', `sport = :${port}`]);
  if (ss.code === 0 && ss.stdout.trim()) {
    const processes: PortProcess[] = [];
    const pidRegex = /pid=(\d+)/g;
    const nameRegex = /users:\(\("([^"]+)"/g;
    let match: RegExpExecArray | null;
    const pids: number[] = [];
    while ((match = pidRegex.exec(ss.stdout)) !== null) {
      pids.push(Number(match[1]));
    }
    const names: string[] = [];
    while ((match = nameRegex.exec(ss.stdout)) !== null) {
      names.push(match[1]);
    }
    for (let i = 0; i < pids.length; i += 1) {
      processes.push({
        pid: pids[i],
        name: names[i] ?? `pid-${pids[i]}`,
      });
    }
    return uniqueByPid(processes);
  }

  // Last resort: fuser
  const fuser = await run('fuser', [`${port}/tcp`]);
  const combined = `${fuser.stdout} ${fuser.stderr}`;
  const pids = [...combined.matchAll(/\b(\d+)\b/g)]
    .map((m) => Number(m[1]))
    .filter((pid) => Number.isFinite(pid) && pid > 0);

  return uniqueByPid(
    pids.map((pid) => ({
      pid,
      name: `pid-${pid}`,
    })),
  );
}

async function findListenersWindows(port: number): Promise<PortProcess[]> {
  const netstat = await run('netstat', ['-ano', '-p', 'tcp']);
  if (netstat.code !== 0) return [];

  const processes: PortProcess[] = [];
  const lines = netstat.stdout.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !/LISTENING/i.test(trimmed)) continue;

    // Example: TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;

    const local = parts[1];
    const state = parts[parts.length - 2];
    const pidStr = parts[parts.length - 1];
    if (!/LISTENING/i.test(state)) continue;

    const portMatch = local.match(/:(\d+)$/);
    if (!portMatch || Number(portMatch[1]) !== port) continue;

    const pid = Number(pidStr);
    if (!Number.isFinite(pid) || pid <= 0) continue;

    processes.push({ pid, name: `pid-${pid}` });
  }

  const unique = uniqueByPid(processes);
  const enriched: PortProcess[] = [];

  for (const proc of unique) {
    const task = await run('tasklist', [
      '/FI',
      `PID eq ${proc.pid}`,
      '/FO',
      'CSV',
      '/NH',
    ]);
    if (task.code === 0 && task.stdout.trim()) {
      // "chrome.exe","1234","Session","1","12,345 K"
      const csv = task.stdout.trim().split('\n')[0];
      const nameMatch = csv.match(/^"([^"]+)"/);
      enriched.push({
        ...proc,
        name: nameMatch?.[1] ?? proc.name,
        command: csv,
      });
    } else {
      enriched.push(proc);
    }
  }

  return enriched;
}

export async function findListenersOnPort(port: number): Promise<PortProcess[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return [];
  }

  if (process.platform === 'win32') {
    return findListenersWindows(port);
  }

  return findListenersUnix(port);
}

export async function killProcesses(
  pids: number[],
  force = true,
): Promise<{ killed: number[]; failed: Array<{ pid: number; error: string }> }> {
  const killed: number[] = [];
  const failed: Array<{ pid: number; error: string }> = [];
  const uniquePids = [...new Set(pids)].filter((pid) => pid > 0);

  for (const pid of uniquePids) {
    try {
      if (process.platform === 'win32') {
        const args = force
          ? ['/PID', String(pid), '/F']
          : ['/PID', String(pid)];
        const result = await run('taskkill', args);
        if (result.code === 0) {
          killed.push(pid);
        } else {
          failed.push({
            pid,
            error: result.stderr || result.stdout || 'taskkill failed',
          });
        }
      } else {
        const signal = force ? 'SIGKILL' : 'SIGTERM';
        process.kill(pid, signal);
        killed.push(pid);
      }
    } catch (error) {
      failed.push({
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { killed, failed };
}

export async function killPort(
  port: number,
  force = true,
): Promise<{ killed: number[]; failed: Array<{ pid: number; error: string }> }> {
  const listeners = await findListenersOnPort(port);
  if (listeners.length === 0) {
    return { killed: [], failed: [] };
  }
  return killProcesses(
    listeners.map((p) => p.pid),
    force,
  );
}
