import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadTrust, authorizeCandidate, createPinnedTransport, validateApiKey, credentialError } from './trust.mjs';
import { ResponsesAdapter, modelDisplayName } from './responses.mjs';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const selection = value => ({ provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) });

export function harnessDefaults(settings, namespace = 'agent-default-model') {
  return {
    read() {
      const descriptor = settings.describe({ redactSecrets: true }).find(row => row.ns === namespace);
      if (!descriptor || typeof descriptor.value?.provider !== 'string' || typeof descriptor.value?.model !== 'string') throw new Error('The installed Harness default-model settings seam is unavailable.');
      return { value: selection(descriptor.value), revision: descriptor.revision };
    },
    async compareAndSet(expected, next) {
      const current = this.read();
      if (current.revision !== expected.revision || !same(current.value, expected.value)) throw new Error('The default model changed concurrently; reconnect using the current settings.');
      const ops = [{ op: 'set', path: ['provider'], value: next.provider }, { op: 'set', path: ['model'], value: next.model }, next.reasoningEffort === undefined ? { op: 'unset', path: ['reasoningEffort'] } : { op: 'set', path: ['reasoningEffort'], value: next.reasoningEffort }];
      await settings.mutate(namespace, ops, expected.revision);
      const written = this.read();
      if (!same(written.value, next)) throw new Error('The default model write did not become effective.');
      return written;
    }
  };
}

function validateModels(catalog, capabilities) {
  if (!Array.isArray(catalog?.data)) throw new Error('The model-list response is invalid.');
  const catalogById = new Map(catalog.data.map(model => [model.id, model]));
  if (!['llm-api-discovery-capabilities/v1', 'llm-discovery-demo-capabilities/v1'].includes(capabilities?.schema) || !Array.isArray(capabilities.models)) throw new Error('Capability information is unavailable or unsupported.');
  const label = (value, field, limit) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid model ${field} metadata.`);
    return value.trim();
  };
  const models = capabilities.models.filter(model => catalogById.has(model.id)).map(model => {
    if (typeof model.id !== 'string' || !model.id || !Array.isArray(model.input_modalities) || !model.input_modalities.includes('text') || model.input_modalities.some(item => !['text', 'image'].includes(item))) throw new Error('A model has unsupported input capabilities.');
    const displayName = label(model.display_name ?? catalogById.get(model.id).name, 'display_name', 256);
    let deployment;
    if (model.deployment !== undefined) {
      if (!model.deployment || typeof model.deployment !== 'object' || Array.isArray(model.deployment)) throw new Error('Invalid model deployment metadata.');
      deployment = Object.fromEntries(['parameters', 'quantization', 'version'].map(field => [field, label(model.deployment[field], `deployment.${field}`, 64)]).filter(([, value]) => value !== undefined));
    }
    return { id: model.id, ...(displayName === undefined ? {} : { display_name: displayName }), ...(deployment === undefined ? {} : { deployment }), input_modalities: [...model.input_modalities], streaming: model.streaming ?? 'unknown', function_calling: model.function_calling ?? 'unknown' };
  });
  if (!models.length) throw new Error('No model appears in both the catalog and capabilities.');
  return models;
}

export class DiscoveryController {
  #credentials = new Map();
  #trust;
  constructor({ discovery, config = {}, llm, defaults, attribution = {}, readImage, onRequestDiagnostics, credentialStore, transportFactory = createPinnedTransport }) {
    this.discovery = discovery; this.config = config; this.llm = llm; this.defaults = defaults; this.attribution = attribution; this.readImage = readImage; this.onRequestDiagnostics = onRequestDiagnostics; this.transportFactory = transportFactory;
    this.credentialStore = credentialStore; this.credentialStorageError = null;
    this.routes = new Map(); this.details = new Map(); this.events = []; this.lastRequestDiagnostics = null; this.running = false; this.error = null; this.recoveryError = null; this.recoveryPending = false; this.closed = false; this.tail = Promise.resolve(); this.state = { schema: 'dsh-lan-discovery-state/v1', baseline: null, lastWritten: null }; this.abort = new AbortController();
    this.unsub = discovery.subscribe(event => { this.events.unshift({ at: new Date().toISOString(), type: event.type, instanceName: event.candidate?.instanceName, reason: event.reason }); this.events.length = Math.min(this.events.length, 80); if (event.candidate?.id) this.details.delete(event.candidate.id); });
  }
  serial(fn) { const task = this.tail.then(fn); this.tail = task.catch(() => {}); return task; }
  get stateFile() { return this.config.stateFile ? resolve(this.config.stateFile) : this.config.trustFile ? resolve(dirname(this.config.trustFile), 'plugin-state.json') : undefined; }
  async initialize() {
    try { await this.credentialStore?.initialize(); }
    catch { this.credentialStorageError = 'CREDENTIAL_STORE_FAILED'; }
    if (this.config.trustFile) {
      try { this.#trust = await loadTrust(this.config.trustFile); }
      catch { this.error = 'Unsupported local trust document.'; }
    }
    if (this.stateFile) {
      try { const stored = JSON.parse(await readFile(this.stateFile, 'utf8')); if (stored.schema === this.state.schema) this.state = stored; }
      catch (error) { if (error.code !== 'ENOENT') this.recoveryError = 'The plugin state file could not be read; automatic recovery is disabled.'; }
    }
    // Config writes reconcile the entire Loader. Never await one from plugin
    // activation: that reconciliation would wait for this activation itself.
    this.recoveryPending = !!(this.state.lastWritten && this.state.baseline);
    if (this.config.autoStart !== false) await this.start();
  }
  async persist() {
    if (!this.stateFile) throw new Error('Configure trustFile before changing a provider.');
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.stateFile);
  }
  async start() { if (this.running) return; try { await this.discovery.start(); this.running = true; this.error = null; } catch (error) { this.error = `Discovery could not start: ${error.message}`; throw error; } }
  async stop() { await this.discovery.stop(); this.running = false; }
  candidates() { const value = this.discovery.snapshot(); return Array.isArray(value) ? value : value.candidates ?? []; }
  credentialStatus(candidate) {
    let binding;
    try { if (this.#trust) binding = authorizeCandidate(candidate, this.#trust); } catch { /* No secret metadata for an untrusted candidate. */ }
    const required = binding ? binding.auth === 'required' : candidate.auth !== 'none';
    const source = binding && required ? this.#credentials.has(binding.identity) ? 'session' : this.credentialStore?.has(binding.identity) ? 'saved' : binding.tokenFile ? 'file' : null : null;
    const retainedSession = source !== 'session' && [...this.#credentials.values()].some(entry => entry.candidateId === candidate.id);
    const retainedSaved = source !== 'saved' && (this.credentialStore?.entries() ?? []).some(entry => entry.candidateId === candidate.id);
    return { required, configured: source !== null, source, ...(retainedSession ? { retainedSession: true } : {}), ...(retainedSaved ? { retainedSaved: true } : {}) };
  }
  snapshot() {
    return { schema: 'dsh-lan-discovery-ui/v1', running: this.running, error: this.recoveryError ?? this.error, recovery: { pending: this.recoveryPending, error: this.recoveryError }, trustConfigured: !!this.config.trustFile,
      credentialStorage: { available: this.credentialStore?.available === true && !this.credentialStorageError, ...(this.credentialStorageError ? { code: this.credentialStorageError } : {}) },
      candidates: this.candidates().map(candidate => ({ ...candidate, credential: this.credentialStatus(candidate), details: this.details.get(candidate.id) ?? null })),
      connections: [...this.routes.values()].map(route => ({ provider: route.binding.provider, baseURL: route.binding.baseURL, instanceName: route.binding.instanceName, models: route.models, model: route.model })), events: [...this.events], lastRequestDiagnostics: structuredClone(this.lastRequestDiagnostics) };
  }
  findCandidate(id) {
    const candidate = this.candidates().find(item => item.id === id);
    if (!candidate) throw new Error('The service is no longer present on the current network.');
    if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() <= Date.now()) throw new Error('The discovery records expired.');
    return candidate;
  }
  async prepare(id, apiKey) {
    let transport;
    try {
      const candidate = this.findCandidate(id);
      const trust = await loadTrust(this.config.trustFile);
      this.#trust = trust;
      const binding = authorizeCandidate(candidate, trust);
      if (apiKey !== undefined && binding.auth === 'none') throw new Error('This service does not accept an API key.');
      if (binding.auth === 'required' && apiKey === undefined && !this.#credentials.has(binding.identity) && !this.credentialStore?.has(binding.identity) && !binding.tokenFile) throw credentialError('API_KEY_REQUIRED');
      transport = this.transportFactory(binding, { attribution: this.attribution, ...(apiKey === undefined ? { getApiKey: async () => binding.auth === 'none' ? undefined : this.#credentials.get(binding.identity)?.apiKey ?? (this.credentialStore?.has(binding.identity) ? await this.credentialStore.get(binding.identity) : undefined) } : { apiKey }) });
      const [catalog, capabilities] = await Promise.all([transport.json('models', { signal: this.abort.signal }), transport.json(this.config.demoMode === true ? '_demo/capabilities' : '_llm/capabilities', { signal: this.abort.signal })]);
      const models = validateModels(catalog, capabilities);
      // Reject a record update that arrived while authenticated metadata was being read.
      const latest = authorizeCandidate(this.findCandidate(id), await loadTrust(this.config.trustFile));
      if (latest.identity !== binding.identity) throw new Error('The discovered service changed while it was being checked.');
      const details = { status: 'verified', checkedAt: new Date().toISOString(), mock: capabilities.mock === true, nodeLabel: capabilities.node_label ?? capabilities.demo_node_label, models, compatible: models.some(model => model.streaming === 'supported') };
      this.details.set(id, details);
      return { binding, transport, models, trust, mock: capabilities.mock === true };
    } catch (error) { transport?.close(); this.details.set(id, { status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}) }); throw error; }
  }
  setCredential(id, apiKey, { remember = false } = {}) { return this.serial(async () => {
    validateApiKey(apiKey);
    if (typeof remember !== 'boolean') throw new Error('remember must be a boolean.');
    if (remember && (!this.credentialStore?.available || this.credentialStorageError)) throw Object.assign(new Error('Saved API keys are unavailable in this Harness Host.'), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
    const prepared = await this.prepare(id, apiKey);
    prepared.transport.close();
    // Only successfully verified keys can be retained. Saved credentials use
    // the Host's dedicated credential provider, never settings or the journal.
    const identity = prepared.binding.identity;
    if (remember) {
      await this.credentialStore.set(identity, { apiKey, candidateId: id });
      this.#credentials.delete(identity);
    } else {
      if (this.credentialStore?.has(identity)) await this.credentialStore.delete(identity);
      this.#credentials.set(identity, { apiKey, candidateId: id });
    }
    return this.details.get(id);
  }); }
  forgetCredential(id) { return this.serial(async () => {
    // Revocation uses locally owned identities, not the latest untrusted DNS
    // record. It must still work after withdrawal or an identity change.
    const identities = new Set([...this.#credentials].filter(([, value]) => value.candidateId === id).map(([identity]) => identity));
    for (const entry of this.credentialStore?.entries() ?? []) if (entry.candidateId === id) identities.add(entry.identity);
    // An equivalent independently authorized candidate may have a new DNS ID.
    try { identities.add(authorizeCandidate(this.findCandidate(id), this.#trust).identity); } catch { /* Clearing needs no network authorization. */ }
    const routes = [...this.routes.values()].filter(route => route.binding.candidateId === id || identities.has(route.binding.identity));
    for (const route of routes) identities.add(route.binding.identity);
    for (const identity of identities) if (this.credentialStore?.has(identity)) await this.credentialStore.delete(identity);
    const providers = new Set(routes.map(route => route.binding.provider));
    if (providers.size) {
      const current = this.defaults.read();
      if (providers.has(current.value.provider) && !same(current.value, this.state.lastWritten)) {
        const baseline = this.state.baseline ?? routes.find(route => route.binding.provider === current.value.provider)?.baseline;
        if (!baseline || baseline.provider.startsWith('lan-')) throw new Error('Recovery baseline refers to a removed LAN route.');
        await this.defaults.compareAndSet(current, baseline);
      }
    }
    if (providers.has(this.state.lastWritten?.provider)) {
      await this.restoreDefault(); this.recoveryPending = false; this.recoveryError = null;
    }
    for (const route of routes) { route.unregister(); route.transport.close(); this.routes.delete(route.binding.provider); }
    for (const identity of identities) this.#credentials.delete(identity);
    this.details.delete(id);
    return { cleared: true };
  }); }
  inspect(id) { return this.serial(async () => { const result = await this.prepare(id); result.transport.close(); return this.details.get(id); }); }
  connect(id, modelId) { return this.serial(async () => {
    if (this.recoveryPending) throw new Error('Restore the previous LAN default with Disconnect before connecting again.');
    const prepared = await this.prepare(id);
    const model = prepared.models.find(model => model.id === modelId) ?? (!modelId ? prepared.models[0] : undefined);
    if (!model || model.streaming !== 'supported') { prepared.transport.close(); throw new Error('Discovered successfully, but this model does not support the streaming client contract.'); }
    const before = this.defaults.read();
    const next = { provider: prepared.binding.provider, model: model.id };
    let route = this.routes.get(next.provider); let created = false;
    if (!route) {
      const adapter = new ResponsesAdapter({ ...prepared, demoMode: this.config.demoMode === true, readImage: this.readImage, onRequestDiagnostics: diagnostic => { this.lastRequestDiagnostics = diagnostic; this.onRequestDiagnostics?.(diagnostic); } });
      const unregister = this.llm.registerAdapter([next.provider], adapter);
      const baseline = this.state.baseline ?? (before.value.provider.startsWith('lan-') ? this.routes.get(before.value.provider)?.baseline : before.value);
      route = { ...prepared, model: model.id, baseline, adapter, unregister }; this.routes.set(next.provider, route); created = true;
    } else prepared.transport.close();
    const previousState = structuredClone(this.state);
    try {
      if (!this.state.lastWritten || !same(before.value, this.state.lastWritten)) this.state.baseline = before.value;
      // Persist recovery intent before the conditional user-setting write.
      this.state.lastWritten = next; await this.persist();
      await this.defaults.compareAndSet(before, next);
      route.model = model.id;
      return { provider: next.provider, model: next.model, modelName: modelDisplayName(model, prepared.mock), connected: true, nextSession: true };
    } catch (error) {
      this.state = previousState; await this.persist().catch(() => {});
      if (created) { route.unregister(); route.transport.close(); this.routes.delete(next.provider); }
      throw error;
    }
  }); }
  async restoreDefault() {
    if (!this.state.lastWritten || !this.state.baseline) return { restored: false };
    const current = this.defaults.read();
    let restored = false;
    if (same(current.value, this.state.lastWritten)) {
      if (this.state.baseline.provider.startsWith('lan-')) throw new Error('Recovery baseline refers to a removed LAN route.');
      await this.defaults.compareAndSet(current, this.state.baseline); restored = true;
    }
    this.state.baseline = null; this.state.lastWritten = null; await this.persist();
    return { restored };
  }
  async recoverDefault() { return this.serial(async () => {
    try { const result = await this.restoreDefault(); this.recoveryPending = false; this.recoveryError = null; return result; }
    catch (error) { this.recoveryError = `Default-model recovery is pending. Use Disconnect to retry: ${error.message}`; throw error; }
  }); }
  disconnect() { return this.serial(async () => {
    let result;
    try { result = await this.restoreDefault(); this.recoveryPending = false; this.recoveryError = null; }
    catch (error) { this.recoveryError = `Default-model recovery is pending. Use Disconnect to retry: ${error.message}`; throw error; }
    for (const route of this.routes.values()) { route.unregister(); route.transport.close(); }
    this.routes.clear(); return result;
  }); }
  // Unload/HMR may already own the Loader transaction. Leave the CAS journal
  // intact instead of nesting a config write or blocking shutdown on it.
  async close() { this.closed = true; this.abort.abort(); await this.tail; for (const route of this.routes.values()) { route.unregister(); route.transport.close(); } this.routes.clear(); this.#credentials.clear(); this.unsub?.(); await this.stop(); }
}
