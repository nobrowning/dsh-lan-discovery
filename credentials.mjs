// Host-owned durable storage. This module never reads the Host credential file;
// its provider decides how credentials are persisted and protected at rest.
const SCOPE = 'lan-discovery';
const SCHEMA = 'dsh-lan-discovery-credential/v1';
const IDENTITY = /^[0-9a-f]{64}$/;
const OWN_KEY = /^lan-discovery\/service-([0-9a-f]{64})$/;
const MAX_RECORDS = 1024;

export function credentialStoreError(code = 'CREDENTIAL_STORE_FAILED') {
  return Object.assign(new Error(code === 'CREDENTIAL_STORE_UNAVAILABLE'
    ? 'The Harness credential store is unavailable.'
    : 'The Harness credential store could not complete this operation.'), { code });
}

function keyFor(identity) {
  if (typeof identity !== 'string' || !IDENTITY.test(identity)) throw credentialStoreError();
  return `${SCOPE}/service-${identity}`;
}

function validPayload(payload, identity) {
  return !!payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).length === 4
    && payload.schema === SCHEMA && payload.identity === identity
    && typeof payload.candidateId === 'string' && payload.candidateId.trim().length > 0
    && payload.candidateId.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(payload.candidateId)
    && typeof payload.apiKey === 'string' && /^[\x21-\x7e]{1,4096}$/.test(payload.apiKey);
}

function readPayload(record, identity) {
  if (record === undefined) return undefined;
  if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).length !== 2 || record.kind !== 'grant'
      || !validPayload(record.payload, identity)) throw credentialStoreError();
  return record.payload;
}

/**
 * Adapt the official Host record API to immutable, independently trusted service
 * identities. Metadata is cached for synchronous UI snapshots; each API request
 * reads its key from the provider again so removals/rotations take effect.
 */
export function createHarnessCredentialStore(provider) {
  const metadata = new Map();
  const supported = ['listRecords', 'readRecord', 'modifyRecord', 'deleteRecord'].every(name => typeof provider?.[name] === 'function');
  let available = false;

  function requireAvailable() { if (!available) throw credentialStoreError('CREDENTIAL_STORE_UNAVAILABLE'); }
  function remember(identity, payload) {
    if (payload) metadata.set(identity, { identity, candidateId: payload.candidateId });
    else metadata.delete(identity);
  }
  async function protect(operation) {
    try { return await operation(); }
    catch { throw credentialStoreError(); }
  }

  return {
    get available() { return available; },
    async initialize() {
      available = false; metadata.clear();
      if (!supported) return;
      await protect(async () => {
        const rows = await provider.listRecords();
        if (!Array.isArray(rows)) throw credentialStoreError();
        const ownRows = rows.filter(row => typeof row?.key === 'string' && OWN_KEY.test(row.key));
        if (ownRows.length > MAX_RECORDS) throw credentialStoreError();
        const loaded = new Map();
        for (const row of ownRows) {
          const identity = OWN_KEY.exec(row.key)[1];
          const payload = readPayload(await provider.readRecord(row.key), identity);
          if (payload) loaded.set(identity, { identity, candidateId: payload.candidateId });
        }
        for (const [identity, entry] of loaded) metadata.set(identity, entry);
        available = true;
      });
    },
    has(identity) { return available && metadata.has(identity); },
    entries() { return [...metadata.values()].map(entry => ({ ...entry })); },
    async get(identity) {
      requireAvailable();
      return protect(async () => {
        const payload = readPayload(await provider.readRecord(keyFor(identity)), identity);
        remember(identity, payload);
        return payload?.apiKey;
      });
    },
    async set(identity, { apiKey, candidateId }) {
      requireAvailable();
      return protect(async () => {
        const key = keyFor(identity);
        const payload = { schema: SCHEMA, identity, candidateId, apiKey };
        if (!validPayload(payload, identity)) throw credentialStoreError();
        await provider.modifyRecord(key, () => ({ kind: 'grant', payload }));
        remember(identity, payload);
      });
    },
    async delete(identity) {
      requireAvailable();
      return protect(async () => {
        await provider.deleteRecord(keyFor(identity));
        metadata.delete(identity);
      });
    },
  };
}
