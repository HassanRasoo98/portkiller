import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = path.join(root, '.npm-package');
const source = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

// The desktop manifest stays private. Ship only the compiled Node CLI,
// without desktop dependencies, build tooling, or lifecycle install scripts.
const manifest = {
  name: '@hassan_rasool/portkill',
  version: source.version,
  description: 'Free a local TCP port with one command: portkill 3000. Works on macOS, Windows, and Linux.',
  license: source.license,
  author: source.author,
  homepage: source.homepage,
  repository: source.repository,
  bugs: { url: 'https://github.com/HassanRasoo98/portkiller/issues' },
  keywords: ['portkill', 'kill-port', 'tcp', 'cli', 'developer-tools', 'cross-platform'],
  bin: { portkill: 'bin/portkill.cjs' },
  files: ['bin/', 'dist-cli/', 'LICENSE', 'README.md'],
  engines: source.engines,
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
};

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
for (const entry of ['bin', 'dist-cli', 'LICENSE']) {
  await cp(path.join(root, entry), path.join(staging, entry), { recursive: true });
}
await cp(path.join(root, 'cli/README.md'), path.join(staging, 'README.md'));
await writeFile(path.join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run pack:cli.');
const output = execFileSync(process.execPath, [
  npmCli, 'pack', staging, '--pack-destination', root, '--json',
], { cwd: root, encoding: 'utf8' });
const [packed] = JSON.parse(output);
const artifact = `portkill-${source.version}.tgz`;
await rename(path.join(root, packed.filename), path.join(root, artifact));
console.log(`Created ${artifact} (${packed.size} bytes) for ${manifest.name}@${manifest.version}`);
for (const file of packed.files) console.log(`  ${file.path}`);
