# Setup and Commands

Use npm with the committed lockfile. The CLI requires Node.js 18 or later; CI uses Node.js 22.

```sh
npm ci
npm run electron:dev
```

`npm run dev` serves the browser demo at `http://127.0.0.1:5173`; real scanning requires Electron or the CLI.

Install the CLI from the repository:

```sh
npm run build:cli
npm install -g .
portkill 3000
```

The global npm executable directory must be on `PATH`. Local directory installations can be symlinks; keep the checkout and rebuild the CLI after changing it. For a portable package independent of the checkout, run `npm pack` and install the resulting `.tgz` with `npm install -g /path/to/portkiller-1.0.2.tgz`.

- `portkill 3000` force terminates TCP listeners, without confirmation.
- `portkill 3000 --graceful` requests termination (SIGTERM on Unix; taskkill without `/F` on Windows).
- `portkill --help` / `portkill --version` provide command information.
- Exit codes: `0` port is free, `1` scanning/termination/verification failure, `2` invalid arguments.

`npm test` builds the CLI and runs unit, command-mock, and real child-server integration tests. `npm run typecheck` checks UI, Electron, and CLI. `npm run build` compiles all three; `npm run electron:build` also packages desktop installers. `npm pack` rebuilds the CLI automatically via `prepack`; it includes no Electron runtime. VS Code tasks mirror these commands.

GitHub Actions runs checks, builds, packages, and installation smoke checks on macOS, Windows, and Linux. Publishing to npm is a separate release action, not part of CI.

See [[Architecture]] for operating-system tools and failure behavior.
