import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const dir = fileURLToPath(new URL('.', import.meta.url));
for (const file of (await readdir(dir)).filter(name => name.endsWith('.mjs') || name === 'client.js')) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
let registration;
vm.runInNewContext(await readFile(new URL('client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { registration = value; } } } });
if (registration?.id !== 'dsh-lan-discovery' || typeof registration.factory !== 'function') throw new Error('Invalid Desktop client bundle.');
const plugin = registration.factory(name => { if (name === 'react') return { createElement() {} }; throw new Error(`Unexpected client external: ${name}`); });
if (typeof plugin.apply !== 'function' || !plugin.inject.includes('slots')) throw new Error('Invalid browser plugin exports.');
console.log('Host ESM syntax and Desktop ModuleLoader browser bundle verified.');
