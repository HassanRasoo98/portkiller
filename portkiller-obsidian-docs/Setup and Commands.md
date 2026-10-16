# Setup and Commands

Use npm with the committed lockfile. The CLI requires Node.js 18 or later; CI uses Node.js 22.

```sh
npm ci
npm run electron:dev
```

`npm run dev` serves the browser demo at `http://127.0.0.1:5173`; real scanning requires Electron or the CLI.

Install with `npm install -g @hassan_rasool/portkill` or run `npx @hassan_rasool/portkill 3000`. The terminal command remains `portkill <port>`.

Install the CLI from the repository:

```sh
npm run build:cli
npm install -g .
portkill 3000
```

The global npm executable directory must be on `PATH`. Local directory installations can be symlinks; keep the checkout and rebuild the CLI after changing it. For a portable package independent of the checkout, run `npm run pack:cli` and install the resulting `.tgz` with `npm install -g /path/to/portkill-1.0.2.tgz`.

- `portkill 3000` force terminates TCP listeners, without confirmation.
- `portkill 3000 --graceful` requests termination (SIGTERM on Unix; taskkill without `/F` on Windows).
- `portkill --help` / `portkill --version` provide command information.
- Exit codes: `0` port is free, `1` scanning/termination/verification failure, `2` invalid arguments.

`npm test` builds the CLI and runs unit, command-mock, and real child-server integration tests. `npm run typecheck` checks UI, Electron, and CLI. `npm run build` compiles all three; `npm run electron:build` also packages desktop installers. `npm run pack:cli` stages and packs only the compiled CLI, executable, CLI README, license, and generated public manifest. The tarball has no npm runtime dependencies. The root desktop package is private; npm name `portkiller` is owned by an unrelated project. VS Code tasks mirror these commands.

GitHub Actions runs checks, builds, packages, and installation smoke checks on macOS, Windows, and Linux. Publishing to npm is a separate release action, not part of CI. Run `npm login --registry=https://registry.npmjs.org`, then `npm run publish:cli` to validate and publish `@hassan_rasool/portkill` with the root package version. Complete any interactive npm authentication challenge in your browser.

See [[Architecture]] for operating-system tools and failure behavior.

The unscoped `portkill` name was rejected by npm on 2026-10-17 because of similarity to `port-kill`; the public package uses the authenticated account scope `@hassan_rasool/portkill`. The executable is still `portkill`.
