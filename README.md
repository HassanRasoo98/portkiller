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
| `npm run electron:build` | Package for the current OS |
| `npm run electron:build:mac` | macOS `.dmg` + `.zip` (x64 + arm64) |
| `npm run electron:build:win` | Windows NSIS installer + portable `.exe` |
| `npm run electron:build:linux` | Linux AppImage + `.deb` |
| `npm run release:tag` | Create a `v*` git tag (optionally bump version) |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript checks |

## GitHub Releases (all platforms)

CI builds installers on **macOS, Windows, and Linux** and attaches them to a GitHub Release when you push a version tag.

### 1. Ship a release (recommended)

```bash
# optionally bump version + commit, then create annotated tag
npm run release:tag patch    # or: minor | major | 1.2.3

# push commit + tag — triggers .github/workflows/release.yml
git push origin HEAD && git push origin v1.0.1
```

Or tag manually:

```bash
git tag -a v1.0.0 -m "PortKiller v1.0.0"
git push origin v1.0.0
```

### 2. What gets published

| Platform | Artifacts |
| --- | --- |
| macOS | `PortKiller-*-mac-x64.dmg`, `PortKiller-*-mac-arm64.dmg` (+ zip) |
| Windows | NSIS installer `.exe`, portable `.exe` |
| Linux | `.AppImage`, `.deb` |

Find them on the [Releases](https://github.com/HassanRasoo98/portkiller/releases) page after the workflow finishes.

### 3. Local packaging (single OS only)

```bash
npm run electron:build:mac     # on a Mac
npm run electron:build:win     # on Windows (or use CI)
npm run electron:build:linux   # on Linux
```

Outputs land in `release/`. You cannot reliably cross-compile all three platforms from one machine — use the GitHub Actions workflow for full coverage.

### 4. macOS Gatekeeper / signing (optional)

CI publishes **unsigned** Mac builds by default (Gatekeeper may require **Right-click → Open** the first time).

To notarize signed builds later, configure Apple Developer cert secrets and update the macOS packaging step to enable `CSC_IDENTITY_AUTO_DISCOVERY` with `CSC_LINK` / notarization credentials.

## How it works

| Platform | Detect listeners | Kill process |
| --- | --- | --- |
| macOS / Linux | `lsof` (fallback: `ss`, `fuser`) | `kill -9` / `SIGTERM` |
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

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Kill fails with permission errors | Quit the owning app, or relaunch PortKiller with elevated privileges |
| Port still shows in use after kill | Hit **Rescan** — some servers respawn (e.g. process managers) |
| macOS “Could not kill: \<port\> (ESRCH)” on older builds | Update to the latest PortKiller — PID detection no longer confuses the port number with a process ID |

## Security notes

- Renderer runs with `contextIsolation` and no Node integration
- Port scan / kill only via IPC from the preload bridge
- Killing processes is destructive — only free ports you intend to reclaim

## Contributing

Issues and PRs are welcome. Keep changes focused; add tests for port-list and service behavior when practical.

## License

MIT — see [LICENSE](LICENSE).
