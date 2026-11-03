import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarnessCredentialStore } from '../credentials.mjs';

const identity = 'a'.repeat(64);
const otherIdentity = 'b'.repeat(64);
const ownKey = `lan-discovery/service-${identity}`;
const fixtureKey = 'fixture-synthetic-api-key';
const payload = (id = identity) => ({ schema: 'dsh-lan-discovery-credential/v1', identity: id, candidateId: 'fixture.local', apiKey: fixtureKey });
function fixture(entries = []) {
  const records = new Map(entries), calls = [];
  return {
    records, calls,
    async listRecords() { return [...records].map(([key, record]) => ({ key, kind: record.kind })); },
    async readRecord(key) { calls.push(['read', key]); return structuredClone(records.get(key)); },
    async modifyRecord(key, mutate) { calls.push(['modify', key]); const next = await mutate(structuredClone(records.get(key))); if (next !== undefined) records.set(key, structuredClone(next)); return next; },
    async deleteRecord(key) { calls.push(['delete', key]); records.delete(key); },
  };
}

test('saved credentials survive store recreation without entering metadata snapshots', async () => {
  const provider = fixture();
  const first = createHarnessCredentialStore(provider); await first.initialize();
  assert.equal(first.available, true);
  await first.set(identity, { apiKey: fixtureKey, candidateId: 'fixture.local' });
  const second = createHarnessCredentialStore(provider); await second.initialize();
  assert.equal(second.has(identity), true);
  assert.deepEqual(second.entries(), [{ identity, candidateId: 'fixture.local' }]);
  assert.equal(JSON.stringify(second.entries()).includes(fixtureKey), false);
  const snapshot = second.entries(); snapshot[0].candidateId = 'changed';
  assert.equal(second.entries()[0].candidateId, 'fixture.local');
  assert.equal(await second.get(identity), fixtureKey);
  await second.delete(identity);
  assert.equal(second.has(identity), false);
  const third = createHarnessCredentialStore(provider); await third.initialize();
  assert.deepEqual(third.entries(), []);
});

test('initialization reads only valid records owned by this plugin', async () => {
  const provider = fixture([
    ['other-plugin/service-private', { kind: 'grant', payload: { apiKey: 'unrelated' } }],
    ['lan-discovery/unrecognized-id', { kind: 'grant', payload: { apiKey: 'unrelated' } }],
    [ownKey, { kind: 'grant', payload: payload() }],
  ]);
  const store = createHarnessCredentialStore(provider); await store.initialize();
  assert.deepEqual(provider.calls, [['read', ownKey]]);
  await store.delete(identity);
  assert.equal(provider.records.size, 2);
});

test('per-operation reads see provider-side key rotation and deletion', async () => {
  const provider = fixture([[ownKey, { kind: 'grant', payload: payload() }]]);
  const store = createHarnessCredentialStore(provider); await store.initialize();
  provider.records.set(ownKey, { kind: 'grant', payload: { ...payload(), apiKey: 'rotated-fixture-key' } });
  assert.equal(await store.get(identity), 'rotated-fixture-key');
  provider.records.delete(ownKey);
  assert.equal(await store.get(identity), undefined);
  assert.equal(store.has(identity), false);
});

test('identity mismatches and malformed own records fail closed with fixed errors', async () => {
  for (const record of [
    { kind: 'grant', payload: payload(otherIdentity) },
    { kind: 'grant', payload: { ...payload(), apiKey: '' } },
    { kind: 'api-key', key: fixtureKey },
    { kind: 'grant', payload: { ...payload(), extra: fixtureKey } },
  ]) {
    const provider = fixture([[ownKey, record]]);
    const store = createHarnessCredentialStore(provider);
    await assert.rejects(store.initialize(), { code: 'CREDENTIAL_STORE_FAILED' });
    assert.equal(store.available, false);
    assert.deepEqual(store.entries(), []);
  }
});

test('missing provider supports an explicit session-only fallback', async () => {
  const store = createHarnessCredentialStore(undefined); await store.initialize();
  assert.equal(store.available, false);
  assert.equal(store.has(identity), false);
  assert.deepEqual(store.entries(), []);
  await assert.rejects(store.get(identity), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
  await assert.rejects(store.set(identity, { apiKey: fixtureKey, candidateId: 'fixture.local' }), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
});

test('provider failures never reveal raw exception text or corrupt cached state', async () => {
  const provider = fixture([[ownKey, { kind: 'grant', payload: payload() }]]);
  const store = createHarnessCredentialStore(provider); await store.initialize();
  const unsafe = () => { throw new Error(`provider failed with ${fixtureKey}`); };
  const check = error => error.code === 'CREDENTIAL_STORE_FAILED' && !error.message.includes(fixtureKey) && error.cause === undefined;
  provider.modifyRecord = unsafe;
  await assert.rejects(store.set(otherIdentity, { apiKey: fixtureKey, candidateId: 'new.local' }), check);
  assert.equal(store.has(otherIdentity), false);
  provider.deleteRecord = unsafe;
  await assert.rejects(store.delete(identity), check);
  assert.equal(store.has(identity), true);
  provider.readRecord = unsafe;
  await assert.rejects(store.get(identity), check);
});

test('invalid identities cannot escape the plugin namespace', async () => {
  const provider = fixture(); const store = createHarnessCredentialStore(provider); await store.initialize();
  await assert.rejects(store.set('../other-plugin/id', { apiKey: fixtureKey, candidateId: 'fixture.local' }), { code: 'CREDENTIAL_STORE_FAILED' });
  await assert.rejects(store.delete('other-plugin/id'), { code: 'CREDENTIAL_STORE_FAILED' });
  assert.deepEqual(provider.calls, []);
});
