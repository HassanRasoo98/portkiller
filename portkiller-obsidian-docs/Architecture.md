# Architecture

- `src/`: React UI, filters, scan state, and browser demo API. The real desktop API comes from `electron/preload.ts`.
- `electron/main.ts`: Electron lifecycle and scan/kill IPC; invokes the Node-only `electron/port-service.ts`.
- `shared/common-ports.ts`: port definitions and TypeScript interfaces.
- `cli/main.ts`: validates a single port before any operations, scans, terminates listener PIDs, and polls up to ten times at 100 ms intervals to verify release. Errors and still-occupied ports return nonzero exit codes.
- `bin/portkill.cjs`: npm executable wrapper; loads `dist-cli/cli/main.js` and sets the process exit code.
- `scripts/package-cli.mjs`: creates `.npm-package/` from the compiled CLI and a generated `@hassan_rasool/portkill` manifest. `scripts/publish-cli.mjs` publishes the exact versioned tarball; npm credentials remain in the local npm login, never in source.
- `tsconfig.cli.json`: compiles only CLI/service/shared code to `dist-cli/`, without Electron imports. Desktop output remains in `dist-electron/`, renderer assets in `dist/`.

Both clients share listener detection and termination. Unix detection uses machine-readable `lsof -Fpc` restricted to TCP LISTEN sockets, with Linux `ss -tlnp` as a fallback. Windows detection uses `netstat -ano -p tcp`, matches local LISTENING ports (IPv4 or IPv6), and enriches names with `tasklist`. PIDs are deduplicated. Broader connected-socket queries and `fuser` are not used to choose kill targets.

Commands run with `execFile` and argument arrays, without a shell, with a 10-second timeout. Unix termination uses `kill -9` by default or `kill -TERM`; Windows uses `taskkill /PID` with `/F` by default. PID 0, PID 1, invalid PIDs, and the running process itself are refused. Missing/failed scanning tools are errors, not proof a port is free.

Process visibility depends on OS permissions. Scanning cannot manage a remote host, a different container/network namespace, or UDP ports. Linux needs `lsof` or `ss`; Windows uses built-in tools. A process manager may immediately restart a listener; stop its manager if verification reports the port remains occupied. Elevated privileges may be needed to see or terminate another user's process. Force termination may discard unsaved work in the owning app.

See [[Setup and Commands]] for installation and validation.
