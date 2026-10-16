import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run publish:cli.');

execFileSync(process.execPath, [
  npmCli, 'publish', path.join(root, `portkill-${version}.tgz`),
  '--access', 'public', '--registry', 'https://registry.npmjs.org/',
], { cwd: root, stdio: 'inherit' });
