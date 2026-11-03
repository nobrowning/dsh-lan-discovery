/** Deliberately small Responses binding for the documented mock capabilities. */
// Exact producer contracts verified in the installed Harness 0.2.1-rc.3.
// Other user-role messages (including unknown plugins and real follow-ups)
// retain ordinary turn semantics. The payload itself is always preserved.
const DEMO_CONTEXT_PRODUCERS = new Map([
  ['time-context', new Set(['snapshot'])],
  ['skill-catalog', new Set(['catalog'])],
  ['agent-instructions', new Set(['instructions'])],
  // RuntimeContextProjection in dsh-agent-loop also emits a form-less message
  // when clearing its previously admitted snapshot (installed :331–350).
  ['runtime-context', new Set(['snapshot', undefined])],
]);

const diagnosticIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value) ? value : null;

/** Only schema labels; never copy message content, source extras, paths or arguments. */
export function requestShapeDiagnostics(options, body) {
  const messages = options.messages ?? [];
  return {
    messages: messages.slice(-128).map(message => ({
      role: ['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role) ? message.role : null,
      source: { kind: diagnosticIdentifier(message.source?.kind), form: diagnosticIdentifier(message.source?.form) },
    })),
    messagesTruncated: messages.length > 128,
    tools: (body.tools ?? []).map(tool => diagnosticIdentifier(tool.name)),
  };
}

export async function buildResponsesRequest(options, { readImage, imageSupported = false, functionCalling = false, demoMode = false } = {}) {
  const input = []; const contextIndices = [];
  if (options.system) input.push({ role: 'system', content: [{ type: 'input_text', text: options.system }] });
  for (const message of options.messages ?? []) {
    // Preserve Harness roles. A demo-only, standard metadata field records its
    // explicitly attributed Host context for deterministic Mock turn handling.
    // User text is never inspected or promoted to a higher-priority role.
    const role = message.role;
    if (role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') });
      continue;
    }
    const content = [];
    for (const block of message.content ?? []) {
      if (block.type === 'text') content.push({ type: role === 'assistant' ? 'output_text' : 'input_text', text: block.text });
      else if (block.type === 'image') {
        if (!imageSupported || !readImage || role !== 'user') throw new Error('This route cannot send the supplied image content.');
        const image = await readImage(block.attachment, options.signal);
        if (!/^image\/(png|jpeg|webp|gif)$/.test(image.mediaType) || image.data.byteLength > 5 * 1024 * 1024) throw new Error('Unsupported image format or size.');
        content.push({ type: 'input_image', image_url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` });
      } else if (block.type === 'tool-call' && role === 'assistant') {
        if (content.length) input.push({ role, content: content.splice(0) });
        input.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: block.arguments });
      } else if (block.type !== 'reasoning') throw new Error(`Unsupported history block: ${block.type}.`);
    }
    if (content.length) {
      const source = message.source;
      if (demoMode && role === 'user' && source && DEMO_CONTEXT_PRODUCERS.get(source.kind)?.has(source.form) && content.every(block => block.type === 'input_text')) contextIndices.push(input.length);
      input.push({ role, content });
    }
  }
  const tools = functionCalling ? (options.tools ?? []).filter(tool => !tool.deferLoading).map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters, strict: false })) : [];
  const contextMetadata = JSON.stringify(contextIndices);
  if (contextIndices.length > 64 || contextMetadata.length > 512) throw new Error('The demo Host-context metadata exceeds its supported limit.');
  return { model: options.model, input, stream: true, store: false, ...(contextIndices.length ? { metadata: { demo_context_indices: contextMetadata } } : {}), ...(tools.length ? { tools } : {}), ...(options.maxTokens === undefined ? {} : { max_output_tokens: options.maxTokens }), ...(options.temperature === undefined ? {} : { temperature: options.temperature }) };
}

export async function* parseSSE(source, { maxEventBytes = 1024 * 1024, maxTotalBytes = 16 * 1024 * 1024 } = {}) {
  const decoder = new TextDecoder();
  let pending = ''; let total = 0;
  for await (const bytes of source) {
    total += bytes.length;
    if (total > maxTotalBytes) throw new Error('SSE response exceeded the experiment size limit.');
    pending += decoder.decode(bytes, { stream: true });
    pending = pending.replaceAll('\r\n', '\n');
    let end;
    while ((end = pending.indexOf('\n\n')) !== -1) {
      const frame = pending.slice(0, end); pending = pending.slice(end + 2);
      if (Buffer.byteLength(frame) > maxEventBytes) throw new Error('SSE event exceeded the experiment size limit.');
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') {
        let event;
        try { event = JSON.parse(data); } catch { throw new Error('The service returned an invalid SSE event.'); }
        yield event;
      }
    }
    if (Buffer.byteLength(pending) > maxEventBytes) throw new Error('SSE event exceeded the experiment size limit.');
  }
  pending += decoder.decode();
  if (pending.trim()) throw new Error('SSE stream ended with an incomplete event.');
}

export async function* responsesToHarness(events) {
  const text = new Map(); const tools = new Map(); let nextIndex = 0;
  let hasContent = false; let hasTools = false;
  for await (const event of events) {
    if (event.type === 'response.failed' || event.type === 'error') throw new Error('The Responses service reported a failed response.');
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
      if (!event.item.call_id || !event.item.name) throw new Error('Function call is missing its identity.');
      const item = { index: nextIndex++, id: event.item.call_id, name: event.item.name, arguments: '', closed: false };
      tools.set(event.output_index, item); hasTools = hasContent = true;
      yield { type: 'block-start', index: item.index, blockType: 'tool-call' };
    } else if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done') {
      const key = `${event.output_index}:${event.content_index ?? 0}`;
      let block = text.get(key);
      if (!block) { block = { index: nextIndex++, text: '', closed: false }; text.set(key, block); yield { type: 'block-start', index: block.index, blockType: 'text' }; }
      if (block.closed) throw new Error('Received text after a completed content block.');
      if (event.type.endsWith('.delta')) { block.text += event.delta; hasContent ||= !!event.delta; yield { type: 'text-delta', index: block.index, text: event.delta }; }
      else {
        if (block.text !== event.text && block.text) throw new Error('Final text disagrees with streamed deltas.');
        if (!block.text && event.text) { block.text = event.text; hasContent = true; yield { type: 'text-delta', index: block.index, text: event.text }; }
        block.closed = true; yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.text } };
      }
    } else if (event.type === 'response.function_call_arguments.delta') {
      const item = tools.get(event.output_index);
      if (!item || item.closed) throw new Error('Function arguments arrived without an open call.');
      item.arguments += event.delta;
      yield { type: 'tool-call-delta', index: item.index, id: item.id, name: item.name, argumentsDelta: event.delta };
    } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const item = tools.get(event.output_index);
      if (!item || item.closed || item.id !== event.item.call_id || item.name !== event.item.name) throw new Error('Completed function call identity changed.');
      if (item.arguments && item.arguments !== event.item.arguments) throw new Error('Final tool arguments disagree with streamed deltas.');
      item.arguments = event.item.arguments;
      try { JSON.parse(item.arguments); } catch { throw new Error('The service returned invalid function arguments.'); }
      item.closed = true;
      yield { type: 'block-end', index: item.index, block: { type: 'tool-call', id: item.id, name: item.name, arguments: item.arguments } };
    } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      if (!hasContent) throw new Error('The response completed without text or function calls.');
      for (const block of text.values()) if (!block.closed) { block.closed = true; yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.text } }; }
      for (const item of tools.values()) if (!item.closed) throw new Error('The response ended with an incomplete function call.');
      const usage = event.response?.usage ?? {};
      yield { type: 'usage', usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, totalTokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) } };
      yield { type: 'finish', reason: { kind: event.type === 'response.incomplete' ? 'max-tokens' : hasTools ? 'tool-calls' : 'stop' } };
      return;
    }
  }
  throw new Error('SSE stream ended without a Responses terminal event.');
}

/** Structural implementation of the installed 0.2.1-rc.3 LlmAdapter contract. */
export function modelDisplayName(model, mock = false) {
  return [model.display_name ?? model.id, model.deployment?.quantization, mock ? 'Mock' : undefined].filter(Boolean).join(' · ');
}

function modelDescription(model, mock) {
  return [model.deployment?.parameters, model.deployment?.version ? `Version ${model.deployment.version}` : undefined, mock ? 'Simulated deployment; no model weights are loaded.' : undefined].filter(Boolean).join(' · ') || undefined;
}

export class ResponsesAdapter {
  constructor({ binding, transport, models, mock = false, demoMode = false, readImage, onRequestDiagnostics }) { this.binding = binding; this.transport = transport; this.models = models; this.mock = mock; this.demoMode = demoMode; this.readImage = readImage; this.onRequestDiagnostics = onRequestDiagnostics; }
  providerInfo(provider) { return { id: provider, name: `${this.binding.instanceName} · LAN${this.mock ? ' Mock' : ''}` }; }
  providerRetryPolicy() { return undefined; }
  imageRequestPricing() { return undefined; }
  imageRequestTarget(_provider, _model, image) { return { width: image.width, height: image.height, maxBytes: image.bytes }; }
  async listModels(provider) { return this.models.map(model => ({ provider, id: model.id, name: modelDisplayName(model, this.mock), description: modelDescription(model, this.mock), inputModalities: model.input_modalities ?? ['text'] })); }
  async resolveModel(provider, model) {
    const entry = this.models.find(entry => entry.id === model);
    if (!entry || provider !== this.binding.provider) throw new Error('This LAN route does not own that model.');
    return { provider, id: model, name: modelDisplayName(entry, this.mock), description: modelDescription(entry, this.mock), inputModalities: entry.input_modalities ?? ['text'], context: { contextWindow: 32768 }, defaultMaxTokens: 2048 };
  }
  async prepareCall(provider, model, signal) { return { model: await this.resolveModel(provider, model), stream: options => this.stream({ ...options, signal: options.signal ?? signal }) }; }
  async *stream(options) {
    await this.resolveModel(options.provider, options.model);
    const model = this.models.find(model => model.id === options.model);
    if (model.streaming !== 'supported') throw new Error('This client adapter requires a declared streaming Responses service.');
    const body = await buildResponsesRequest(options, { readImage: this.readImage, imageSupported: model.input_modalities?.includes('image'), functionCalling: model.function_calling === 'supported', demoMode: this.demoMode });
    this.onRequestDiagnostics?.(requestShapeDiagnostics(options, body));
    const response = await this.transport.open('responses', { method: 'POST', body, signal: options.signal });
    try {
      if (!String(response.headers['content-type']).toLowerCase().startsWith('text/event-stream')) throw new Error('The selected service did not return SSE.');
      yield* responsesToHarness(parseSSE(response));
    } finally { response.destroy(); }
  }
}
