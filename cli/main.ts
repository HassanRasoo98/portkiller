import { findListenersOnPort, killProcesses } from '../electron/port-service';

const HELP = `Usage: portkill <port> [--graceful]

Free a TCP port by terminating its listening processes.

Examples:
  portkill 3000
  portkill 5173 --graceful

Options:
  --graceful      Request termination instead of forcing it
  -h, --help     Show help
  -v, --version  Show version

Port must be an integer from 1 to 65535. Default: force termination.
Exit codes: 0 = free, 1 = scan/kill failed, 2 = invalid usage.
`;

export async function runCli(args: string[], version: string): Promise<number> {
  if (args.length === 1 && ['-h', '--help'].includes(args[0])) {
    console.log(HELP);
    return 0;
  }
  if (args.length === 1 && ['-v', '--version'].includes(args[0])) {
    console.log(version);
    return 0;
  }

  const positional = args.filter((arg) => arg !== '--graceful');
  if (positional.length !== 1 || args.length > 2 || !/^\d+$/.test(positional[0])) {
    console.error('portkill: Expected a port number. Usage: portkill <port> [--graceful]');
    return 2;
  }
  const port = Number(positional[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('portkill: Port must be an integer from 1 to 65535.');
    return 2;
  }

  try {
    const listeners = await findListenersOnPort(port);
    if (listeners.length === 0) {
      console.log(`Port ${port} is already free.`);
      return 0;
    }

    const { killed, failed } = await killProcesses(
      listeners.map((listener) => listener.pid),
      !args.includes('--graceful'),
    );
    // Allow sockets to close, but don't hang on servers that ignore termination
    // or are immediately restarted by a process manager.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if ((await findListenersOnPort(port)).length === 0) {
        console.log(`Freed port ${port}${killed.length ? ` (PID ${killed.join(', ')})` : ''}.`);
        return 0;
      }
      if (failed.length > 0) break;
    }

    for (const failure of failed) {
      console.error(`portkill: PID ${failure.pid}: ${failure.error}`);
    }
    console.error(`portkill: Port ${port} is still in use. Check permissions or whether a process manager restarted the server.`);
    return 1;
  } catch (error) {
    console.error(`portkill: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
