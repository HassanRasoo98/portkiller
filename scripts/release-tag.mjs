#!/usr/bin/env node
/**
 * Bump package.json version (optional), create an annotated tag, and print
 * the push command that triggers the Release workflow.
 *
 * Usage:
 *   node scripts/release-tag.mjs           # tag current package.json version
 *   node scripts/release-tag.mjs patch     # bump patch, then tag
 *   node scripts/release-tag.mjs minor
 *   node scripts/release-tag.mjs major
 *   node scripts/release-tag.mjs 1.2.3     # set exact version, then tag
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const arg = process.argv[2];

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if ([major, minor, patch].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid version in package.json: ${version}`);
  }
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind: ${kind}`);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
let nextVersion = pkg.version;

if (arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    nextVersion = arg;
  } else if (['major', 'minor', 'patch'].includes(arg)) {
    nextVersion = bump(pkg.version, arg);
  } else {
    console.error(
      'Usage: node scripts/release-tag.mjs [patch|minor|major|x.y.z]',
    );
    process.exit(1);
  }

  if (nextVersion !== pkg.version) {
    pkg.version = nextVersion;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    run('git', ['add', 'package.json']);
    run('git', [
      'commit',
      '-m',
      `chore: release v${nextVersion}`,
    ]);
    console.log(`Committed version bump → v${nextVersion}`);
  }
}

const tag = `v${nextVersion}`;
const existing = run('git', ['tag', '-l', tag]);
if (existing === tag) {
  console.error(`Tag ${tag} already exists. Bump the version first.`);
  process.exit(1);
}

run('git', ['tag', '-a', tag, '-m', `PortKiller ${tag}`]);
console.log(`Created tag ${tag}`);
console.log('');
console.log('Push the commit (if any) and tag to trigger GitHub Releases:');
console.log(`  git push origin HEAD && git push origin ${tag}`);
console.log('');
console.log(
  'Artifacts (macOS dmg/zip, Windows exe, Linux AppImage/deb) will appear on:',
);
console.log('  https://github.com/HassanRasoo98/portkiller/releases');
