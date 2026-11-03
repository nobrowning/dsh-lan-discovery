import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const archive = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2]?.endsWith('.tgz'), 'Pass the final npm tarball path.');
const sourcePackage = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
assert.equal(basename(archive), `${sourcePackage.name}-${sourcePackage.version}.tgz`);
// A basename avoids GNU tar treating a Windows drive letter as a remote host.
// These arguments work with GNU tar and the BSD tar shipped by macOS/Windows.
const archiveFiles = execFileSync('tar', ['-tf', basename(archive)], { cwd: dirname(archive), encoding: 'utf8' }).trim().split(/\r?\n/);
for (const file of archiveFiles) {
  assert.ok(file.startsWith('package/'), `Unexpected archive path: ${file}`);
  assert.ok(!file.split('/').includes('..'), `Unsafe archive path: ${file}`);
  assert.ok(!/(^|\/)(\.git|\.runtime|\.reference|\.env|artifacts)(\/|$)/.test(file), `Private development path in package: ${file}`);
  assert.ok(!/\.(pem|key|p12|pfx)$/i.test(file), `Certificate or private-key material in package: ${file}`);
}
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check through npm run verify:release.');
// Resolve aliases once, including Windows 8.3 names and macOS /var symlinks.
const installRoot = await realpath(await mkdtemp(join(tmpdir(), 'dsh-release-check-')));
try {
  await writeFile(join(installRoot, 'package.json'), JSON.stringify({ name: 'dsh-release-check', private: true, type: 'module' }));
  execFileSync(process.execPath, [npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--cache', join(installRoot, 'empty-npm-cache'), archive], { cwd: installRoot, stdio: 'pipe' });
  const installedRoot = join(installRoot, 'node_modules', sourcePackage.name);
  assert.equal(await realpath(installedRoot), installedRoot, 'Package must be installed, not linked to a checkout.');
  const installedPackage = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
  assert.equal(installedPackage.version, sourcePackage.version);
  const requireInstalled = createRequire(join(installedRoot, 'package.json'));
  for (const dependency of ['@llm-discovery/discovery-core', 'multicast-dns', 'dns-packet', 'thunky', '@leichtgewicht/ip-codec']) {
    const resolved = requireInstalled.resolve(dependency);
    const localPath = relative(installRoot, await realpath(resolved));
    assert.ok(!isAbsolute(localPath) && !localPath.startsWith('..'), `${dependency} escaped the clean installation.`);
  }
  const plugin = await import(pathToFileURL(join(installedRoot, 'index.mjs')).href);
  assert.equal(plugin.name, 'lan-discovery');
  assert.equal(typeof plugin.apply, 'function');
  for (const entry of ['controller.mjs', 'responses.mjs', 'trust.mjs']) await import(pathToFileURL(join(installedRoot, entry)).href);
  assert.deepEqual(await readFile(join(installedRoot, 'client.js')), await readFile(join(sourceRoot, 'client.js')), 'Installed browser bundle differs from the tested bundle.');
  execFileSync(process.execPath, ['build-client.mjs', '--check'], { cwd: installedRoot, stdio: 'pipe' });
  execFileSync(process.execPath, ['verify.mjs'], { cwd: installedRoot, stdio: 'pipe' });
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(join(dirname(archive), 'SHA256SUMS'), `${sha256}  ${basename(archive)}\n`);
  console.log(JSON.stringify({ package: sourcePackage.name, version: sourcePackage.version, platform: process.platform, architecture: process.arch, node: process.version, archive: basename(archive), sha256, archiveFiles: archiveFiles.length, offlineInstallWithEmptyCache: true, bundledDependencies: 'verified', hostImports: 'passed', browserBundle: 'passed' }, null, 2));
} finally {
  // mkdtemp provides the unique, absolute directory owned by this check.
  await rm(installRoot, { recursive: true, force: true });
}
