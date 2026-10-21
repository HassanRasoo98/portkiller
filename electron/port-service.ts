import type { HostPortProcess, PortProcess } from '../shared/common-ports';
import { run } from './system-command';
import { findDockerListeners, stopContainers, isDockerProcess, type DockerSnapshot } from './docker-service';

export function uniqueByPid(processes: HostPortProcess[]): HostPortProcess[] {
  const seen = new Set<number>();
  return processes.filter((proc) => {
    if (seen.has(proc.pid)) return false;
    seen.add(proc.pid);
    return true;
  });
}

/** Parse `lsof -F pc` machine-readable output into processes. */
export function parseLsofFields(stdout: string): HostPortProcess[] {
  const processes: HostPortProcess[] = [];
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
export function parseLsofTable(stdout: string): HostPortProcess[] {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines[0]?.startsWith('COMMAND') ? lines.slice(1) : lines;
  const processes: HostPortProcess[] = [];

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
export function parseSs(stdout: string): HostPortProcess[] {
  const processes: HostPortProcess[] = [];
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

async function findListenersUnix(port: number): Promise<HostPortProcess[]> {
  const lsof = await run('lsof', [
    '-nP', '-Fpc', `-iTCP:${port}`, '-sTCP:LISTEN',
  ]);
  // lsof exits 1 with no diagnostics when there are no matching listeners.
  if (lsof.code === 0 || (lsof.code === 1 && !lsof.stderr.trim())) {
    return parseLsofFields(lsof.stdout);
  }

  const ss = await run('ss', ['-tlnp', `sport = :${port}`]);
  if (ss.code === 0) {
    const listeners = parseSs(ss.stdout);
    if (ss.stdout.split(/\r?\n/).some((line) => /^\s*LISTEN\s/.test(line) && !/pid=\d+/.test(line))) {
      throw new Error(`Cannot identify the listener on port ${port}. Try elevated privileges.`);
    }
    return listeners;
  }

  throw new Error(
    'Could not scan TCP listeners. Install lsof (macOS/Linux) or ss (Linux), ' +
    'and check permissions. ' + (lsof.stderr || ss.stderr).trim(),
  );
}

async function findListenersWindows(port: number): Promise<HostPortProcess[]> {
  const netstat = await run('netstat', ['-ano', '-p', 'tcp']);
  if (netstat.code !== 0) {
    throw new Error(`Could not scan TCP listeners with netstat: ${netstat.stderr || netstat.stdout}`);
  }

  const processes: HostPortProcess[] = [];
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

  const enriched = await Promise.all(
    unique.map(async (proc) => {
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
        return {
          ...proc,
          name: nameMatch?.[1] ?? proc.name,
          command: csv,
        };
      }
      return proc;
    }),
  );

  return enriched;
}

export async function findListenersOnPort(port: number, snapshot?: DockerSnapshot): Promise<PortProcess[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  const containers = (snapshot ?? await findDockerListeners()).get(port) ?? [];
  let native: HostPortProcess[];
  try {
    native = await (process.platform === 'win32' ? findListenersWindows(port) : findListenersUnix(port));
  } catch (error) {
    if (containers.length > 0) return containers;
    throw error;
  }
  // Docker forwarding processes are shared infrastructure, not kill targets.
  return [...containers, ...native.filter((proc) => !containers.length || !isDockerProcess(proc.name))];
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
  const uniquePids = [...new Set(pids)];

  for (const pid of uniquePids) {
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) {
      failed.push({ pid, error: 'Refusing to terminate an unsafe process ID' });
      continue;
    }
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
  const containers = listeners.filter((listener) => listener.containerId !== undefined);
  // Never terminate host processes while freeing a Docker-published port.
  // Other listeners on this port will be reported by the caller's verification.
  if (containers.length > 0) return stopContainers(containers, force);
  const native = listeners.filter((listener): listener is HostPortProcess => listener.pid !== undefined);
  if (native.some((listener) => isDockerProcess(listener.name))) {
    return { killed: [], failed: [{ pid: 0, error: 'Cannot identify the Docker container. Check Docker access; refusing to terminate shared Docker infrastructure.' }] };
  }
  return killProcesses(native.map((listener) => listener.pid), force);
}
