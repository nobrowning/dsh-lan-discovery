import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiscoveryClient, serviceRecords } from '@llm-discovery/discovery-core';
import { DiscoveryController } from '../controller.mjs';
import { createFetchHandler, discoveryOptions } from '../index.mjs';
import { createHarnessCredentialStore } from '../credentials.mjs';
import { credentialError } from '../trust.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) { if (predicate()) return; await delay(5); }
  assert.fail('Timed out waiting for controller network transition');
}

async function roamingFixture(t, { sameService = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-roaming-test-'));
  const credentials = new Map();
  const provider = {
    async listRecords() { return [...credentials].map(([key, record]) => ({ key, kind: record.kind })); },
    async readRecord(key) { return structuredClone(credentials.get(key)); },
    async modifyRecord(key, callback) { credentials.set(key, structuredClone(await callback(credentials.get(key)))); },
    async deleteRecord(key) { credentials.delete(key); },
  };
  const company = { host: 'company.local', port: 8443, address: '10.20.0.30', certificate: 'a'.repeat(64), key: 'synthetic-company-key' };
  const home = sameService ? company : { host: 'home.local', port: 9443, address: '192.168.2.30', certificate: 'b'.repeat(64), key: 'synthetic-home-key' };
  for (const service of [company, home]) service.baseURL = `https://${service.host}:${service.port}/v1`;
  const services = [...new Map([company, home].map(service => [service.baseURL, service])).values()];
  const trustFile = join(dir, 'trust.json');
  await writeFile(join(dir, 'ca.pem'), 'test-only-ca');
  await writeFile(trustFile, JSON.stringify({ schema: 'llm-api-discovery-trust/v1', caFile: 'ca.pem', services: services.map(service => ({ baseURL: service.baseURL, certificateSha256: service.certificate, allowedAddresses: [service.address], auth: 'required' })) }));
  let network = 'company';
  const sockets = [], transports = [], requests = [], adapters = new Map();
  const config = { interfaceMode: 'auto', interfaceAddress: '10.20.0.2', trustFile, autoStart: false };
  const discovery = createDiscoveryClient({ ...discoveryOptions(config), networkCheckIntervalMs: 5,
    networkInterfaces: () => network === 'offline' ? {} : { en0: [{ address: network === 'company' || sameService ? '10.20.0.2' : '192.168.2.2', family: 'IPv4', internal: false }] },
    resolveNetworkAttachment: ({ interfaces }) => interfaces.length ? { interfaceAddress: interfaces[0].address, networkId: network } : null,
    transportFactory(socketConfig) {
      const socket = new EventEmitter(); socket.config = socketConfig; socket.destroyed = 0;
      socket.query = (_packet, callback) => callback?.();
      socket.destroy = callback => { socket.destroyed++; callback?.(); };
      sockets.push(socket); queueMicrotask(() => socket.emit('ready')); return socket;
    },
  });
  const original = { provider: 'original-provider', model: 'original-model', reasoningEffort: 'high' };
  let current = { value: structuredClone(original), revision: 1 };
  const controller = new DiscoveryController({ discovery, config, credentialStore: createHarnessCredentialStore(provider),
    defaults: { read: () => structuredClone(current), async compareAndSet(expected, value) { assert.deepEqual(expected, current); current = { value: structuredClone(value), revision: current.revision + 1 }; return structuredClone(current); } },
    llm: { registerAdapter(names, adapter) { assert.equal(names.length, 1); assert.equal(adapters.has(names[0]), false); adapters.set(names[0], adapter); return () => adapters.delete(names[0]); } },
    transportFactory(binding, options) {
      const service = services.find(service => service.baseURL === binding.baseURL);
      assert.ok(service, 'Only independently authorized endpoints may create a transport');
      assert.equal(binding.certificateSha256, service.certificate);
      assert.deepEqual(binding.addresses, [service.address]);
      const transport = {
        binding, closed: false,
        async json(relative) {
          assert.equal(this.closed, false);
          const key = options.apiKey ?? await options.getApiKey?.();
          requests.push({ endpoint: binding.baseURL, certificate: binding.certificateSha256, correctCredential: key === service.key });
          if (key !== service.key) throw credentialError('API_KEY_REJECTED');
          return relative === 'models' ? { data: [{ id: 'assistant' }] } : { schema: 'llm-api-discovery-capabilities/v1', models: [{ id: 'assistant', input_modalities: ['text'], streaming: 'supported' }] };
        },
        close() { this.closed = true; },
      };
      transports.push(transport); return transport;
    },
  });
  const fetch = createFetchHandler(controller);
  const control = (action, body = {}) => fetch(new Request(`http://host/api/lan-discovery/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const state = async () => (await fetch(new Request('http://host/api/lan-discovery/state'))).json();
  function announce(service, socket = sockets.at(-1)) {
    socket.emit('response', { answers: serviceRecords({ instanceName: 'Shared Assistant', hostname: service.host, address: service.address, port: service.port, basePath: '/v1', auth: 'required' }) });
    return discovery.snapshot()[0];
  }
  await controller.initialize(); assert.equal((await control('start')).status, 200);
  t.after(async () => { await controller.close(); await rm(dir, { recursive: true, force: true }); });
  return { controller, discovery, control, state, announce, company, home, sockets, transports, requests, credentials, adapters, original,
    get current() { return structuredClone(current); },
    move(to) { network = to; },
  };
}

test('company-to-home roaming keeps old routes unavailable and same-named service credentials separate', async t => {
  const f = await roamingFixture(t);
  const office = f.announce(f.company);
  assert.equal((await f.control('credential', { candidateId: office.id, apiKey: f.company.key, remember: true })).status, 200);
  const officeResponse = await f.control('connect', { candidateId: office.id }); assert.equal(officeResponse.status, 200);
  const officeConnection = await officeResponse.json();
  const officeRoute = f.controller.routes.get(officeConnection.provider), officeTransport = officeRoute.transport;
  const selectedOffice = f.current, savedOffice = structuredClone([...f.credentials]);
  f.move('offline'); await until(() => f.discovery.status === 'waiting' && f.discovery.snapshot().length === 0);
  let state = await f.state();
  assert.equal(state.error, null); assert.equal(state.network.attachment, null);
  assert.equal(state.connections[0].available, false); assert.equal(officeTransport.closed, true);
  assert.deepEqual(f.current, selectedOffice); assert.deepEqual([...f.credentials], savedOffice);
  const beforeOfflineRequest = f.requests.length;
  await assert.rejects(officeRoute.adapter.stream({}).next(), { code: 'SERVICE_UNAVAILABLE' });
  assert.equal(f.requests.length, beforeOfflineRequest);
  const stale = await f.control('connect', { candidateId: office.id });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'SERVICE_UNAVAILABLE');

  f.move('home'); await until(() => f.sockets.length === 2 && f.discovery.status === 'discovering');
  f.sockets[0].emit('response', { answers: serviceRecords({ instanceName: 'Shared Assistant', hostname: f.company.host, address: f.company.address, port: f.company.port, basePath: '/v1', auth: 'required' }) });
  assert.deepEqual(f.discovery.snapshot(), [], 'The old network socket cannot repopulate the list');
  const home = f.announce(f.home);
  assert.equal(home.instanceName, office.instanceName); assert.notEqual(home.id, office.id);
  state = await f.state();
  assert.equal(state.network.attachment.interfaceAddress, '192.168.2.2');
  assert.deepEqual(state.candidates.map(candidate => candidate.baseURL), [f.home.baseURL]);
  assert.equal(state.candidates[0].credential.configured, false);
  assert.deepEqual(f.current, selectedOffice); assert.deepEqual([...f.credentials], savedOffice);
  assert.equal(state.connections.length, 1); assert.equal(state.connections[0].available, false);

  const beforeHomeConnect = f.requests.length;
  const missingKey = await f.control('connect', { candidateId: home.id });
  assert.equal(missingKey.status, 400); assert.equal((await missingKey.json()).code, 'API_KEY_REQUIRED');
  assert.equal(f.requests.length, beforeHomeConnect, 'Company credentials are never sent to a same-named home endpoint');
  assert.equal((await f.control('credential', { candidateId: home.id, apiKey: f.home.key, remember: true })).status, 200);
  const homeResponse = await f.control('connect', { candidateId: home.id }); assert.equal(homeResponse.status, 200);
  const homeConnection = await homeResponse.json(); assert.notEqual(homeConnection.provider, officeConnection.provider);
  assert.equal(f.current.value.provider, homeConnection.provider); assert.equal(f.credentials.size, 2);
  assert.ok(f.requests.every(request => request.correctCredential));
  assert.ok(f.requests.some(request => request.endpoint === f.company.baseURL && request.certificate === f.company.certificate));
  assert.ok(f.requests.some(request => request.endpoint === f.home.baseURL && request.certificate === f.home.certificate));
  state = await f.state(); assert.equal(state.connections.find(row => row.provider === homeConnection.provider).available, true);
  for (const secret of [f.company.key, f.home.key]) assert.ok(!JSON.stringify(state).includes(secret));
  assert.equal((await f.control('disconnect')).status, 200);
  assert.deepEqual(f.current.value, f.original); assert.equal(f.adapters.size, 0); assert.equal(f.credentials.size, 2);
});

test('a same-IP attachment change requires explicit revalidation and replaces its transport without a duplicate provider', async t => {
  const f = await roamingFixture(t, { sameService: true });
  const first = f.announce(f.company);
  assert.equal((await f.control('credential', { candidateId: first.id, apiKey: f.company.key, remember: true })).status, 200);
  const connected = await (await f.control('connect', { candidateId: first.id })).json();
  const route = f.controller.routes.get(connected.provider), oldTransport = route.transport;
  const selected = f.current, saved = structuredClone([...f.credentials]);
  f.move('home'); await until(() => f.sockets.length === 2 && f.discovery.status === 'discovering');
  assert.equal(f.sockets[0].config.interface, f.sockets[1].config.interface);
  assert.equal(oldTransport.closed, true); assert.equal(route.available, false); assert.deepEqual(f.discovery.snapshot(), []);
  const returned = f.announce(f.home); assert.notEqual(returned.id, first.id);
  assert.equal(returned.baseURL, first.baseURL); assert.deepEqual(f.current, selected);
  assert.equal(route.available, false, 'Rediscovery does not resume a previously connected API route');
  assert.deepEqual([...f.credentials], saved);
  const before = f.requests.length;
  const reconnected = await f.control('connect', { candidateId: returned.id }); assert.equal(reconnected.status, 200);
  assert.equal((await reconnected.json()).provider, connected.provider);
  assert.ok(f.requests.length >= before + 2, 'Reconnection rechecks both models and capability metadata');
  assert.notEqual(route.transport, oldTransport); assert.equal(route.adapter.transport, route.transport);
  assert.equal(route.binding.candidateId, returned.id); assert.equal(route.available, true);
  assert.equal(f.adapters.size, 1); assert.equal(f.credentials.size, 1);
  await f.control('disconnect'); assert.deepEqual(f.current.value, f.original);
});
