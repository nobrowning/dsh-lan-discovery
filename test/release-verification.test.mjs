import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the actual package verifies through an aliased temporary directory', async (t) => {
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run package tests through npm test.');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-package-path-test-')));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const temporary = join(directory, 'real temporary');
  const alias = join(directory, 'temporary alias');
  await mkdir(temporary);
  await symlink(temporary, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const pkg = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  const archive = join(directory, `${pkg.name}-${pkg.version}.tgz`);
  execFileSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--pack-destination', directory], { cwd: sourceRoot, stdio: 'pipe' });
  const env = { ...process.env, TMPDIR: alias, TMP: alias, TEMP: alias };
  // Exercise the GNU tar available on Windows CI, whose absolute-path parsing
  // previously mistook D:\\... for a remote archive. Other hosts use their tar.
  if (process.platform === 'win32' && process.env.ProgramFiles) {
    const gitBin = join(process.env.ProgramFiles, 'Git', 'usr', 'bin');
    if (await access(join(gitBin, 'tar.exe')).then(() => true, () => false)) {
      const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
      env[pathKey] = `${gitBin}${delimiter}${env[pathKey] ?? ''}`;
    }
  }
  const result = execFileSync(process.execPath, [npmCli, 'run', 'verify:release', '--', archive], { cwd: sourceRoot, env, encoding: 'utf8' });
  assert.match(result, /"offlineInstallWithEmptyCache": true/);
  assert.match(result, /"hostImports": "passed"/);
  assert.match(result, /"browserBundle": "passed"/);
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  assert.equal(await readFile(join(directory, 'SHA256SUMS'), 'utf8'), `${sha256}  ${pkg.name}-${pkg.version}.tgz\n`);
});
