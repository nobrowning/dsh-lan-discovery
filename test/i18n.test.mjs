import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = new URL('../', import.meta.url);
const source = await readFile(new URL('client.js', pluginRoot), 'utf8');

// Exercise the actual bundled page and sidebar contributions against the public
// locale face. Harness owns OS-language matching and persisted preferences.
async function mountedPage({ language = 'en', error = '', fetch, auth = 'none', credential = { required: false, configured: false, source: null }, credentialStorage = { available: false } } = {}) {
  const service = { id: 'vision', auth, credential, instanceName: 'local-service._llm-api._tcp.local', baseURL: 'https://fixture.local/v1', validation: { valid: true }, details: { mock: true, nodeLabel: 'fixture.local', models: [{ id: 'wire-model', display_name: 'Qwen2.5-VL-7B-Instruct', deployment: { parameters: '7B', version: '2.5-VL', quantization: 'BF16' }, input_modalities: ['text', 'image'], streaming: 'supported', function_calling: 'unsupported' }] } };
  const states = [{ running: true, trustConfigured: true, credentialStorage, connections: [], candidates: [service], events: [{ at: '2026-11-02', type: 'added', instanceName: service.instanceName }] }, error, '', 'all', {}, null, {}, {}, {}];
  let stateIndex = 0; let definition; let localeSnapshot = { active: language, revision: 0 }; let dictionaries; let dictionaryCount = 0;
  const subscriptions = new Set(); const effects = []; const registrations = new Map(); const pollEffects = []; const intervals = new Set(); let sessionCount = 0;
  const react = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState() { const index = stateIndex++; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useCallback(callback) { return callback; }, useEffect(effect) { if (!pollEffects.length) pollEffects.push(effect); },
    useSyncExternalStore(subscribe, getSnapshot) { assert.equal(getSnapshot(), localeSnapshot); assert.equal(typeof subscribe, 'function'); return getSnapshot(); },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value; } } }, fetch, setInterval(callback) { intervals.add(callback); return callback; }, clearInterval(callback) { intervals.delete(callback); } });
  const plugin = definition.factory(name => { assert.equal(name, 'react'); return react; });
  const locale = {
    register(namespace, value) { assert.equal(namespace, 'lan-discovery'); dictionaries = value; dictionaryCount++; return () => { dictionaryCount--; }; },
    bind(namespace) { assert.equal(namespace, 'lan-discovery'); return (key, params = {}) => { const template = dictionaries[localeSnapshot.active]?.[key] ?? dictionaries.en[key]; assert.equal(typeof template, 'string', `Unknown translation key: ${key}`); return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name])); }; },
    subscribe(listener) { subscriptions.add(listener); return () => subscriptions.delete(listener); },
    getSnapshot() { return localeSnapshot; },
  };
  plugin.apply({ locale, effect(fn) { effects.push(fn()); }, slots: { inject(_name, fn) { effects.push(fn()); }, register(options, component) { registrations.set(options.name, { options, component }); return () => registrations.delete(options.name); } }, layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }) }, selectPanel() {} }, uiWorkspace: { startSession() { sessionCount++; } } });
  return {
    plugin, states,
    render() { stateIndex = 0; const entry = registrations.get('main').component(); return entry.type(entry.props); },
    sidebar() { return registrations.get('sidebar.panellist').options.label(); },
    localeStore() { return registrations.get('main').component().props.localeStore; },
    startPolling() { effects.push(pollEffects[0]()); },
    async poll() { for (const callback of intervals) await callback(); },
    sessionCount() { return sessionCount; },
    switchLanguage(active) { localeSnapshot = { active, revision: localeSnapshot.revision + 1 }; for (const listener of subscriptions) listener(); },
    dispose() { for (const effect of effects.reverse()) effect?.(); assert.equal(dictionaryCount, 0); },
  };
}

function visibleText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  if (!node || node.type === 'style') return '';
  return [node.props?.['aria-label'], ...node.children.map(visibleText)].filter(Boolean).join(' ');
}

function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(value => elements(value, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.children ?? [], predicate)];
}

function button(page, label) {
  const found = elements(page.render(), node => node.type === 'button' && visibleText(node) === label);
  assert.equal(found.length, 1, `Expected one ${label} button`);
  return found[0];
}

function enterKey(page, value) {
  const input = elements(page.render(), node => node.type === 'input')[0];
  assert.equal(input.props.type, 'password');
  assert.equal(input.props.autoComplete, 'off');
  input.props.onChange({ target: { value } });
}

function submitKey(page) {
  const form = elements(page.render(), node => node.type === 'form')[0];
  assert.ok(form, 'Credential form is visible.');
  return form.props.onSubmit({ preventDefault() {} });
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('page and sidebar follow Harness locale changes without replacing service data', async () => {
  const page = await mountedPage();
  assert.ok(page.plugin.inject.includes('locale'));
  const service = page.states[0].candidates[0];
  assert.equal(page.sidebar(), 'LAN services');
  assert.match(visibleText(page.render()), /LAN LLM services.*7B parameters.*Version 2\.5-VL.*Image input/);
  let notifications = 0;
  const unsubscribe = page.localeStore().subscribe(() => notifications++);
  page.switchLanguage('zh');
  assert.equal(notifications, 1);
  assert.equal(page.sidebar(), '局域网服务');
  const chinese = visibleText(page.render());
  assert.match(chinese, /局域网 LLM 服务.*7B 参数.*版本 2\.5-VL.*图像输入/);
  assert.match(chinese, /Qwen2\.5-VL-7B-Instruct/);
  assert.match(chinese, /fixture\.local/);
  assert.equal(page.states[0].candidates[0], service, 'A locale change must not reset discovered services.');
  page.switchLanguage('en');
  assert.equal(page.sidebar(), 'LAN services');
  assert.match(visibleText(page.render()), /Connect and start chat/);
  unsubscribe(); page.dispose();
});

test('stored errors and success messages translate at render time, with diagnostics preserved', async () => {
  const page = await mountedPage({ error: 'This exact service endpoint has not been independently authorized.' });
  assert.match(visibleText(page.render()), /has not been independently authorized/);
  page.states[5] = { key: 'connection.success', params: { model: 'fixture-model' } };
  page.switchLanguage('zh');
  assert.match(visibleText(page.render()), /尚未获得独立授权/);
  assert.match(visibleText(page.render()), /已接入 fixture-model/);
  page.states[1] = 'ECONNREFUSED fixture.local:8443';
  assert.match(visibleText(page.render()), /操作失败：ECONNREFUSED fixture\.local:8443/);
  page.states[1] = '__proto__';
  assert.match(visibleText(page.render()), /操作失败：__proto__/);
  page.dispose();
});

test('Host errors retain language-neutral data until displayed', async () => {
  const page = await mountedPage({ fetch: async () => new Response('not found', { status: 404 }) });
  try { await page.plugin.createApi()('state'); assert.fail('Expected a non-JSON error'); } catch (error) { page.states[1] = error; }
  assert.match(visibleText(page.render()), /HTTP 404 with a non-JSON response/);
  page.switchLanguage('zh');
  assert.match(visibleText(page.render()), /HTTP 404（非 JSON）/);
  page.dispose();
});

test('packaged browser bundle matches both complete locale dictionaries', () => {
  const result = spawnSync(process.execPath, ['build-client.mjs', '--check'], { cwd: fileURLToPath(pluginRoot), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('credential-free services use a status line, while required services offer a masked form', async () => {
  const page = await mountedPage();
  assert.match(visibleText(page.render()), /No API key required/);
  assert.equal(elements(page.render(), node => node.type === 'input').length, 0);
  assert.ok(elements(page.render(), node => node.props.className === 'lan-tag').every(node => !/API key/.test(visibleText(node))));
  page.states[0].candidates[0].credential = { required: true, configured: false, source: null };
  const required = visibleText(page.render());
  assert.match(required, /API key required/);
  assert.match(required, /Kept in memory for this Harness run only/);
  assert.equal(button(page, 'Verify and connect').props.disabled, true);
  page.switchLanguage('zh');
  assert.match(visibleText(page.render()), /需要 API key.*本次 Harness 运行有效.*验证并连接/);
  page.dispose();
});

test('password is cleared before validation settles; rejected keys can be retried without polling hiding errors', async () => {
  let snapshot; let settleFirst; let credentialCalls = 0; let connected = false; const submitted = [];
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null }, fetch: async (path, init) => {
    const action = path.split('/').at(-1);
    if (action === 'state') return json(snapshot);
    const body = JSON.parse(init.body);
    if (action === 'credential') {
      credentialCalls++; submitted.push(body);
      if (credentialCalls === 1) return new Promise(resolve => { settleFirst = resolve; });
      snapshot.candidates[0].credential = { required: true, configured: true, source: 'session' };
      return json({ status: 'verified' });
    }
    assert.equal(action, 'connect');
    assert.equal(snapshot.candidates[0].credential.configured, true);
    assert.equal(Object.hasOwn(body, 'apiKey'), false, 'Connect receives no credential copy.');
    connected = true;
    return json({ modelName: 'Fixture Model' });
  } });
  snapshot = structuredClone(page.states[0]);
  enterKey(page, 'first-synthetic-key');
  const rejected = submitKey(page);
  assert.equal(elements(page.render(), node => node.type === 'input')[0].props.value, '');
  assert.equal(JSON.stringify(page.render()).includes('first-synthetic-key'), false);
  settleFirst(json({ code: 'API_KEY_REJECTED', error: 'The API key was rejected by this service.' }, 401));
  await rejected;
  assert.equal(connected, false);
  assert.match(visibleText(page.render()), /rejected the API key/);
  page.startPolling(); await page.poll();
  assert.match(visibleText(page.render()), /rejected the API key/, 'Successful polling must retain an actionable submission error.');
  page.switchLanguage('zh');
  assert.match(visibleText(page.render()), /服务拒绝了该 API key/);
  enterKey(page, 'second-synthetic-key');
  await submitKey(page);
  assert.equal(connected, true);
  assert.equal(page.sessionCount(), 1);
  assert.equal(elements(page.render(), node => node.type === 'input').length, 0);
  assert.match(visibleText(page.render()), /API key 已验证 · 本次运行/);
  assert.equal(JSON.stringify(page.render()).includes('second-synthetic-key'), false);
  assert.deepEqual(submitted.map(value => Object.keys(value).sort()), [['apiKey', 'candidateId', 'remember'], ['apiKey', 'candidateId', 'remember']]);
  assert.ok(submitted.every(value => value.remember === false));
  assert.ok(submitted.every(value => value.candidateId === 'vision'));
  page.dispose();
});

test('configured file credentials cannot be cleared; session credentials can be changed and forgotten', async () => {
  let snapshot; const actions = [];
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: true, source: 'file' }, fetch: async (path, init) => {
    const action = path.split('/').at(-1); actions.push(action);
    if (action === 'state') return json(snapshot);
    assert.equal(action, 'forget-credential');
    assert.deepEqual(JSON.parse(init.body), { candidateId: 'vision' });
    snapshot.candidates[0].credential = { required: true, configured: false, source: null };
    return json({ ok: true });
  } });
  snapshot = structuredClone(page.states[0]);
  assert.match(visibleText(page.render()), /Credential file/);
  assert.equal(elements(page.render(), node => node.type === 'button' && visibleText(node) === 'Clear API key').length, 0);
  button(page, 'Change API key').props.onClick();
  enterKey(page, 'unsent-key');
  button(page, 'Cancel change').props.onClick();
  assert.equal(elements(page.render(), node => node.type === 'input').length, 0);
  assert.equal(JSON.stringify(page.states).includes('unsent-key'), false);
  page.states[0].candidates[0].credential = { required: true, configured: true, source: 'session' };
  await button(page, 'Clear API key').props.onClick();
  assert.deepEqual(actions, ['forget-credential', 'state']);
  assert.equal(elements(page.render(), node => node.type === 'input').length, 1);
  assert.equal(page.sessionCount(), 0);
  page.dispose();
});

test('invalid password input is cleared and never sent to the Host', async () => {
  const calls = [];
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null }, fetch: async path => { calls.push(path); return json(page.states[0]); } });
  enterKey(page, 'contains a space');
  await submitKey(page);
  assert.ok(calls.every(path => path.endsWith('/state')));
  assert.match(visibleText(page.render()), /1–4096 visible ASCII characters/);
  assert.equal(elements(page.render(), node => node.type === 'input')[0].props.value, '');
  assert.equal(page.sessionCount(), 0);
  page.dispose();
});

test('an obsolete retained session key can be cleared without treating the new identity as configured', async () => {
  const calls = [];
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null, retainedSession: true }, fetch: async (path, init) => {
    calls.push(path.split('/').at(-1));
    if (path.endsWith('/forget-credential')) {
      assert.deepEqual(JSON.parse(init.body), { candidateId: 'vision' });
      page.states[0].candidates[0].credential.retainedSession = false;
      return json({ ok: true });
    }
    return json(page.states[0]);
  } });
  const candidate = page.states[0].candidates[0];
  candidate.validation.valid = false;
  candidate.draftAuthCompatible = false;
  assert.equal(button(page, 'Clear API key').props.disabled, false, 'Forgetting an old key does not require trusting the current record.');
  assert.equal(button(page, 'Verify and connect').props.disabled, true);
  assert.doesNotMatch(visibleText(page.render()), /API key verified/);
  assert.match(visibleText(page.render()), /"draftAuthCompatible": false/);
  candidate.credential.required = false;
  candidate.auth = 'none';
  assert.match(visibleText(page.render()), /No API key required/);
  await button(page, 'Clear API key').props.onClick();
  assert.deepEqual(calls, ['forget-credential', 'state']);
  assert.equal(elements(page.render(), node => node.type === 'button' && visibleText(node) === 'Clear API key').length, 0);
  page.dispose();
});

test('remember defaults to Harness storage and can be switched to this run only', async () => {
  let snapshot; const submissions = [];
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null }, credentialStorage: { available: true }, fetch: async (path, init) => {
    const action = path.split('/').at(-1);
    if (action === 'state') return json(snapshot);
    if (action === 'credential') {
      const body = JSON.parse(init.body); submissions.push(body);
      snapshot.candidates[0].credential = { required: true, configured: true, source: body.remember ? 'saved' : 'session' };
      return json({ status: 'verified' });
    }
    assert.equal(action, 'connect');
    return json({ modelName: 'Fixture Model' });
  } });
  snapshot = structuredClone(page.states[0]);
  let checkbox = elements(page.render(), node => node.type === 'input' && node.props.type === 'checkbox')[0];
  assert.equal(checkbox.props.checked, true);
  assert.match(visibleText(page.render()), /Remember this API key.*after restarting Harness/);
  enterKey(page, 'synthetic-saved-key'); await submitKey(page);
  assert.equal(submissions[0].remember, true);
  assert.match(visibleText(page.render()), /API key saved · Ready to connect/);
  assert.equal(elements(page.render(), node => node.type === 'input').length, 0, 'Saved key never returns to a password field.');
  assert.equal(JSON.stringify(page.render()).includes('synthetic-saved-key'), false);
  button(page, 'Change API key').props.onClick();
  checkbox = elements(page.render(), node => node.type === 'input' && node.props.type === 'checkbox')[0];
  checkbox.props.onChange({ target: { checked: false } });
  assert.match(visibleText(page.render()), /Kept in memory for this Harness run only/);
  enterKey(page, 'synthetic-session-key'); await submitKey(page);
  assert.equal(submissions[1].remember, false);
  assert.match(visibleText(page.render()), /API key verified · This Harness run/);
  page.dispose();
});

test('saved keys connect directly or can be forgotten, without exposing a credential copy', async () => {
  let snapshot; const submitted = [];
  const page = await mountedPage({ language: 'zh', auth: 'required', credential: { required: true, configured: true, source: 'saved' }, credentialStorage: { available: true }, fetch: async (path, init) => {
    const action = path.split('/').at(-1);
    if (action === 'state') return json(snapshot);
    submitted.push({ action, body: JSON.parse(init.body) });
    if (action === 'connect') return json({ modelName: 'Fixture Model' });
    assert.equal(action, 'forget-credential');
    snapshot.candidates[0].credential = { required: true, configured: false, source: null };
    return json({ cleared: true });
  } });
  snapshot = structuredClone(page.states[0]);
  assert.match(visibleText(page.render()), /API key 已保存 · 可直接连接/);
  assert.equal(elements(page.render(), node => node.type === 'form').length, 0);
  await button(page, '连接并新建会话').props.onClick();
  assert.equal(page.sessionCount(), 1);
  assert.equal(submitted[0].action, 'connect');
  assert.equal(Object.hasOwn(submitted[0].body, 'apiKey'), false);
  await button(page, '清除 API key').props.onClick();
  assert.deepEqual(submitted[1], { action: 'forget-credential', body: { candidateId: 'vision' } });
  assert.match(visibleText(page.render()), /需要 API key.*记住此 API key/);
  page.dispose();
});

test('storage failures are localized without exposing raw details and session use remains available', async () => {
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null }, credentialStorage: { available: true } });
  page.states[1] = { code: 'CREDENTIAL_STORE_FAILED', message: 'raw-storage-detail-do-not-show' };
  assert.match(visibleText(page.render()), /could not be read or updated/);
  assert.doesNotMatch(visibleText(page.render()), /raw-storage-detail/);
  page.switchLanguage('zh');
  assert.match(visibleText(page.render()), /无法读取或更新已保存的 API key/);
  page.states[0].credentialStorage.available = false;
  page.states[1] = { code: 'CREDENTIAL_STORE_UNAVAILABLE', message: 'raw-storage-detail-do-not-show' };
  assert.equal(elements(page.render(), node => node.type === 'input' && node.props.type === 'checkbox').length, 0);
  assert.match(visibleText(page.render()), /Harness 凭据存储暂不可用.*仅在本次运行中使用/);
  assert.doesNotMatch(visibleText(page.render()), /raw-storage-detail/);
  page.dispose();
});

test('a retained saved key can be cleared after the discovered identity changes', async () => {
  const page = await mountedPage({ auth: 'required', credential: { required: true, configured: false, source: null, retainedSaved: true }, credentialStorage: { available: true } });
  page.states[0].candidates[0].validation.valid = false;
  assert.equal(button(page, 'Clear API key').props.disabled, false);
  assert.equal(button(page, 'Verify and connect').props.disabled, true);
  assert.doesNotMatch(visibleText(page.render()), /API key saved/);
  page.dispose();
});
