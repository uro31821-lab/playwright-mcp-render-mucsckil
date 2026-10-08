// Browser MCP session lifecycle. Credentials remain in the existing transport.
// A failed tool invocation is never replayed. Only metadata may recover once.
const VERSIONS = new Set(['2025-03-26', '2025-06-18', '2025-11-25']);
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const expired = error => error?.message === 'browser_http_404';

export function createBrowserSession({transport}) {
  if (!transport || typeof transport.request !== 'function') fail('browser_session_transport_required');
  let sessionId = null, version = '2025-03-26', initialized = false;
  let everInitialized = false, viewChanged = false, sequence = 0, pending = 0;
  let tail = Promise.resolve();
  const inFlight = new Map();
  const drop = () => { sessionId = null; initialized = false; viewChanged = everInitialized; };
  const enqueue = (key, fn) => {
    if (inFlight.has(key)) return inFlight.get(key);
    if (pending >= 8) return Promise.reject(new Error('browser_busy_no_request_sent'));
    pending++;
    const task = tail.then(fn);
    tail = task.catch(() => {});
    const result = task.finally(() => { pending--; inFlight.delete(key); });
    inFlight.set(key, result);
    return result;
  };
  const headers = (initial = false) => {
    const h = {'content-type':'application/json', accept:'application/json, text/event-stream'};
    if (!initial) {
      h['mcp-protocol-version'] = version;
      if (sessionId !== null) h['mcp-session-id'] = sessionId;
    }
    return h;
  };
  const parse = async (response, id) => {
    const body = await response.text();
    let envelopes;
    try {
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (type === 'application/json') envelopes = [JSON.parse(body)];
      else if (type === 'text/event-stream') {
        envelopes = body.split(/\r?\n\r?\n/).filter(x => x.split(/\r?\n/).some(y => y.startsWith('data:')))
          .map(x => JSON.parse(x.split(/\r?\n/).filter(y => y.startsWith('data:')).map(y => y.slice(5).trimStart()).join('\n')));
      } else fail('browser_response_type_invalid');
    } catch { fail('browser_response_invalid'); }
    const replies = envelopes.filter(x => object(x) && Object.hasOwn(x, 'id'));
    if (replies.length !== 1 || replies[0].id !== id || replies[0].jsonrpc !== '2.0' ||
        Object.hasOwn(replies[0], 'method') ||
        Object.hasOwn(replies[0], 'result') === Object.hasOwn(replies[0], 'error')) fail('browser_response_binding_invalid');
    if (Object.hasOwn(replies[0], 'error')) fail('browser_rpc_error_no_automatic_retry');
    return replies[0];
  };
  const request = async (method, params, initial = false) => {
    const id = ++sequence;
    const response = await transport.request({method:'POST', headers:headers(initial),
      body:JSON.stringify({jsonrpc:'2.0', id, method, params})});
    if (!response.ok) fail(`browser_http_${response.status}`);
    const result = await parse(response, id);
    if (!initial && response.headers.has('mcp-session-id') && response.headers.get('mcp-session-id') !== sessionId)
      fail('browser_session_changed_mid_response');
    return {response, result};
  };
  const initialize = async () => {
    if (initialized) return;
    // Never attach an expired ID to initialization.
    sessionId = null;
    try {
      const {response, result} = await request('initialize', {protocolVersion:'2025-03-26', capabilities:{},
        clientInfo:{name:'korean-life-hub', version:'browser-session-v2'}}, true);
      if (!object(result.result) || !VERSIONS.has(result.result.protocolVersion)) fail('browser_protocol_version_unsupported');
      version = result.result.protocolVersion;
      sessionId = response.headers.get('mcp-session-id');
      if (sessionId !== null && !/^[\x21-\x7e]{1,512}$/.test(sessionId)) fail('browser_session_id_invalid');
      const ack = await transport.request({method:'POST', headers:headers(),
        body:JSON.stringify({jsonrpc:'2.0', method:'notifications/initialized', params:{}})});
      if (![202,204].includes(ack.status) || (await ack.text()).trim() !== '') fail('browser_initialize_ack_invalid');
      initialized = true;
      everInitialized = true;
    } catch (error) { drop(); throw error; }
  };
  const catalog = async () => {
    await initialize();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const {result} = await request('tools/list', {});
        if (!object(result.result) || !Array.isArray(result.result.tools) ||
            result.result.tools.some(x => !object(x) || typeof x.name !== 'string')) fail('browser_catalog_invalid');
        return result;
      } catch (error) {
        const recover = attempt === 0 && sessionId !== null && expired(error);
        drop();
        if (!recover) throw error;
        await initialize();
      }
    }
    fail('browser_session_recovery_limit');
  };
  const rpc = (method, params = {}) => {
    if (!['tools/list','tools/call'].includes(method) || !object(params))
      return Promise.reject(new Error('browser_method_not_supported'));
    let frozen, key;
    try { key = method + '|' + JSON.stringify(params); frozen = JSON.parse(key.slice(method.length + 1)); }
    catch { return Promise.reject(new Error('browser_request_invalid')); }
    if (key.length > 1024 * 1024) return Promise.reject(new Error('browser_request_invalid'));
    return enqueue(key, async () => {
      const metadata = await catalog();
      if (method === 'tools/list') return metadata;
      if (typeof frozen.name !== 'string' || !object(frozen.arguments ?? {})) fail('browser_tool_request_invalid');
      const freshView = ['browser_snapshot','browser_navigate'].includes(frozen.name);
      const passive = freshView || frozen.name === 'browser_take_screenshot' ||
        (frozen.name === 'browser_tabs' && frozen.arguments?.action === 'list');
      if (viewChanged && !passive) fail('browser_session_changed_read_screen_first');
      if (!metadata.result.tools.some(t => t.name === frozen.name)) fail('browser_tool_not_available');
      try {
        // Exactly one tools/call. A 404, timeout or error never replays it.
        const {result} = await request('tools/call', frozen);
        if (!object(result.result)) fail('browser_tool_result_invalid');
        if (freshView && result.result.isError !== true) viewChanged = false;
        return result;
      } catch (error) {
        drop();
        if (expired(error)) fail('browser_session_expired_action_not_replayed');
        throw error;
      }
    });
  };
  return {
    rpc,
    probe: async () => { await rpc('tools/list'); },
    tool: async (name, args = {}) => (await rpc('tools/call', {name, arguments:args})).result
  };
}
