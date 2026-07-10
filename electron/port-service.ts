import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PortProcess } from '../shared/common-ports';

const execFileAsync = promisify(execFile);

export function uniqueByPid(processes: PortProcess[]): PortProcess[] {
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

/** Parse `lsof -F pc` machine-readable output into processes. */
export function parseLsofFields(stdout: string): PortProcess[] {
  const processes: PortProcess[] = [];
  let pid: number | null = null;
  let name = 'unknown';

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const code = line[0];
    const value = line.slice(1);

    if (code === 'p') {
      if (pid !== null) {
        processes.push({ pid, name });
      }
      const nextPid = Number(value);
      pid = Number.isFinite(nextPid) && nextPid > 0 ? nextPid : null;
      name = 'unknown';
    } else if (code === 'c' && pid !== null) {
      name = value || name;
    }
  }

  if (pid !== null) {
    processes.push({ pid, name });
  }

  return uniqueByPid(processes);
}

/** Parse classic tabular `lsof` output. */
export function parseLsofTable(stdout: string): PortProcess[] {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines[0]?.startsWith('COMMAND') ? lines.slice(1) : lines;
  const processes: PortProcess[] = [];

  for (const line of dataLines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const pid = Number(parts[1]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    processes.push({
      pid,
      name,
      user: parts[2],
      command: line,
    });
  }

  return uniqueByPid(processes);
}

/** Parse `lsof -t` PID-only output, ignoring the listened port number. */
export function parseLsofPids(stdout: string, port: number): number[] {
  return [
    ...new Set(
      stdout
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => Number(token))
        .filter(
          (pid) =>
            Number.isFinite(pid) &&
            Number.isInteger(pid) &&
            pid > 0 &&
            pid !== port,
        ),
    ),
  ];
}

/** Parse `ss -tlnp` output for a port. */
export function parseSs(stdout: string): PortProcess[] {
  const processes: PortProcess[] = [];
  const pidRegex = /pid=(\d+)/g;
  const nameRegex = /users:\(\("([^"]+)"/g;
  const pids: number[] = [];
  const names: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pidRegex.exec(stdout)) !== null) {
    pids.push(Number(match[1]));
  }
  while ((match = nameRegex.exec(stdout)) !== null) {
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

/**
 * Parse fuser output carefully so the port number in `3000/tcp:` is never
 * treated as a PID (this was the macOS ESRCH bug).
 */
export function parseFuser(stdout: string, stderr: string, port: number): number[] {
  const combined = `${stdout} ${stderr}`.trim();
  if (!combined) return [];

  // Common forms:
  //   "3000/tcp:           12345"
  //   "12345"
  //   "3000/tcp: 12345 12346"
  const afterColon = combined.includes(':')
    ? combined.slice(combined.indexOf(':') + 1)
    : combined;

  return [
    ...new Set(
      [...afterColon.matchAll(/\b(\d+)\b/g)]
        .map((match) => Number(match[1]))
        .filter(
          (pid) =>
            Number.isFinite(pid) &&
            Number.isInteger(pid) &&
            pid > 0 &&
            pid !== port,
        ),
    ),
  ];
}

async function processNameForPid(pid: number): Promise<string> {
  const ps = await run('ps', ['-p', String(pid), '-o', 'comm=']);
  if (ps.code === 0 && ps.stdout.trim()) {
    return ps.stdout.trim().split('/').pop() || `pid-${pid}`;
  }
  return `pid-${pid}`;
}

async function enrichPids(
  pids: number[],
  port: number,
): Promise<PortProcess[]> {
  const filtered = pids.filter((pid) => pid > 0 && pid !== port);
  const processes = await Promise.all(
    filtered.map(async (pid) => ({
      pid,
      name: await processNameForPid(pid),
    })),
  );
  return uniqueByPid(processes);
}

async function findListenersUnix(port: number): Promise<PortProcess[]> {
  // 1) Best: machine-readable lsof fields (reliable on macOS + Linux)
  // Accept non-zero exit codes — lsof often exits 1 even with useful stdout.
  const lsofFields = await run('lsof', [
    '-nP',
    '-Fpc',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
  ]);
  if (lsofFields.stdout.trim()) {
    const parsed = parseLsofFields(lsofFields.stdout).filter(
      (proc) => proc.pid !== port,
    );
    if (parsed.length > 0) return parsed;
  }

  // 2) PID-only lsof (-t). Very common on macOS tooling.
  const lsofPids = await run('lsof', [
    '-nP',
    '-tiTCP:' + String(port),
    '-sTCP:LISTEN',
  ]);
  if (lsofPids.stdout.trim()) {
    const pids = parseLsofPids(lsofPids.stdout, port);
    if (pids.length > 0) return enrichPids(pids, port);
  }

  // 3) Broader tabular lsof without LISTEN filter (still TCP for this port)
  const lsofLoose = await run('lsof', ['-nP', `-iTCP:${port}`]);
  if (lsofLoose.stdout.trim()) {
    const fromTable = parseLsofTable(lsofLoose.stdout).filter(
      (proc) => proc.pid !== port,
    );
    if (fromTable.length > 0) return fromTable;
  }

  // 4) Linux ss
  const ss = await run('ss', ['-tlnp', `sport = :${port}`]);
  if (ss.stdout.trim()) {
    const parsed = parseSs(ss.stdout).filter((proc) => proc.pid !== port);
    if (parsed.length > 0) return parsed;
  }

  // 5) fuser — never treat the port number as a PID
  const fuser = await run('fuser', [`${port}/tcp`]);
  const fuserPids = parseFuser(fuser.stdout, fuser.stderr, port);
  if (fuserPids.length > 0) return enrichPids(fuserPids, port);

  return [];
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
    if (!Number.isFinite(pid) || pid <= 0 || pid === port) continue;

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

function isNoSuchProcessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === 'ESRCH' ||
    Boolean(err.message && /ESRCH|no such process/i.test(err.message))
  );
}

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === 'EPERM' ||
    Boolean(
      err.message && /EPERM|operation not permitted|access is denied/i.test(err.message),
    )
  );
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
          const detail = result.stderr || result.stdout || 'taskkill failed';
          // Already exited
          if (/not found|no running instance/i.test(detail)) {
            killed.push(pid);
          } else {
            failed.push({ pid, error: detail.trim() });
          }
        }
      } else {
        // Prefer kill(1) on Unix — clearer errors and matches user expectations on macOS.
        const args = force ? ['-9', String(pid)] : ['-TERM', String(pid)];
        const result = await run('kill', args);
        if (result.code === 0) {
          killed.push(pid);
        } else {
          const detail = `${result.stderr} ${result.stdout}`.trim() || 'kill failed';
          if (/no such process/i.test(detail)) {
            // Process already gone — treat as success for this PID
            killed.push(pid);
          } else {
            failed.push({ pid, error: detail });
          }
        }
      }
    } catch (error) {
      if (isNoSuchProcessError(error)) {
        killed.push(pid);
      } else if (isPermissionError(error)) {
        failed.push({
          pid,
          error: 'Permission denied — try running PortKiller with elevated privileges',
        });
      } else {
        failed.push({
          pid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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

  // Never attempt to kill the port number itself if it slipped through
  const pids = listeners.map((p) => p.pid).filter((pid) => pid !== port);
  if (pids.length === 0) {
    return {
      killed: [],
      failed: [
        {
          pid: 0,
          error: `Could not resolve a real process ID for port ${port}`,
        },
      ],
    };
  }

  return killProcesses(pids, force);
}
