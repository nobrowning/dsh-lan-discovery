import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { request as httpsRequest, Agent } from 'node:https';
import { checkServerIdentity } from 'node:tls';

export function canonicalBaseURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Only an HTTPS API base URL without credentials/query/fragment is accepted.');
  if (url.hostname.endsWith('.')) url.hostname = url.hostname.slice(0, -1);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) throw new Error('API base paths must not end with a slash.');
  return url.href.replace(/\/$/, url.pathname === '/' ? '/' : '');
}

export function fingerprint(value) {
  const hex = String(value ?? '').replaceAll(':', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('A SHA-256 leaf certificate fingerprint is required.');
  return hex;
}

export function credentialError(code) {
  const messages = {
    API_KEY_REQUIRED: 'An API key is required for this service.',
    API_KEY_REJECTED: 'The API key was rejected by this service.',
    API_KEY_INVALID: 'Enter a valid API key (1–4096 visible ASCII characters).',
  };
  return Object.assign(new Error(messages[code]), { code });
}

export function validateApiKey(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(value)) throw credentialError('API_KEY_INVALID');
  return value;
}

export async function loadTrust(trustFile) {
  if (!trustFile) throw new Error('Configure trustFile before connecting. Discovery does not grant trust.');
  const path = resolve(trustFile);
  const document = JSON.parse(await readFile(path, 'utf8'));
  if (!['llm-api-discovery-trust/v1', 'llm-discovery-demo-trust/v1'].includes(document.schema) || !Array.isArray(document.services)) throw new Error('Unsupported local trust document.');
  const localPath = (value) => {
    if (typeof value !== 'string' || !value) throw new Error('Missing local trust file path.');
    return resolve(dirname(path), value);
  };
  const ca = await readFile(localPath(document.caFile), 'utf8');
  const services = document.services.map((entry) => {
    if (!Array.isArray(entry.allowedAddresses) || !entry.allowedAddresses.length || entry.allowedAddresses.some(address => !isIP(address))) throw new Error('Trust entries require explicit allowed IP addresses.');
    const auth = entry.auth ?? 'required';
    if (!['none', 'required'].includes(auth)) throw new Error('Unsupported local authentication policy.');
    if (auth === 'none' && entry.tokenFile !== undefined) throw new Error('An unauthenticated service must not have a credential file.');
    return Object.freeze({ baseURL: canonicalBaseURL(entry.baseURL), allowedAddresses: [...entry.allowedAddresses], certificateSha256: fingerprint(entry.certificateSha256), auth, ...(entry.tokenFile === undefined ? {} : { tokenFile: localPath(entry.tokenFile) }) });
  });
  if (new Set(services.map(entry => entry.baseURL)).size !== services.length) throw new Error('Duplicate authorized base URLs.');
  return { path, ca, services, markerFile: document.markerFile ? localPath(document.markerFile) : undefined };
}

export function authorizeCandidate(candidate, trust) {
  if (!candidate?.validation?.valid || candidate.profileSupported === false || candidate.apiProfile !== 'openresponses') throw new Error('The discovered service is not a supported, valid Open Responses candidate.');
  if (candidate.protocolVersion !== '2026-04-24') throw new Error('Unsupported Open Responses binding version.');
  const baseURL = canonicalBaseURL(candidate.baseURL);
  const entry = trust.services.find(service => service.baseURL === baseURL);
  if (!entry) throw new Error('This exact service endpoint has not been independently authorized.');
  if (candidate.auth !== entry.auth) throw new Error('The advertised authentication policy does not match local trust.');
  const addresses = (candidate.addresses ?? []).map(value => typeof value === 'string' ? value : value.address).filter(value => entry.allowedAddresses.includes(value));
  if (!addresses.length) throw new Error('No discovered address matches the locally approved address set.');
  const identity = createHash('sha256').update(JSON.stringify([baseURL, entry.certificateSha256, [...addresses].sort(), entry.auth])).digest('hex');
  return Object.freeze({ ...entry, ca: trust.ca, addresses: Object.freeze(addresses), identity, provider: `lan-${identity.slice(0, 20)}`, instanceName: candidate.instanceName, candidateId: candidate.id, networkId: candidate.networkId });
}

export function createPinnedTransport(binding, { attribution = {}, apiKey, getApiKey, timeoutMs = 20000, maxBytes = 16 * 1024 * 1024 } = {}) {
  const base = new URL(binding.baseURL);
  const address = binding.addresses[0];
  const agent = new Agent({ keepAlive: false, ca: binding.ca, rejectUnauthorized: true, checkServerIdentity(host, cert) {
    const error = checkServerIdentity(host, cert);
    if (error) return error;
    if (!cert.raw || createHash('sha256').update(cert.raw).digest('hex') !== binding.certificateSha256) return new Error('The service certificate fingerprint changed.');
  } });
  let disposed = false;
  return {
    close() { disposed = true; agent.destroy(); },
    async open(relative, { method = 'GET', body, signal } = {}) {
      if (disposed) throw new Error('This service connection has been disconnected.');
      if (!/^(?:responses|models|_(?:demo|llm)\/capabilities)$/.test(relative)) throw new Error('Unsupported API operation.');
      let token;
      if (binding.auth !== 'none') {
        token = getApiKey ? await getApiKey() : apiKey;
        if (token === undefined && binding.tokenFile) {
          try { token = (await readFile(binding.tokenFile, 'utf8')).trim(); }
          catch { throw credentialError('API_KEY_REQUIRED'); }
        }
        if (token === undefined) throw credentialError('API_KEY_REQUIRED');
        validateApiKey(token);
      }
      // Auth is controlled by local trust, never by attribution headers or an
      // unauthenticated TXT change. In particular, no key is sent to auth=none.
      const headers = Object.fromEntries(Object.entries(attribution).filter(([name]) => !['authorization', 'proxy-authorization', 'cookie', 'host'].includes(name.toLowerCase())));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      if (payload && Buffer.byteLength(payload) > maxBytes) throw new Error('Request exceeds the experiment body limit.');
      const path = `${base.pathname === '/' ? '' : base.pathname}/${relative}`;
      const response = await new Promise((resolveResponse, reject) => {
        const req = httpsRequest({ protocol: 'https:', hostname: base.hostname, port: base.port || 443, path, method, agent, servername: isIP(base.hostname) ? undefined : base.hostname,
          lookup(_host, options, callback) { const result = { address, family: isIP(address) }; options?.all ? callback(null, [result]) : callback(null, address, result.family); },
          headers: { ...headers, ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), accept: body?.stream ? 'text/event-stream' : 'application/json', ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) }, signal
        }, resolveResponse);
        req.on('error', error => reject(new Error(error.code === 'ABORT_ERR' ? 'Request cancelled.' : `Service transport failed (${error.code ?? 'TLS_OR_NETWORK'}).`)));
        req.setTimeout(timeoutMs, () => req.destroy(new Error('Service request timed out.')));
        req.end(payload);
      });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        if (response.statusCode === 401 || response.statusCode === 403) throw credentialError(token === undefined ? 'API_KEY_REQUIRED' : 'API_KEY_REJECTED');
        throw new Error(`Service returned HTTP ${response.statusCode}; redirects are not followed.`);
      }
      return response;
    },
    async json(relative, options) {
      const response = await this.open(relative, options);
      let size = 0; const chunks = [];
      for await (const chunk of response) { size += chunk.length; if (size > maxBytes) { response.destroy(); throw new Error('Response exceeds the experiment body limit.'); } chunks.push(chunk); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new Error('The service returned invalid JSON.'); }
    }
  };
}
