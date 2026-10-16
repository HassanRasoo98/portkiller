# portkill

Free a local TCP port from your terminal. Works on macOS, Windows, and Linux with Node.js 18 or later.

```sh
npm install -g @hassan_rasool/portkill
portkill 3000
```

Or run it without installing globally:

```sh
npx @hassan_rasool/portkill 3000
```

The default command force terminates every process listening on the selected TCP port, then verifies that the port is free. It does not ask for confirmation. Terminating a process also stops any other ports or work handled by that process. An already-free port is a successful no-op.

```sh
portkill 5173 --graceful
portkill --help
portkill --version
```

`--graceful` requests termination instead of forcing it: SIGTERM on macOS/Linux, or taskkill without `/F` on Windows.

Exit codes:

- `0`: the port is free.
- `1`: scanning or termination failed, or the port remains occupied.
- `2`: invalid arguments; provide one integer port from 1 through 65535.

The package has no runtime npm dependencies and does not install or launch Electron. macOS/Linux require `lsof`, or `ss` on Linux; Windows uses built-in `netstat`, `tasklist`, and `taskkill`. Missing or failed scanning tools produce an error. Visibility and termination of another user's processes can require elevated privileges. If a process manager immediately restarts the listener, stop that manager before retrying.

Only TCP listeners on the local machine are supported. UDP, remote hosts, and other container/network namespaces are outside the command's scope.

Portkill is the CLI companion to [PortKiller's desktop UI](https://github.com/HassanRasoo98/portkiller). The UI remains available separately through the repository's desktop releases.

MIT licensed. [Source and issues](https://github.com/HassanRasoo98/portkiller).
