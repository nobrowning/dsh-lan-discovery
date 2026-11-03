/* Dependency-externalized browser entry for Desktop 0.2.1-rc.3. */
window.__ModuleLoader__.load({ id: 'dsh-lan-discovery', factory: require => {
  const React = require('react');
  const h = React.createElement;
  const NS = 'lan-discovery';
  /*__LAN_DICTIONARIES__*/
  const CREDENTIAL_ERRORS = { API_KEY_REQUIRED: 'error.apiKeyRequired', API_KEY_REJECTED: 'error.apiKeyRejected', API_KEY_INVALID: 'error.apiKeyInvalid' };
  const HOST_ERRORS = {
    'Configure trustFile before connecting. Discovery does not grant trust.': 'error.trustRequired',
    'Configure trustFile before changing a provider.': 'error.configureProvider',
    'The service is no longer present on the current network.': 'error.serviceGone',
    'The discovery records expired.': 'error.recordsExpired',
    'The discovered service changed while it was being checked.': 'error.serviceChanged',
    'Restore the previous LAN default with Disconnect before connecting again.': 'error.recoveryRequired',
    'The default model changed concurrently; reconnect using the current settings.': 'error.defaultChanged',
    'The installed Harness default-model settings seam is unavailable.': 'error.defaultUnavailable',
    'The default model write did not become effective.': 'error.defaultWrite',
    'The model-list response is invalid.': 'error.modelsInvalid',
    'Capability information is unavailable or unsupported.': 'error.capabilitiesUnavailable',
    'A model has unsupported input capabilities.': 'error.capabilitiesUnsupported',
    'No model appears in both the catalog and capabilities.': 'error.modelsMismatch',
    'This exact service endpoint has not been independently authorized.': 'error.unauthorizedEndpoint',
    'No discovered address matches the locally approved address set.': 'error.addressMismatch',
    'Unsupported local trust document.': 'error.trustInvalid',
    'Unsupported Open Responses binding version.': 'error.bindingUnsupported',
    'The discovered service is not a supported, valid Open Responses candidate.': 'error.candidateInvalid',
    'This service connection has been disconnected.': 'error.disconnected',
    'The experiment credential file is missing or invalid.': 'error.credentialInvalid',
    'Discovered successfully, but this model does not support the streaming client contract.': 'service.streamingRequired',
    'An API key is required for this service.': 'error.apiKeyRequired',
    'The API key was rejected by this service.': 'error.apiKeyRejected',
    'Enter a valid API key (1–4096 visible ASCII characters).': 'error.apiKeyInvalid',
  };
  function errorText(error, t) {
    if (error?.i18nKey) return t(error.i18nKey, error.params);
    if (Object.hasOwn(CREDENTIAL_ERRORS, error?.code)) return t(CREDENTIAL_ERRORS[error.code]);
    const message = String(error?.message ?? error ?? '');
    return Object.hasOwn(HOST_ERRORS, message) ? t(HOST_ERRORS[message]) : t('error.generic', { message });
  }
  const css = `.lan-page{width:100%;padding:30px;max-width:1160px;margin:auto;height:100%;overflow:auto;box-sizing:border-box;color:var(--dsw-alias-label-primary);font:14px system-ui}.lan-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.lan-head h1{font-size:27px;margin:0}.lan-muted{opacity:.65;line-height:1.6}.lan-toolbar{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}.lan-page button,.lan-page select{font:inherit;padding:9px 14px;border:1px solid #8885;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.lan-page button:disabled{opacity:.4;cursor:default}.lan-page button.primary{background:#2563eb;color:white;border-color:#2563eb}.lan-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}.lan-card{border:1px solid #8884;border-radius:14px;padding:20px;background:var(--dsw-alias-button-elevated-fill)}.lan-card h2{font-size:18px;margin:8px 0}.lan-badge{display:inline-block;font-size:11px;padding:4px 7px;border-radius:5px;background:#8882;margin:0 5px 6px 0}.lan-tag{display:inline-block;padding:4px 8px;background:#2563eb15;border-radius:6px;margin:4px 5px 0 0}.lan-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.lan-error{padding:12px;background:#d3353520;border-radius:9px;overflow-wrap:anywhere}.lan-empty{border:1px dashed #8886;padding:50px;text-align:center;border-radius:14px}.lan-page pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.8}.lan-events{margin-top:28px}.lan-event{padding:7px 0;border-bottom:1px solid #8882;font-size:12px}.lan-card select{width:100%;margin-top:12px}`;
  function createApi() {
    // Desktop 0.2.1-rc.3 forwards dsh-app Fetch requests to its authenticated
    // Host in the shell's forwardWebRequest; the page never receives the cookie.
    return async (action, body) => {
      const response = await globalThis.fetch(`api/lan-discovery/${action}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('application/json')) throw Object.assign(new Error(`Harness Host returned non-JSON HTTP ${response.status}.`), { i18nKey: 'error.hostResponse', params: { status: response.status } });
      const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error ?? `HTTP ${response.status}`), { code: value.code }); return value;
    };
  }
  function App({ api, newSession, localeStore, t }) {
    React.useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot);
    const [state, setState] = React.useState(null); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(''); const [filter, setFilter] = React.useState('all'); const [models, setModels] = React.useState({}); const [message, setMessage] = React.useState(null);
    const [apiKeys, setApiKeys] = React.useState({}); const [editingKeys, setEditingKeys] = React.useState({});
    const refresh = React.useCallback(async () => { const value = await api('state'); setState(value); }, [api]);
    React.useEffect(() => { let live = true; const poll = () => api('state').then(value => { if (live) setState(value); }).catch(error => { if (live) setError(previous => previous || error); }); poll(); const timer = setInterval(poll, 2000); return () => { live = false; clearInterval(timer); }; }, [api]);
    const clearInput = id => setApiKeys(previous => { const next = { ...previous }; delete next[id]; return next; });
    async function finishConnection(result) {
      setMessage({ key: 'connection.success', params: { model: result.modelName ?? result.model } });
      await newSession?.();
    }
    async function act(action, body = {}, id = action) {
      setBusy(id); setError(''); setMessage(null);
      try {
        const result = await api(action, body); await refresh();
        if (action === 'connect') await finishConnection(result);
        if (action === 'forget-credential') { clearInput(id); setEditingKeys(previous => ({ ...previous, [id]: false })); }
      }
      catch (error) { setError(error); if (Object.hasOwn(CREDENTIAL_ERRORS, error?.code)) setEditingKeys(previous => ({ ...previous, [id]: true })); } finally { setBusy(''); }
    }
    async function verifyAndConnect(candidateId, modelId) {
      const apiKey = apiKeys[candidateId] ?? '';
      // Clear the controlled password immediately, including failed submissions.
      clearInput(candidateId); setBusy(candidateId); setError(''); setMessage(null);
      try {
        if (!/^[\x21-\x7e]{1,4096}$/.test(apiKey)) throw Object.assign(new Error('Invalid API key.'), { code: 'API_KEY_INVALID' });
        await api('credential', { candidateId, apiKey });
        setEditingKeys(previous => ({ ...previous, [candidateId]: false }));
        await refresh();
        const result = await api('connect', { candidateId, modelId });
        await refresh(); await finishConnection(result);
      } catch (error) {
        setError(error);
        // Keep the Host's credential status current after validation or connect
        // failure, while retaining the actionable error until another action.
        await refresh().catch(() => {});
      } finally { setBusy(''); }
    }
    const candidates = (state?.candidates ?? []).filter(candidate => filter === 'all' || candidate.details?.models?.some(model => filter === 'image' ? model.input_modalities.includes('image') : model.function_calling === 'supported')).sort((left, right) => String(left.instanceName ?? left.id).localeCompare(String(right.instanceName ?? right.id)) || String(left.id).localeCompare(String(right.id)));
    return h('div', { className: 'lan-page' }, h('style', null, css, '.lan-card h2{line-height:1.35;overflow-wrap:anywhere}.lan-specs{font-size:13px;line-height:1.6}.lan-machine{font-size:12px;margin:6px 0 10px}.lan-auth{margin-top:12px;font-size:12px;line-height:1.5}.lan-auth-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px}.lan-page button.lan-link{border:0;padding:0;font:inherit;text-decoration:underline;text-underline-offset:3px}.lan-key-form{display:flex;flex-direction:column;gap:8px;margin-top:8px}.lan-key-form input{box-sizing:border-box;width:100%;min-width:0;font:inherit;color:inherit;background:transparent;border:1px solid #8885;border-radius:8px;padding:9px 10px}.lan-key-form .primary{align-self:flex-start}.lan-key-note{margin:0;opacity:.65}'),
      h('div', { className: 'lan-head' }, h('div', null, h('h1', null, t('title')), h('p', { className: 'lan-muted' }, t('subtitle'))), h('span', { className: 'lan-badge' }, state === null ? t('status.connecting') : state.running ? t('status.discovering') : t('status.stopped'))),
      h('div', { className: 'lan-toolbar' }, h('button', { onClick: () => act(state?.running ? 'stop' : 'start'), disabled: !!busy }, state?.running ? t('action.stop') : t('action.start')), h('select', { value: filter, onChange: event => setFilter(event.target.value), 'aria-label': t('filter.label') }, h('option', { value: 'all' }, t('filter.all')), h('option', { value: 'image' }, t('filter.image')), h('option', { value: 'tools' }, t('filter.tools'))), h('button', { onClick: () => act('disconnect'), disabled: !!busy || (!state?.connections?.length && !state?.recovery?.pending) }, t('action.disconnect'))),
      (error || state?.error) && h('p', { className: 'lan-error', role: 'alert' }, errorText(error || state.error, t)), message && h('p', { role: 'status' }, t(message.key, message.params)),
      state && !state.trustConfigured && h('p', { className: 'lan-error' }, t('trust.required')),
      !candidates.length ? h('div', { className: 'lan-empty' }, h('h2', null, state === null ? t('empty.loading') : filter === 'all' ? t('empty.none') : t('empty.filtered')), h('p', { className: 'lan-muted' }, state === null ? t('empty.host') : t('empty.help'))) :
      h('div', { className: 'lan-grid' }, candidates.map(candidate => {
        const details = candidate.details; const available = details?.models ?? []; const selected = models[candidate.id] ?? available[0]?.id; const model = available.find(value => value.id === selected); const connected = state.connections.some(connection => connection.baseURL === candidate.baseURL); const valid = candidate.validation?.valid;
        const specs = model?.deployment; const title = model?.display_name ?? candidate.instanceName?.replace(/\._llm-api\._tcp\.local\.?$/, '') ?? candidate.id;
        const credential = candidate.credential; const keyRequired = credential?.required ?? candidate.auth !== 'none'; const keyConfigured = credential?.configured === true;
        const credentialError = details?.status === 'error' && Object.hasOwn(CREDENTIAL_ERRORS, details.code);
        const showKeyForm = keyRequired && (!keyConfigured || editingKeys[candidate.id] || (credentialError && editingKeys[candidate.id] !== false));
        const connectDisabled = !!busy || state?.recovery?.pending || !valid || !state.trustConfigured || (!!model && model.streaming !== 'supported');
        return h('article', { className: 'lan-card', key: candidate.id }, h('span', { className: 'lan-badge' }, details?.mock ? t('badge.mock') : t('badge.discovered')), connected && h('span', { className: 'lan-badge' }, t('badge.configured')), h('h2', null, title),
          specs && h('div', { className: 'lan-specs' }, [specs.parameters ? t('spec.parameters', { value: specs.parameters }) : null, specs.version ? t('spec.version', { value: specs.version }) : null, specs.quantization].filter(Boolean).join(' · ')),
          details?.nodeLabel && h('div', { className: 'lan-muted lan-machine' }, details.nodeLabel),
          model ? h('div', null, ...[model.input_modalities.includes('image') ? t('capability.image') : null, model.function_calling === 'supported' ? t('capability.tools') : null].filter(Boolean).map(label => h('span', { className: 'lan-tag', key: label }, label))) : h('p', { className: 'lan-muted' }, t('service.inspectHint')),
          h('div', { className: 'lan-auth' }, h('span', { className: 'lan-muted' }, !keyRequired ? t('auth.none') : keyConfigured ? t(credential.source === 'file' ? 'auth.file' : 'auth.session') : t('auth.required')),
            ((keyRequired && keyConfigured) || credential?.retainedSession === true) && h('div', { className: 'lan-auth-tools' },
              keyRequired && keyConfigured && !showKeyForm && h('button', { className: 'lan-link', disabled: !!busy, onClick: () => setEditingKeys(previous => ({ ...previous, [candidate.id]: true })) }, t('auth.change')),
              (credential.source === 'session' || credential.retainedSession === true) && h('button', { className: 'lan-link', disabled: !!busy, onClick: () => act('forget-credential', { candidateId: candidate.id }, candidate.id) }, t('auth.clear'))),
            showKeyForm && h('form', { className: 'lan-key-form', onSubmit: event => { event.preventDefault(); if (!connectDisabled) return verifyAndConnect(candidate.id, selected); } },
              h('input', { type: 'password', value: apiKeys[candidate.id] ?? '', placeholder: t('auth.placeholder'), 'aria-label': t('auth.inputLabel', { service: title }), autoComplete: 'off', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 4096, disabled: !!busy, onChange: event => { const value = event.target.value; setApiKeys(previous => ({ ...previous, [candidate.id]: value })); } }),
              h('p', { className: 'lan-key-note' }, t('auth.sessionHint')),
              h('button', { className: 'primary', type: 'submit', disabled: connectDisabled || !(apiKeys[candidate.id] ?? '').length }, busy === candidate.id ? t('action.busy') : t('auth.verifyConnect')),
              keyConfigured && editingKeys[candidate.id] && h('button', { type: 'button', className: 'lan-link', disabled: !!busy, onClick: () => { clearInput(candidate.id); setEditingKeys(previous => ({ ...previous, [candidate.id]: false })); } }, t('auth.cancel')))),
          available.length > 1 && h('select', { 'aria-label': t('service.model'), value: selected, onChange: event => setModels(previous => ({ ...previous, [candidate.id]: event.target.value })) }, available.map(value => h('option', { key: value.id, value: value.id }, [value.display_name ?? value.id, value.deployment?.quantization].filter(Boolean).join(' · ')))),
          !valid && h('p', { className: 'lan-error' }, candidate.validation?.errors?.length ? errorText(candidate.validation.errors.join('; '), t) : t('service.incompatible')), details?.status === 'error' && h('p', { className: 'lan-error' }, errorText({ code: details.code, message: details.message }, t)), model && model.streaming !== 'supported' && h('p', { className: 'lan-muted' }, t('service.streamingRequired')),
          h('div', { className: 'lan-actions' }, h('button', { disabled: !!busy || !valid || !state.trustConfigured, onClick: () => act('inspect', { candidateId: candidate.id }, candidate.id) }, busy === candidate.id ? t('action.busy') : t('action.inspect')), !showKeyForm && h('button', { className: 'primary', disabled: connectDisabled, onClick: () => act('connect', { candidateId: candidate.id, modelId: selected }, candidate.id) }, t('action.connect'))),
          h('details', null, h('summary', { className: 'lan-muted', style: { marginTop: 16, cursor: 'pointer' } }, t('service.protocol')), h('pre', null, JSON.stringify({ baseURL: candidate.baseURL, addresses: candidate.addresses, profile: candidate.apiProfile, version: candidate.protocolVersion, auth: candidate.auth, draftAuthCompatible: candidate.draftAuthCompatible, expiresAt: candidate.expiresAt, validation: candidate.validation }, null, 2))));
      })),
      h('details', { className: 'lan-events' }, h('summary', null, t('events.title')), (state?.events ?? []).slice(0, 20).map((event, index) => h('div', { key: index, className: 'lan-event' }, `${event.at} · ${Object.hasOwn(dictionaries.en, `event.${event.type}`) ? t(`event.${event.type}`) : event.type} · ${event.instanceName ?? event.reason ?? ''}`)))
    );
  }
  const inject = ['slots', 'layout', 'uiWorkspace', 'locale'];
  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'lan-discovery dictionaries');
    const t = ctx.locale.bind(NS);
    const localeStore = { subscribe: listener => ctx.locale.subscribe(listener), getSnapshot: () => ctx.locale.getSnapshot() };
    const api = createApi();
    let offMain; let offSidebar;
    const cleanup = () => { if (ctx.layout.panelInfo?.getSnapshot().activePanelId === 'lan-discovery') ctx.layout.selectPanel(null); offSidebar?.(); offMain?.(); };
    ctx.slots.inject('main', () => { offMain = ctx.slots.register({ name: 'main', key: 'lan-discovery' }, () => h(App, { api, localeStore, t, newSession: () => { ctx.layout.selectPanel(null); return ctx.uiWorkspace.startSession(undefined, { clearPreviousDraft: false }); } })); return cleanup; });
    ctx.slots.inject('sidebar.panellist', () => { offSidebar = ctx.slots.register({ name: 'sidebar.panellist', id: 'lan-discovery', order: 55, label: () => t('sidebar') }, () => h('span', { 'aria-hidden': true }, '◉')); return () => offSidebar?.(); });
  }
  return { apply, inject, createApi };
} });
