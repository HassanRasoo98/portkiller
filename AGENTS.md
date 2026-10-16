# PortKiller development

- Stack: React 19 + TypeScript + Vite renderer, Electron desktop shell, Node CLI. Use npm and keep `package-lock.json` synchronized.
- `src/` contains the UI; browser-only development uses a demo API. `electron/main.ts` and `preload.ts` provide real operations through IPC.
- `electron/port-service.ts` is Node-only shared scanning/termination code used by both Electron and the CLI. Do not add Electron imports to it. Scan TCP listeners only; never infer PIDs from port numbers or diagnostic text.
- `shared/common-ports.ts` defines port presets and types. `cli/main.ts` handles CLI arguments and verification; `bin/portkill.cjs` is the executable npm entry point.
- Run `npm ci`, `npm run electron:dev` for the desktop app, or `npm run dev` for the browser demo. There is no separate backend service.
- `npm run build:cli` creates `dist-cli/`; `npm run build` builds renderer, Electron, and CLI. `npm run electron:build` packages desktop installers.
- Validate with `npm test` and `npm run typecheck`. CLI tests include a real disposable listener; never use personal running services as kill targets. `npm test` builds the CLI first. Rebuild with `npm run build:cli` when changing code during test watch.
- `npm pack` builds and packages the CLI; npm installs do not need Electron. For local installation, build the CLI then run `npm install -g .`. Do not publish without an explicit request.
- Desktop packaging uses `build/` icons, per-platform `electron:build:*` scripts, and `.github/workflows/release.yml` for version-tag releases. `scripts/release-tag.mjs` manages release tags.
- Preserve existing UI components and styles. Maintain `.vscode/tasks.json` and affected notes in `portkiller-obsidian-docs/` when architecture or commands change.
