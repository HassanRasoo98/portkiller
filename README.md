# PortKiller

Open-source, cross-platform desktop app that scans common local ports, shows which processes are holding them, and frees ports with one click.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-0b6e6a)
![License](https://img.shields.io/badge/license-MIT-1f7a4d)

## Features

- **Common port presets** — web servers, databases, caches, queues, containers, and more
- **Live status** — see which ports are free vs occupied, with process name and PID
- **One-click kill** — free a blocked port from the interactive UI
- **Filters** — search, category, and free/in-use filters
- **Custom ports** — add any TCP port (1–65535) and scan it
- **Cross-platform** — macOS, Windows, and Linux via Electron

## Screenshots / UI

The main window shows:

1. **PortKiller** brand + scan action
2. Search / category / status filters
3. A list of ports with **Free** or **In use** state
4. **Kill & free** on occupied rows

> Tip: running `npm run dev` opens the UI in the browser with a safe demo backend. Use `npm run electron:dev` for real port scanning and process killing.

## Quick start

```bash
npm install
npm run electron:dev
```

Browser-only UI preview (demo data, no real kills):

```bash
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run electron:dev` | Vite + Electron with live reload |
| `npm run dev` | Vite UI only (demo API) |
| `npm run build` | Typecheck/compile renderer + Electron main |
| `npm run electron:build` | Package installers with electron-builder |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript checks |

## How it works

| Platform | Detect listeners | Kill process |
| --- | --- | --- |
| macOS / Linux | `lsof` (fallback: `ss`, `fuser`) | `SIGKILL` / `SIGTERM` |
| Windows | `netstat` + `tasklist` | `taskkill /F` |

Protected system processes may require elevated privileges. If a kill fails, the UI shows the error and suggests running as administrator / with sudo where appropriate.

## Common ports included

Examples: `3000`, `5173`, `8080`, `5432`, `3306`, `27017`, `6379`, `9200`, `5672`, `19000`, and others. Full list lives in [`shared/common-ports.ts`](shared/common-ports.ts).

## Project layout

```
electron/          Main process, preload, port scan/kill
shared/            Shared port definitions and types
src/               React UI
```

## Security notes

- Renderer runs with `contextIsolation` and no Node integration
- Port scan / kill only via IPC from the preload bridge
- Killing processes is destructive — only free ports you intend to reclaim

## Contributing

Issues and PRs are welcome. Keep changes focused; add tests for port-list and service behavior when practical.

## License

MIT — see [LICENSE](LICENSE).
