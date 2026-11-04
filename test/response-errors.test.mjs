import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSSE, responsesToHarness } from '../responses.mjs';

const syntheticSecret = 'sk-echo-7';
async function collect(source) { const result = []; for await (const value of source) result.push(value); return result; }
function sanitized(expected) {
  return error => {
    assert.equal(error.message, expected);
    assert.ok(!String(error.stack).includes(syntheticSecret));
    assert.equal(error.cause, undefined, 'Do not retain the original JSON parse error as a cause.');
    return true;
  };
}

test('malformed SSE JSON never echoes an upstream credential fragment in errors', async () => {
  const bytes = Buffer.from(`data: ${syntheticSecret}\n\n`);
  const stream = (async function* () { yield bytes.subarray(0, 8); yield bytes.subarray(8); })();
  await assert.rejects(collect(parseSSE(stream)), sanitized('The service returned an invalid SSE event.'));
});

test('malformed completed function arguments never echo an upstream credential fragment in errors', async () => {
  const events = (async function* () {
    yield { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'call-1', name: 'fixture_tool' } };
    yield { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'call-1', name: 'fixture_tool', arguments: syntheticSecret } };
  })();
  await assert.rejects(collect(responsesToHarness(events)), sanitized('The service returned invalid function arguments.'));
});

test('an interrupted stream reports temporary unavailability and releases the response', async () => {
  const { ResponsesAdapter } = await import('../responses.mjs');
  let destroyed = false, unavailable = 0;
  const response = {
    headers: { 'content-type': 'text/event-stream' }, destroy() { destroyed = true; },
    async *[Symbol.asyncIterator]() { throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }); },
  };
  const adapter = new ResponsesAdapter({ binding: { provider: 'lan-test' }, models: [{ id: 'test', streaming: 'supported', input_modalities: ['text'] }], transport: { async open() { return response; } }, onUnavailable() { unavailable++; } });
  await assert.rejects(collect(adapter.stream({ provider: 'lan-test', model: 'test', messages: [] })), { code: 'SERVICE_UNAVAILABLE' });
  assert.equal(destroyed, true); assert.equal(unavailable, 1);
});
