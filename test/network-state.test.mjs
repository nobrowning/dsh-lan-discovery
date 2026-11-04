import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryClient } from '@llm-discovery/discovery-core';
import { DiscoveryController } from '../controller.mjs';
import { createFetchHandler } from '../index.mjs';
import { createPinnedTransport } from '../trust.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('starting with an old network address is a successful waiting state, not an operation error', async t => {
  const discovery = createDiscoveryClient({ interfaceAddress: '192.168.1.163', networkInterfaces: () => ({}), waitForNetwork: true });
  const controller = new DiscoveryController({ discovery }); t.after(() => controller.close());
  await controller.initialize();
  const handler = createFetchHandler(controller);
  const response = await handler(new Request('http://host/api/lan-discovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200);
  assert.equal(controller.snapshot().running, true);
  assert.equal(controller.snapshot().discoveryStatus, 'waiting');
  assert.equal(controller.snapshot().error, null);
  assert.deepEqual(controller.snapshot().events, []);
  await controller.stop();
  assert.equal(controller.snapshot().discoveryStatus, 'stopped');
});

test('overlapping start/stop calls are serialized; closing rejects queued restarts by doing no work', async () => {
  let release, starts = 0, stops = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const controller = new DiscoveryController({ discovery: { subscribe() { return () => {}; }, snapshot() { return []; }, async start() { starts++; await gate; }, async stop() { stops++; } } });
  const first = controller.start(), second = controller.start(), stop = controller.stop();
  await tick(); assert.equal(starts, 1); assert.equal(stops, 0);
  release(); await Promise.all([first, second, stop]);
  assert.equal(starts, 1); assert.equal(stops, 1); assert.equal(controller.running, false);
  await controller.close(); await controller.start();
  assert.equal(starts, 1); assert.equal(controller.running, false);
});

test('closing a transport while credentials are pending prevents a late network request', async () => {
  let release;
  const key = new Promise(resolve => { release = resolve; });
  const transport = createPinnedTransport({ baseURL: 'https://must-not-resolve.invalid/v1', addresses: ['127.0.0.1'], auth: 'required', ca: 'unused' }, { getApiKey: () => key });
  const pending = transport.open('models');
  transport.close(); release('synthetic-test-key');
  await assert.rejects(pending, { code: 'SERVICE_UNAVAILABLE' });
});
