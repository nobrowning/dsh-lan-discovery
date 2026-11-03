import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DiscoveryController } from '../controller.mjs';
import { loadTrust, authorizeCandidate, credentialError, validateApiKey } from '../trust.mjs';
import { createFetchHandler } from '../index.mjs';
import { createHarnessCredentialStore } from '../credentials.mjs';

const keys = { one: 'synthetic-key-one', two: 'synthetic-key-two', replacement: 'synthetic-replacement' };
async function fixture(t, provider) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-lan-credential-test-'));
  const trustFile = join(dir, 'trust.json');
  await writeFile(join(dir, 'ca.pem'), 'fixture-ca');
  const services = ['one', 'two', 'free'].map(id => ({ baseURL: `https://fixture.local/${id}`, allowedAddresses: ['127.0.0.1'], certificateSha256: 'a'.repeat(64), auth: id === 'free' ? 'none' : 'required' }));
  const document = { schema: 'llm-api-discovery-trust/v1', caFile: 'ca.pem', services };
  await writeFile(trustFile, JSON.stringify(document));
  const candidates = services.map((service, i) => ({ id: ['one', 'two', 'free'][i], instanceName: `fixture-${i}`, baseURL: service.baseURL, auth: service.auth, apiProfile: 'openresponses', protocolVersion: '2026-04-24', addresses: ['127.0.0.1'], validation: { valid: true }, expiresAt: Date.now() + 60000 }));
  const seen = [], adapters = new Map(); let current = { value: { provider: 'original', model: 'original' }, revision: 1 };
  const createController = () => new DiscoveryController({
    credentialStore: createHarnessCredentialStore(provider),
    config: { trustFile, autoStart: false },
    discovery: { subscribe() { return () => {}; }, snapshot: () => candidates, async start() {}, async stop() {} },
    defaults: { read: () => structuredClone(current), async compareAndSet(expected, value) { assert.deepEqual(expected, current); current = { value, revision: current.revision + 1 }; return structuredClone(current); } },
    llm: { registerAdapter(providers, adapter) { adapters.set(providers[0], adapter); return () => adapters.delete(providers[0]); } },
    transportFactory(binding, options) {
      let closed = false;
      const request = async (relative) => {
        if (closed) throw new Error('closed');
        const id = new URL(binding.baseURL).pathname.slice(1);
        const key = options.apiKey ?? await options.getApiKey?.();
        seen.push({ id, authenticated: key !== undefined });
        if (binding.auth === 'none') assert.equal(key, undefined);
        else if (key !== keys[id] && !(id === 'one' && key === keys.replacement)) throw credentialError('API_KEY_REJECTED');
        return relative === 'models' ? { data: [{ id: 'model' }] } : { schema: 'llm-api-discovery-capabilities/v1', models: [{ id: 'model', input_modalities: ['text'], streaming: 'supported' }] };
      };
      return { json: request, close() { closed = true; } };
    },
  });
  let controller = createController(); await controller.initialize();
  t.after(async () => { await controller.close(); const target = resolve(dir); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('dsh-lan-credential-test-')); await rm(target, { recursive: true, force: true }); });
  return { dir, get controller() { return controller; }, trustFile, document, candidates, seen, adapters, async restart() { await controller.close(); controller = createController(); await controller.initialize(); }, get current() { return current; }, selectProvider(provider, model = 'model') { current = { value: { provider, model }, revision: current.revision + 1 }; } };
}

function memoryProvider() {
  const records = new Map();
  return { records, async listRecords() { return [...records].map(([key, record]) => ({ key, kind: record.kind })); }, async readRecord(key) { return structuredClone(records.get(key)); }, async modifyRecord(key, fn) { records.set(key, structuredClone(await fn(records.get(key)))); }, async deleteRecord(key) { records.delete(key); } };
}

test('saved keys restore after restart while the free and unconfigured states remain distinct', async t => {
  const provider = memoryProvider(), f = await fixture(t, provider);
  await f.controller.setCredential('one', keys.one, { remember: true });
  await f.restart();
  assert.deepEqual(f.controller.snapshot().candidates.map(candidate => candidate.credential.source), ['saved', null, null]);
  assert.equal(f.controller.snapshot().credentialStorage.available, true);
  assert.ok(!JSON.stringify(f.controller.snapshot()).includes(keys.one));
  await f.controller.connect('one'); await f.controller.disconnect();
  await assert.rejects(f.controller.connect('two'), { code: 'API_KEY_REQUIRED' });
  await f.controller.connect('free'); await f.controller.disconnect();
  await f.controller.forgetCredential('one'); await f.restart();
  assert.equal(provider.records.size, 0);
  await assert.rejects(f.controller.connect('one'), { code: 'API_KEY_REQUIRED' });
});

test('verified saved replacement is atomic and switching to session removes the durable copy', async t => {
  const provider = memoryProvider(), f = await fixture(t, provider);
  await f.controller.setCredential('one', keys.one, { remember: true });
  await assert.rejects(f.controller.setCredential('one', 'wrong', { remember: true }), { code: 'API_KEY_REJECTED' });
  await f.restart(); await f.controller.connect('one'); await f.controller.disconnect();
  await f.controller.setCredential('one', keys.replacement, { remember: false });
  assert.equal(provider.records.size, 0);
  assert.equal(f.controller.snapshot().candidates[0].credential.source, 'session');
  await f.restart();
  await assert.rejects(f.controller.connect('one'), { code: 'API_KEY_REQUIRED' });
});

test('saved keys cannot follow an identity change and remain revocable after withdrawal', async t => {
  const provider = memoryProvider(), f = await fixture(t, provider);
  await f.controller.setCredential('one', keys.one, { remember: true }); await f.restart();
  f.document.services[0].certificateSha256 = 'b'.repeat(64); await writeFile(f.trustFile, JSON.stringify(f.document));
  await assert.rejects(f.controller.inspect('one'), { code: 'API_KEY_REQUIRED' });
  assert.equal(f.controller.snapshot().candidates[0].credential.retainedSaved, true);
  f.candidates.splice(0, 1); await f.controller.forgetCredential('one');
  assert.equal(provider.records.size, 0);
});

test('storage errors never claim a key was saved or replace a prior working key', async t => {
  const provider = memoryProvider(), f = await fixture(t, provider);
  await f.controller.setCredential('one', keys.one);
  provider.modifyRecord = async () => { throw new Error(keys.replacement); };
  await assert.rejects(f.controller.setCredential('one', keys.replacement, { remember: true }), error => error.code === 'CREDENTIAL_STORE_FAILED' && !error.message.includes(keys.replacement));
  assert.equal(f.controller.snapshot().candidates[0].credential.source, 'session');
  await f.controller.connect('one'); await f.controller.disconnect();
  const unavailable = await fixture(t);
  await assert.rejects(unavailable.controller.setCredential('one', keys.one, { remember: true }), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
  assert.equal(unavailable.seen.length, 0);
});

test('mixed services connect without a key or require successful explicit verification', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.controller.snapshot().candidates[0].credential, { required: true, configured: false, source: null });
  await assert.rejects(f.controller.connect('one'), { code: 'API_KEY_REQUIRED' });
  assert.equal(f.seen.length, 0, 'Missing key does not make a network request.');
  await f.controller.connect('free');
  assert.equal(f.current.value.model, 'model'); await f.controller.disconnect();
  await assert.rejects(f.controller.setCredential('one', 'synthetic-wrong'), { code: 'API_KEY_REJECTED' });
  assert.equal(f.controller.snapshot().candidates[0].credential.configured, false);
  await f.controller.setCredential('one', keys.one);
  assert.deepEqual(f.controller.snapshot().candidates[0].credential, { required: true, configured: true, source: 'session' });
  await f.controller.connect('one');
  assert.equal(f.adapters.size, 1);
  await assert.rejects(f.controller.setCredential('two', keys.one), { code: 'API_KEY_REJECTED' });
  assert.equal(f.controller.snapshot().candidates[1].credential.configured, false);
  await assert.rejects(f.controller.setCredential('free', keys.one), /does not accept/);
});

test('wrong replacements retain the working key; forgetting disconnects and restores defaults', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); await f.controller.connect('one');
  const adapter = [...f.adapters.values()][0];
  await assert.rejects(f.controller.setCredential('one', 'wrong'), { code: 'API_KEY_REJECTED' });
  await adapter.transport.json('models');
  await f.controller.setCredential('one', keys.replacement);
  await adapter.transport.json('models');
  await f.controller.forgetCredential('one');
  assert.equal(f.current.value.provider, 'original'); assert.equal(f.adapters.size, 0);
  await assert.rejects(adapter.transport.json('models'), /closed/);
  await assert.rejects(f.controller.connect('one'), { code: 'API_KEY_REQUIRED' });
});

test('session keys are absent from state, errors and persisted files and clear on unload', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); await f.controller.connect('one');
  const state = JSON.stringify(f.controller.snapshot());
  for (const key of Object.values(keys)) assert.ok(!state.includes(key));
  for (const file of await readdir(f.dir)) {
    const data = await readFile(join(f.dir, file), 'utf8');
    for (const key of Object.values(keys)) assert.ok(!data.includes(key), 'A session key must never reach disk.');
  }
  await f.controller.close();
  assert.equal(f.controller.snapshot().candidates[0].credential.configured, false);
});

test('authentication hints cannot downgrade trust or transfer keys to changed identities', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one);
  const trust = await loadTrust(f.trustFile);
  assert.throws(() => authorizeCandidate({ ...f.candidates[0], auth: 'none' }, trust), /authentication policy/);
  assert.throws(() => authorizeCandidate({ ...f.candidates[0], auth: undefined }, trust), /authentication policy/);
  f.document.services[0].certificateSha256 = 'b'.repeat(64);
  await writeFile(f.trustFile, JSON.stringify(f.document));
  const before = f.seen.length;
  await assert.rejects(f.controller.connect('one'), { code: 'API_KEY_REQUIRED' });
  assert.equal(f.seen.length, before);
  assert.equal(f.controller.snapshot().candidates[0].credential.configured, false);
});

test('forget revokes locally retained keys and routes after identity change or withdrawal', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); await f.controller.connect('one');
  f.document.services[0].certificateSha256 = 'b'.repeat(64); await writeFile(f.trustFile, JSON.stringify(f.document));
  await assert.rejects(f.controller.inspect('one'), { code: 'API_KEY_REQUIRED' });
  assert.equal(f.controller.snapshot().candidates[0].credential.retainedSession, true);
  f.candidates.splice(0, 1);
  await f.controller.forgetCredential('one');
  assert.equal(f.adapters.size, 0); assert.equal(f.current.value.provider, 'original');
});

test('forget restores an active LAN default manually reselected after connecting another service', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); const one = await f.controller.connect('one');
  await f.controller.setCredential('two', keys.two); await f.controller.connect('two');
  f.selectProvider(one.provider); await f.controller.forgetCredential('one');
  assert.equal(f.current.value.provider, 'original'); assert.equal(f.adapters.size, 1);
  await f.controller.disconnect(); assert.equal(f.current.value.provider, 'original');
});

test('forget restores a manually changed model on the target provider', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); const one = await f.controller.connect('one');
  f.selectProvider(one.provider, 'user-selected-other-model');
  await f.controller.forgetCredential('one');
  assert.equal(f.current.value.provider, 'original'); assert.equal(f.adapters.size, 0);
});

test('forget retains a recovery baseline for remaining routes after clearing the latest connection', async t => {
  const f = await fixture(t); await f.controller.setCredential('one', keys.one); const one = await f.controller.connect('one');
  await f.controller.setCredential('two', keys.two); await f.controller.connect('two');
  await f.controller.forgetCredential('two');
  assert.equal(f.controller.state.lastWritten, null);
  f.selectProvider(one.provider); await f.controller.forgetCredential('one');
  assert.equal(f.current.value.provider, 'original'); assert.equal(f.adapters.size, 0);
});

test('key routes validate bounded input and never echo malformed credential JSON', async t => {
  const f = await fixture(t), handler = createFetchHandler(f.controller);
  const request = (action, body) => new Request(`http://host/api/lan-discovery/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  for (const apiKey of ['', 'with space', '\nsecret', 'x'.repeat(4097), null]) {
    const response = await handler(request('credential', { candidateId: 'one', apiKey }));
    assert.equal(response.status, 400); assert.equal((await response.json()).code, 'API_KEY_INVALID');
  }
  for (const remember of ['true', 1, null, {}]) assert.equal((await handler(request('credential', { candidateId: 'one', apiKey: keys.one, remember }))).status, 400);
  const malformed = await handler(request('credential', `{"apiKey":"${keys.one}",`));
  assert.equal((await malformed.json()).error, 'Invalid JSON control request.');
  const rejected = await handler(request('credential', { candidateId: 'one', apiKey: 'wrong-key' }));
  assert.deepEqual(await rejected.json(), { error: 'The API key was rejected by this service.', code: 'API_KEY_REJECTED' });
  assert.equal((await handler(request('credential', { candidateId: 'one', apiKey: keys.one }))).status, 200);
  assert.equal((await handler(request('forget-credential', { candidateId: 'one' }))).status, 200);
  assert.throws(() => validateApiKey('bad\r\nHeader:value'), { code: 'API_KEY_INVALID' });
});
