import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDiscoveryClient } from '@llm-discovery/discovery-core';
import { DiscoveryController, harnessDefaults } from './controller.mjs';
import { loadTrust, validateApiKey } from './trust.mjs';
import { createHarnessCredentialStore } from './credentials.mjs';

export const name = 'lan-discovery';
export const inject = ['connection', 'llm', 'settings'];

function send(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function readBody(request) {
  let size = 0; const parts = [];
  for await (const part of request.body ?? []) { size += part.length; if (size > 8192) throw new Error('Control request too large.'); parts.push(Buffer.from(part)); }
  let body;
  try { body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); }
  catch { throw new Error('Invalid JSON control request.'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Expected a JSON object.');
  return body;
}

function validateControlBody(path, body) {
  const action = path.slice('/api/lan-discovery/'.length);
  const fields = action === 'connect' ? ['candidateId', 'modelId'] : action === 'credential' ? ['candidateId', 'apiKey', 'remember'] : ['inspect', 'forget-credential'].includes(action) ? ['candidateId'] : [];
  if (Object.keys(body).some(key => !fields.includes(key))) throw new Error('Unknown control request field.');
  if (['connect', 'inspect', 'credential', 'forget-credential'].includes(action) && (typeof body.candidateId !== 'string' || !body.candidateId.trim() || body.candidateId.length > 1024)) throw new Error('A nonempty candidateId is required.');
  if (action === 'credential') validateApiKey(body.apiKey);
  if (Object.hasOwn(body, 'remember') && typeof body.remember !== 'boolean') throw new Error('remember must be a boolean.');
  if (Object.hasOwn(body, 'modelId') && (typeof body.modelId !== 'string' || !body.modelId.trim() || body.modelId.length > 1024)) throw new Error('modelId must be a nonempty string when provided.');
}

export function createFetchHandler(controller) {
  // Mounted only through Connection's exact-route registry. The framework admits
  // an authenticated owner Peer before calling this handler, for Desktop and Web.
  return async request => {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/api/lan-discovery/state') return send(200, controller.snapshot());
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      if (!String(request.headers.get('content-type') ?? '').startsWith('application/json')) return send(415, { error: 'Expected application/json.' });
      const body = await readBody(request);
      validateControlBody(path, body);
      let result;
      if (path === '/api/lan-discovery/start') result = await controller.start();
      else if (path === '/api/lan-discovery/stop') result = await controller.stop();
      else if (path === '/api/lan-discovery/inspect') result = await controller.inspect(body.candidateId);
      else if (path === '/api/lan-discovery/credential') result = await controller.setCredential(body.candidateId, body.apiKey, { remember: body.remember ?? false });
      else if (path === '/api/lan-discovery/forget-credential') result = await controller.forgetCredential(body.candidateId);
      else if (path === '/api/lan-discovery/connect') result = await controller.connect(body.candidateId, body.modelId);
      else if (path === '/api/lan-discovery/disconnect') result = await controller.disconnect();
      else return send(404, { error: 'Unknown operation.' });
      return send(200, result ?? { ok: true });
    } catch (error) { return send(400, { error: error instanceof Error ? error.message : 'LAN operation failed.', ...(['API_KEY_REQUIRED', 'API_KEY_REJECTED', 'API_KEY_INVALID', 'CREDENTIAL_STORE_UNAVAILABLE', 'CREDENTIAL_STORE_FAILED'].includes(error.code) ? { code: error.code } : {}) }); }
  };
}

export function registerControlRoutes(controller, connection) {
  if (typeof connection?.fetch?.register !== 'function') throw new Error('The installed Harness authenticated Fetch-route registry is unavailable.');
  const fetch = createFetchHandler(controller);
  const disposers = [];
  try {
    for (const action of ['state', 'start', 'stop', 'inspect', 'connect', 'disconnect', 'credential', 'forget-credential']) disposers.push(connection.fetch.register({ path: `/api/lan-discovery/${action}`, methods: [action === 'state' ? 'GET' : 'POST'], requestBody: 'buffered', fetch }));
  } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
  return () => { for (const dispose of disposers.reverse()) dispose(); };
}

export function scheduleDefaultRecovery(controller, loaderSettled, logger) {
  let cancelled = false;
  // Deliberately not awaited by apply(). Official SettingsForms uses the same
  // post-Loader pattern for writes that themselves reconcile the Loader.
  const completion = Promise.resolve(loaderSettled).then(async () => {
    if (!cancelled && !controller.closed && controller.recoveryPending) await controller.recoverDefault();
  }).catch(error => { logger?.warn?.(`lan-discovery: ${error.message}`); });
  return { completion, cancel() { cancelled = true; } };
}

export async function apply(ctx, supplied = {}) {
  const config = { ...supplied, trustFile: supplied.trustFile ?? process.env.DSH_LAN_DISCOVERY_TRUST_FILE };
  const { attributionHeaders } = await import('@deepseek-ai/dsh-llm');
  const discovery = createDiscoveryClient({ interfaceAddress: config.interfaceAddress, networkId: config.networkId, queryIntervalMs: config.queryIntervalMs });
  const controller = new DiscoveryController({ discovery, config, llm: ctx.llm, defaults: harnessDefaults(ctx.settings), attribution: attributionHeaders(), credentialStore: createHarnessCredentialStore(ctx.get('credentials')),
    onRequestDiagnostics(diagnostic) { ctx.logger?.info?.(`lan-discovery request ${JSON.stringify(diagnostic)}`); },
    async readImage(ref, signal) {
      const attachments = ctx.get('attachments');
      if (!attachments?.readImageRequest) throw new Error('The installed Harness image-attachment service is unavailable.');
      return attachments.readImageRequest(ref, { width: ref.width, height: ref.height, maxBytes: Math.min(ref.bytes, 5 * 1024 * 1024) }, signal);
    }
  });
  ctx.effect(() => registerControlRoutes(controller, ctx.connection), 'lan-discovery authenticated Fetch API');
  ctx.effect(() => () => controller.close(), 'lan-discovery lifecycle');
  // Optional tool registration follows the installed registry's normal permission pipeline.
  if (config.demoMode === true) ctx.inject(['tools'], async toolContext => {
    const { defineTool } = await import('@deepseek-ai/dsh-tools');
    toolContext.tools.register(defineTool({ name: 'demo_read_marker', description: 'Read the local, read-only LAN discovery demonstration marker. Takes no file path and performs no network access.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(_args, execution) {
        const trust = await loadTrust(config.trustFile);
        if (!trust.markerFile) throw new Error('No local demonstration marker is configured.');
        const value = await readFile(trust.markerFile, { encoding: 'utf8', signal: execution.signal });
        if (Buffer.byteLength(value) > 4096) throw new Error('The demonstration marker exceeds its size limit.');
        ctx.logger?.info?.(`lan-discovery demo_read_marker executed in PID ${process.pid}; SHA-256 ${createHash('sha256').update(value).digest('hex')}`);
        return value;
      }
    }));
  });
  await controller.initialize().catch(error => { controller.error = error.message; ctx.logger?.warn?.(`lan-discovery: ${error.message}`); });
  const recovery = scheduleDefaultRecovery(controller, ctx.root.loader.await(), ctx.logger);
  ctx.effect(() => () => recovery.cancel(), 'lan-discovery deferred default recovery');
}
