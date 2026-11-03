import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createFetchHandler, registerControlRoutes } from '../index.mjs';

function request(path, method = 'GET', body) {
  return new Request(`http://host/api/lan-discovery/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test('control routes fail closed without the native authenticated exact-route registry', () => {
  assert.throws(() => registerControlRoutes({}, {}), /authenticated Fetch-route registry/);
  const routes = []; const disposed = [];
  const stop = registerControlRoutes({}, { fetch: { register(route) { routes.push(route); return () => disposed.push(route.path); } } });
  assert.equal(routes.length, 8);
  assert.ok(routes.every(route => route.path.startsWith('/api/lan-discovery/') && route.requestBody === 'buffered'));
  assert.deepEqual(routes.find(route => route.path.endsWith('/state')).methods, ['GET']);
  assert.ok(routes.filter(route => !route.path.endsWith('/state')).every(route => route.methods.join() === 'POST'));
  stop(); assert.equal(disposed.length, 8);
});

test('admitted Fetch requests preserve read/write operations and reject oversized control bodies', async () => {
  const seen = []; const controller = { snapshot() { return { candidates: [] }; }, async connect(id, model) { seen.push([id, model]); return { connected: true }; } };
  const handler = createFetchHandler(controller);
  const state = await handler(request('state')); assert.equal(state.status, 200);
  assert.deepEqual(await state.json(), { candidates: [] });
  assert.equal((await handler(request('connect'))).status, 405);
  const connected = await handler(request('connect', 'POST', { candidateId: 'candidate', modelId: 'model' }));
  assert.equal(connected.status, 200); assert.deepEqual(seen, [['candidate', 'model']]);
  const oversized = await handler(request('connect', 'POST', { candidateId: 'x'.repeat(9000) }));
  assert.equal(oversized.status, 400); assert.equal(seen.length, 1);
  for (const body of [{ candidateId: [] }, { candidateId: 'candidate', modelId: '' }, { candidateId: 'candidate', baseURL: 'https://unapproved.invalid' }]) {
    assert.equal((await handler(request('connect', 'POST', body))).status, 400);
  }
  assert.equal(seen.length, 1, 'Malformed fields must not reach the controller.');
});

async function client(globals = {}) {
  let definition;
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { ...globals, window: { __ModuleLoader__: { load(value) { definition = value; } } } });
  return definition.factory(name => { assert.equal(name, 'react'); return { createElement() {} }; });
}

test('dsh-app client uses shell-forwarded standard fetch without undocumented transport globals', async () => {
  const routes = new Map(); const seen = [];
  const stop = registerControlRoutes({ snapshot() { return { running: true, candidates: ['real-host'] }; }, async connect(id) { seen.push(id); return { connected: true }; } }, { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } });
  let calls = 0;
  const plugin = await client({ location: { protocol: 'dsh-app:' }, async fetch(path, init) { calls++; assert.match(path, /^api\/lan-discovery\//); const req = new Request(new URL(path, 'http://owned-host/'), init); return routes.get(new URL(req.url).pathname).fetch(req); } });
  const api = plugin.createApi();
  assert.deepEqual(await api('state'), { running: true, candidates: ['real-host'] });
  await api('connect', { candidateId: 'candidate' });
  assert.equal(calls, 2); assert.deepEqual(seen, ['candidate']); stop();
});

test('non-JSON Host errors are readable and authenticated JSON errors are preserved', async () => {
  const denied = await client({ async fetch() { return new Response(JSON.stringify({ error: 'Harness authentication failed.' }), { status: 401, headers: { 'content-type': 'application/json' } }); } });
  await assert.rejects(denied.createApi()('state'), /authentication failed/);
  const bad = await client({ async fetch() { return new Response('not found', { status: 404 }); } });
  await assert.rejects(bad.createApi()('state'), error => error.i18nKey === 'error.hostResponse' && error.params.status === 404);
});

test('Desktop client exports resolve and register real sidebar/main slots with cleanup', async () => {
  let definition;
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { definition = value; } } } });
  const plugin = definition.factory(name => { assert.equal(name, 'react'); return { createElement() {} }; });
  const registered = []; const removed = []; const effects = [];
  plugin.apply({
    effect(fn) { effects.push(fn()); },
    locale: { register() { return () => {}; }, bind() { return key => key; }, subscribe() { return () => {}; }, getSnapshot() { return { active: 'en', revision: 0 }; } },
    slots: { inject(_slot, fn) { effects.push(fn()); }, register(options) { registered.push(options); return () => removed.push(options.name); } },
    layout: { panelInfo: { getSnapshot() { return { activePanelId: 'lan-discovery' }; } }, selectPanel(value) { assert.equal(value, null); } },
    uiWorkspace: { startSession() {} }
  });
  assert.ok(registered.some(row => row.name === 'main' && row.key === 'lan-discovery'));
  assert.ok(registered.some(row => row.name === 'sidebar.panellist' && row.id === 'lan-discovery'));
  for (const effect of effects) effect?.();
  assert.ok(removed.includes('main')); assert.ok(removed.includes('sidebar.panellist'));
});
