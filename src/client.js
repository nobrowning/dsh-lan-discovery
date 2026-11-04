/* Dependency-externalized browser entry for Desktop 0.2.1-rc.3. */
window.__ModuleLoader__.load({ id: 'dsh-lan-discovery', factory: require => {
  const React = require('react');
  const h = React.createElement;
  const NS = 'lan-discovery';
  /*__LAN_DICTIONARIES__*/
  const CREDENTIAL_ERRORS = { API_KEY_REQUIRED: 'error.apiKeyRequired', API_KEY_REJECTED: 'error.apiKeyRejected', API_KEY_INVALID: 'error.apiKeyInvalid', CREDENTIAL_STORE_UNAVAILABLE: 'error.credentialStoreUnavailable', CREDENTIAL_STORE_FAILED: 'error.credentialStoreFailed' };
  const AVAILABILITY_ERRORS = { SERVICE_UNAVAILABLE: 'status.serviceUnavailable', HOST_UNAVAILABLE: 'status.hostUnavailable' };
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
    if (Object.hasOwn(AVAILABILITY_ERRORS, error?.code)) return t(AVAILABILITY_ERRORS[error.code]);
    if (error?.i18nKey) return t(error.i18nKey, error.params);
    if (Object.hasOwn(CREDENTIAL_ERRORS, error?.code)) return t(CREDENTIAL_ERRORS[error.code]);
    const message = String(error?.message ?? error ?? '');
    return Object.hasOwn(HOST_ERRORS, message) ? t(HOST_ERRORS[message]) : t('error.generic', { message });
  }
  const css = `.lan-page{width:100%;padding:30px;max-width:1000px;margin:auto;height:100%;overflow:auto;box-sizing:border-box;color:var(--dsw-alias-label-primary);font:14px system-ui}.lan-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.lan-head h1{font-size:27px;margin:0}.lan-muted{opacity:.65;line-height:1.6}.lan-toolbar{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}.lan-page button,.lan-page select{font:inherit;padding:9px 14px;border:1px solid #8885;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.lan-page button:disabled{opacity:.4;cursor:default}.lan-page button:focus-visible,.lan-page summary:focus-visible{outline:2px solid #2563eb;outline-offset:3px}.lan-page button.primary{background:#2563eb;color:white;border-color:#2563eb}.lan-list{border:1px solid #8884;border-radius:14px;overflow:hidden;background:var(--dsw-alias-button-elevated-fill)}.lan-service+.lan-service{border-top:1px solid #8883}.lan-page button.lan-service-toggle{width:100%;display:flex;align-items:center;gap:16px;border:0;border-radius:0;text-align:left;padding:20px;background:transparent}.lan-page button.lan-service-toggle:hover{background:#8881}.lan-page button.lan-service-toggle[aria-expanded=true]{background:#2563eb08}.lan-page button.lan-service-toggle:focus-visible{outline-offset:-3px}.lan-service-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#8881;flex:none}.lan-service-icon svg{width:22px;height:22px;opacity:.75}.lan-service-info{display:block;flex:1;min-width:0}.lan-service-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:16px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}.lan-service-location,.lan-specs{display:block;font-size:12px;line-height:1.6;overflow-wrap:anywhere;margin-top:3px}.lan-service-meta{display:flex;gap:7px 12px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:12px;line-height:1.5}.lan-service-chevron{width:18px;flex:none;opacity:.6;transition:transform .15s}.lan-service-toggle[aria-expanded=true] .lan-service-chevron{transform:rotate(180deg)}.lan-service-panel{padding:0 24px 22px 74px;border-top:1px solid #8882}.lan-service-panel>p:first-child{margin-top:18px}.lan-service-panel select{max-width:100%;margin-top:16px}.lan-badge{display:inline-block;font-size:11px;padding:4px 7px;border-radius:5px;background:#8882}.lan-connected{color:#16804a;background:#16804a14;font-weight:500}.lan-tag{display:inline-block;padding:3px 7px;background:#2563eb12;border-radius:5px;font-size:11px}.lan-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.lan-auth{margin-top:18px;font-size:12px;line-height:1.5}.lan-auth-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.lan-page button.lan-link{border:0;padding:0;font:inherit;text-decoration:underline;text-underline-offset:3px}.lan-key-form{display:flex;flex-direction:column;gap:10px;margin-top:16px;max-width:440px}.lan-key-form input[type=password]{box-sizing:border-box;width:100%;min-width:0;font:inherit;color:inherit;background:transparent;border:1px solid #8885;border-radius:8px;padding:10px 12px}.lan-key-remember{display:flex;align-items:center;gap:7px;cursor:pointer}.lan-key-remember input{margin:0}.lan-key-form .primary{align-self:flex-start}.lan-key-note{margin:0;opacity:.65}.lan-simulation{font-size:12px;line-height:1.6;padding:10px 12px;border-left:2px solid #8885;background:#8881;border-radius:0 6px 6px 0}.lan-error{padding:12px;background:#d3353520;border-radius:9px;overflow-wrap:anywhere}.lan-empty{border:1px dashed #8886;padding:50px;text-align:center;border-radius:14px}.lan-page pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.8}.lan-events{margin-top:28px}.lan-event{padding:7px 0;border-bottom:1px solid #8882;font-size:12px}@media(max-width:600px){.lan-page{padding:20px 14px}.lan-head h1{font-size:23px}.lan-page button.lan-service-toggle{padding:16px 12px;gap:10px}.lan-service-icon{width:30px;height:30px}.lan-service-panel{padding:0 16px 20px}.lan-service-title{font-size:15px}}`;
  function createApi() {
    // Desktop 0.2.1-rc.3 forwards dsh-app Fetch requests to its authenticated
    // Host in the shell's forwardWebRequest; the page never receives the cookie.
    return async (action, body) => {
      let response;
      try { response = await globalThis.fetch(`api/lan-discovery/${action}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
      catch (error) { if (error instanceof TypeError || error?.name === 'TypeError') throw Object.assign(new Error('Harness Host is temporarily unavailable.'), { code: 'HOST_UNAVAILABLE' }); throw error; }
      if ([502, 503, 504].includes(response.status)) throw Object.assign(new Error('Harness Host is temporarily unavailable.'), { code: 'HOST_UNAVAILABLE' });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('application/json')) throw Object.assign(new Error(`Harness Host returned non-JSON HTTP ${response.status}.`), { i18nKey: 'error.hostResponse', params: { status: response.status } });
      const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error ?? `HTTP ${response.status}`), { code: value.code }); return value;
    };
  }
  function App({ api, newSession, localeStore, t }) {
    React.useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot);
    const [state, setState] = React.useState(null); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(''); const [filter, setFilter] = React.useState('all'); const [models, setModels] = React.useState({}); const [message, setMessage] = React.useState(null);
    const [apiKeys, setApiKeys] = React.useState({}); const [editingKeys, setEditingKeys] = React.useState({}); const [rememberKeys, setRememberKeys] = React.useState({});
    const [activeId, setActiveId] = React.useState(null);
    const [hostUnavailable, setHostUnavailable] = React.useState(false);
    const controlsDisabled = !!busy || hostUnavailable || !state;
    const canSaveCredentials = state?.credentialStorage?.available === true;
    const refresh = React.useCallback(async () => { const value = await api('state'); setState(value); setHostUnavailable(false); }, [api]);
    React.useEffect(() => { let live = true; const poll = () => api('state').then(value => { if (live) { setState(value); setHostUnavailable(false); setError(previous => previous?.code === 'HOST_UNAVAILABLE' ? '' : previous); } }).catch(error => { if (live) { if (error.code === 'HOST_UNAVAILABLE') setHostUnavailable(true); else setError(previous => previous || error); } }); poll(); const timer = setInterval(poll, 2000); return () => { live = false; clearInterval(timer); }; }, [api]);
    const clearInput = id => setApiKeys(previous => { const next = { ...previous }; delete next[id]; return next; });
    function selectService(id) {
      setApiKeys({}); setEditingKeys({}); setError(''); setMessage(null);
      setActiveId(activeId === id ? null : id);
    }
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
      catch (error) { setError(error); await refresh().catch(() => {}); if (Object.hasOwn(CREDENTIAL_ERRORS, error?.code)) setEditingKeys(previous => ({ ...previous, [id]: true })); } finally { setBusy(''); }
    }
    async function verifyAndConnect(candidateId, modelId) {
      const apiKey = apiKeys[candidateId] ?? '';
      // Clear the controlled password immediately, including failed submissions.
      clearInput(candidateId); setBusy(candidateId); setError(''); setMessage(null);
      try {
        if (!/^[\x21-\x7e]{1,4096}$/.test(apiKey)) throw Object.assign(new Error('Invalid API key.'), { code: 'API_KEY_INVALID' });
        await api('credential', { candidateId, apiKey, remember: canSaveCredentials && (rememberKeys[candidateId] ?? true) });
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
    React.useEffect(() => {
      if (activeId && !candidates.some(candidate => candidate.id === activeId)) {
        setActiveId(null); setApiKeys({}); setEditingKeys({}); setError(''); setMessage(null);
      }
    }, [activeId, state, filter]);
    return h('div', { className: 'lan-page' }, h('style', null, css),
      h('div', { className: 'lan-head' }, h('div', null, h('h1', null, t('title')), h('p', { className: 'lan-muted' }, t('subtitle'))), h('span', { className: 'lan-badge' }, hostUnavailable ? t('status.connecting') : state === null ? t('status.connecting') : state.discoveryStatus === 'waiting' ? t('status.waiting') : state.discoveryStatus === 'error' ? t('status.discoveryError') : state.running ? t('status.discovering') : t('status.stopped'))),
      h('div', { className: 'lan-toolbar' }, h('button', { onClick: () => act(state?.running ? 'stop' : 'start'), disabled: controlsDisabled }, state?.running ? t('action.stop') : t('action.start')), h('select', { value: filter, onChange: event => setFilter(event.target.value), 'aria-label': t('filter.label') }, h('option', { value: 'all' }, t('filter.all')), h('option', { value: 'image' }, t('filter.image')), h('option', { value: 'tools' }, t('filter.tools'))), h('button', { onClick: () => act('disconnect'), disabled: controlsDisabled || (!state?.connections?.length && !state?.recovery?.pending) }, t('action.disconnect'))),
      (error || state?.error) && h('p', { className: Object.hasOwn(AVAILABILITY_ERRORS, error?.code) ? 'lan-muted' : 'lan-error', role: Object.hasOwn(AVAILABILITY_ERRORS, error?.code) ? 'status' : 'alert' }, errorText(error || state.error, t)),
      hostUnavailable && h('p', { className: 'lan-muted', role: 'status' }, t('status.hostUnavailable')),
      state?.network && h('p', { className: 'lan-muted', role: 'status' }, t(state.network.mode === 'auto' ? 'network.auto' : 'network.pinned')),
      state?.discoveryStatus === 'waiting' && h('p', { className: 'lan-muted', role: 'status' }, t(state?.network?.mode === 'auto' ? 'status.waitingAutoHint' : 'status.waitingHint')),
      state?.connections?.some(connection => connection.available === false) && h('p', { className: 'lan-muted', role: 'status' }, t('status.serviceUnavailable')), message && h('p', { role: 'status' }, t(message.key, message.params)),
      state && !state.trustConfigured && h('p', { className: 'lan-error' }, t('trust.required')),
      !candidates.length ? h('div', { className: 'lan-empty' }, h('h2', null, state === null ? t('empty.loading') : filter === 'all' ? t('empty.none') : t('empty.filtered')), h('p', { className: 'lan-muted' }, state === null ? t('empty.host') : t('empty.help'))) :
      h('div', { className: 'lan-list' }, candidates.map(candidate => {
        const details = candidate.details; const available = details?.models ?? []; const selected = models[candidate.id] ?? available[0]?.id; const model = available.find(value => value.id === selected); const connected = state.connections.some(connection => connection.baseURL === candidate.baseURL && connection.available !== false); const valid = candidate.validation?.valid;
        const specs = model?.deployment; const title = model?.display_name ?? candidate.instanceName?.replace(/\._llm-api\._tcp\.local\.?$/, '') ?? candidate.id;
        const credential = candidate.credential; const keyRequired = credential?.required ?? candidate.auth !== 'none'; const keyConfigured = credential?.configured === true;
        const credentialError = details?.status === 'error' && Object.hasOwn(CREDENTIAL_ERRORS, details.code);
        const showKeyForm = keyRequired && (!keyConfigured || editingKeys[candidate.id] || (credentialError && editingKeys[candidate.id] !== false));
        const rememberKey = canSaveCredentials && (rememberKeys[candidate.id] ?? true);
        const retainedCredential = credential?.retainedSession === true || credential?.retainedSaved === true;
        const connectDisabled = controlsDisabled || state?.recovery?.pending || !valid || !state.trustConfigured || (!!model && model.streaming !== 'supported');
        const expanded = activeId === candidate.id;
        const panelId = `lan-service-${encodeURIComponent(candidate.id)}`;
        const location = details?.nodeLabel ?? candidate.hostname ?? candidate.baseURL;
        const authLabel = !keyRequired ? t('auth.none') : keyConfigured ? t(credential.source === 'saved' ? 'auth.saved' : credential.source === 'file' ? 'auth.file' : 'auth.session') : t('auth.required');
        return h('article', { className: 'lan-service', key: candidate.id, onKeyDown: event => {
          if (event.key === 'Escape' && expanded && !busy) {
            event.preventDefault(); event.stopPropagation(); selectService(candidate.id);
            event.currentTarget.querySelector?.('.lan-service-toggle')?.focus();
          }
        } },
          h('button', { type: 'button', className: 'lan-service-toggle', 'data-service-id': candidate.id, id: `${panelId}-toggle`, 'aria-expanded': expanded, 'aria-controls': panelId, 'aria-label': t(expanded ? 'service.collapse' : 'service.expand', { service: title }), 'aria-describedby': [location && `${panelId}-location`, specs && `${panelId}-specs`, connected && `${panelId}-connected`, `${panelId}-status`].filter(Boolean).join(' '), disabled: controlsDisabled, onClick: () => selectService(candidate.id) },
            h('span', { className: 'lan-service-icon', 'aria-hidden': true }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }, h('rect', { x: 3, y: 4, width: 18, height: 6, rx: 2 }), h('rect', { x: 3, y: 14, width: 18, height: 6, rx: 2 }), h('path', { d: 'M7 7h.01M7 17h.01M11 7h6M11 17h6', strokeLinecap: 'round' }))),
            h('span', { className: 'lan-service-info' },
              h('span', { className: 'lan-service-title' }, title, connected && h('span', { className: 'lan-badge lan-connected', id: `${panelId}-connected` }, t('badge.connected'))),
              location && h('span', { className: 'lan-muted lan-service-location', id: `${panelId}-location` }, location),
              specs && h('span', { className: 'lan-muted lan-specs', id: `${panelId}-specs` }, [specs.parameters ? t('spec.parameters', { value: specs.parameters }) : null, specs.version ? t('spec.version', { value: specs.version }) : null, specs.quantization].filter(Boolean).join(' · ')),
              h('span', { className: 'lan-service-meta', id: `${panelId}-status` }, h('span', { className: 'lan-muted' }, authLabel), ...[model?.input_modalities.includes('image') ? t('capability.image') : null, model?.function_calling === 'supported' ? t('capability.tools') : null].filter(Boolean).map(label => h('span', { className: 'lan-tag', key: label }, label)))),
            h('svg', { className: 'lan-service-chevron', viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'm5 7.5 5 5 5-5', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
          expanded && h('section', { className: 'lan-service-panel', id: panelId, 'aria-labelledby': `${panelId}-toggle` },
          details?.mock === true && h('p', { className: 'lan-simulation' }, t('service.simulatedNote')),
          !model && h('p', { className: 'lan-muted' }, t('service.inspectHint')),
          h('div', { className: 'lan-auth' },
            ((keyRequired && keyConfigured) || retainedCredential) && h('div', { className: 'lan-auth-tools' },
              keyRequired && keyConfigured && !showKeyForm && h('button', { className: 'lan-link', disabled: controlsDisabled, onClick: () => setEditingKeys(previous => ({ ...previous, [candidate.id]: true })) }, t('auth.change')),
              (credential.source === 'session' || credential.source === 'saved' || retainedCredential) && h('button', { className: 'lan-link', disabled: controlsDisabled, onClick: () => act('forget-credential', { candidateId: candidate.id }, candidate.id) }, t('auth.clear'))),
            showKeyForm && h('form', { className: 'lan-key-form', onSubmit: event => { event.preventDefault(); if (!connectDisabled) return verifyAndConnect(candidate.id, selected); } },
              h('input', { type: 'password', value: apiKeys[candidate.id] ?? '', placeholder: t('auth.placeholder'), 'aria-label': t('auth.inputLabel', { service: title }), autoComplete: 'off', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 4096, disabled: controlsDisabled, onChange: event => { const value = event.target.value; setApiKeys(previous => ({ ...previous, [candidate.id]: value })); } }),
              canSaveCredentials && h('label', { className: 'lan-key-remember' }, h('input', { type: 'checkbox', checked: rememberKey, disabled: controlsDisabled, onChange: event => { const checked = event.target.checked; setRememberKeys(previous => ({ ...previous, [candidate.id]: checked })); } }), t('auth.remember')),
              h('p', { className: 'lan-key-note' }, t(rememberKey ? 'auth.savedHint' : 'auth.sessionHint')),
              !canSaveCredentials && h('p', { className: 'lan-key-note' }, t('auth.storageUnavailable')),
              h('button', { className: 'primary', type: 'submit', disabled: connectDisabled || !(apiKeys[candidate.id] ?? '').length }, busy === candidate.id ? t('action.busy') : t('auth.verifyConnect')),
              keyConfigured && editingKeys[candidate.id] && h('button', { type: 'button', className: 'lan-link', disabled: controlsDisabled, onClick: () => { clearInput(candidate.id); setEditingKeys(previous => ({ ...previous, [candidate.id]: false })); } }, t('auth.cancel')))),
          available.length > 1 && h('select', { 'aria-label': t('service.model'), value: selected, onChange: event => setModels(previous => ({ ...previous, [candidate.id]: event.target.value })) }, available.map(value => h('option', { key: value.id, value: value.id }, [value.display_name ?? value.id, value.deployment?.quantization].filter(Boolean).join(' · ')))),
          !valid && h('p', { className: 'lan-error' }, candidate.validation?.errors?.length ? errorText(candidate.validation.errors.join('; '), t) : t('service.incompatible')), details?.status === 'unavailable' && h('p', { className: 'lan-muted', role: 'status' }, t('status.serviceUnavailable')), details?.status === 'error' && h('p', { className: 'lan-error' }, errorText({ code: details.code, message: details.message }, t)), model && model.streaming !== 'supported' && h('p', { className: 'lan-muted' }, t('service.streamingRequired')),
          h('div', { className: 'lan-actions' }, h('button', { disabled: controlsDisabled || !valid || !state.trustConfigured, onClick: () => act('inspect', { candidateId: candidate.id }, candidate.id) }, busy === candidate.id ? t('action.busy') : t('action.inspect')), !showKeyForm && h('button', { className: 'primary', disabled: connectDisabled, onClick: () => act('connect', { candidateId: candidate.id, modelId: selected }, candidate.id) }, t('action.connect'))),
          h('details', null, h('summary', { className: 'lan-muted', style: { marginTop: 16, cursor: 'pointer' } }, t('service.protocol')), h('pre', null, JSON.stringify({ baseURL: candidate.baseURL, addresses: candidate.addresses, profile: candidate.apiProfile, version: candidate.protocolVersion, auth: candidate.auth, draftAuthCompatible: candidate.draftAuthCompatible, expiresAt: candidate.expiresAt, validation: candidate.validation }, null, 2)))));
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
