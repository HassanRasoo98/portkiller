import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export async function run(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      timeout: 10_000,
      // Explicit local endpoint must win over an inherited remote context.
      env: command === 'docker' && args.includes('--host')
        ? { ...process.env, DOCKER_CONTEXT: '', DOCKER_HOST: '' }
        : process.env,
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
      code: err.code ?? 'EXEC_FAILED',
    };
  }
}

