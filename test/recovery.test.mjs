import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DiscoveryController } from '../controller.mjs';
import { scheduleDefaultRecovery } from '../index.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-lan-recovery-test-'));
  const stateFile = join(directory, 'state.json');
  const baseline = { provider: 'original-provider', model: 'original-model', reasoningEffort: 'high' };
  const lastWritten = { provider: 'lan-fixture', model: 'mock-tools' };
  await writeFile(stateFile, JSON.stringify({ schema: 'dsh-lan-discovery-state/v1', baseline, lastWritten }));
  let current = { value: lastWritten, revision: 3 }, writes = 0, nested = false;
  const controller = new DiscoveryController({
    discovery: { subscribe() { return () => {}; }, snapshot() { return []; }, async start() {}, async stop() {} },
    config: { stateFile }, llm: {},
    defaults: { read() { return structuredClone(current); }, async compareAndSet(expected, value) {
      if (nested) throw new Error('HMR transactions cannot be nested');
      assert.deepEqual(expected, current); writes++; current = { value: structuredClone(value), revision: current.revision + 1 };
      return structuredClone(current);
    } }
  });
  t.after(async () => {
    await controller.close();
    const target = resolve(directory); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('dsh-lan-recovery-test-'));
    await rm(target, { recursive: true, force: true });
  });
  return { controller, stateFile, baseline, get current() { return current; }, get writes() { return writes; }, set nested(value) { nested = value; }, editAsUser() { current = { value: { provider: 'user-new', model: 'keep-me' }, revision: current.revision + 1 }; } };
}

test('activation completes without a config write; recovery waits for Loader settlement', async t => {
  const f = await fixture(t);
  await f.controller.initialize();
  assert.equal(f.writes, 0); assert.equal(f.controller.snapshot().recovery.pending, true);
  let resolveLoader;
  const loaderSettled = new Promise(resolve => { resolveLoader = resolve; });
  const recovery = scheduleDefaultRecovery(f.controller, loaderSettled);
  await Promise.resolve(); assert.equal(f.writes, 0);
  resolveLoader(); await recovery.completion;
  assert.equal(f.writes, 1); assert.deepEqual(f.current.value, f.baseline);
  assert.equal(f.controller.snapshot().recovery.pending, false);
  const state = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(state.baseline, null); assert.equal(state.lastWritten, null);
});

test('nested HMR recovery stays visible across scan start and Disconnect can retry with no routes', async t => {
  const f = await fixture(t); f.nested = true;
  await f.controller.initialize();
  await scheduleDefaultRecovery(f.controller, Promise.resolve()).completion;
  assert.equal(f.controller.snapshot().connections.length, 0);
  assert.equal(f.controller.snapshot().recovery.pending, true);
  assert.match(f.controller.snapshot().error, /HMR transactions cannot be nested/);
  await f.controller.stop(); await f.controller.start();
  assert.match(f.controller.snapshot().error, /recovery is pending/);
  f.nested = false;
  assert.equal((await f.controller.disconnect()).restored, true);
  assert.equal(f.controller.snapshot().error, null); assert.equal(f.writes, 1);
});

test('unload preserves the recovery journal without reentering settings; later user edits win', async t => {
  const f = await fixture(t); await f.controller.initialize();
  let resolveLoader;
  const recovery = scheduleDefaultRecovery(f.controller, new Promise(resolve => { resolveLoader = resolve; }));
  recovery.cancel(); await f.controller.close(); resolveLoader(); await recovery.completion;
  assert.equal(f.writes, 0);
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).lastWritten.provider, 'lan-fixture');
  const fresh = await fixture(t); await fresh.controller.initialize(); fresh.editAsUser();
  await scheduleDefaultRecovery(fresh.controller, Promise.resolve()).completion;
  assert.equal(fresh.writes, 0); assert.equal(fresh.current.value.model, 'keep-me');
  assert.equal(fresh.controller.snapshot().recovery.pending, false);
});
