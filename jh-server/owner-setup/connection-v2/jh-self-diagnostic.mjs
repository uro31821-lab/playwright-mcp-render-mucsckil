// JH read-only self diagnostics module (Node 18+)
// Wiring is explicit: adapters must be supplied by the existing application.
// Never performs reconnect, credential exchange, user action, job replay, or writes.
const safeError = (error) => error?.name === 'AbortError' ? 'TIMEOUT' : 'CHECK_ERROR';
const allowedStates = new Set(['PASS', 'FAIL', 'UNKNOWN']);
const check = async (id, label, fn, timeoutMs) => {
  if (typeof fn !== 'function') return { id, label, state: 'UNKNOWN', code: 'NOT_CONFIGURED' };
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {timer = setTimeout(() => reject(Object.assign(new Error('timeout'), {name:'AbortError'})), timeoutMs);})
    ]);
    if (!result || !allowedStates.has(result.state)) return { id, label, state: 'UNKNOWN', code:'INVALID_ADAPTER_RESULT' };
    // Do not emit opaque adapter payloads: protect PII, device ids, secrets, raw traces.
    const code = String(result.code || 'UNSPECIFIED').replace(/[^A-Z0-9_]/g, '_').slice(0, 72);
    return { id, label, state: result.state, code };
  } catch (error) {
    return { id, label, state: 'UNKNOWN', code: safeError(error) };
  } finally { clearTimeout(timer); }
};

export async function diagnoseJH(adapters = {}, options = {}) {
  const timeoutMs = Math.max(100, Math.min(Number(options.timeoutMs) || 3000, 10000));
  const spec = [
    ['server', 'JH 서버', adapters.server],
    ['mcp', 'ChatGPT → MCP 호출', adapters.mcp],
    ['browser', 'Playwright 브라우저', adapters.browser],
    ['bridge', 'Android Bridge 기기 응답', adapters.bridge],
    ['security', '기기 결합 보안 세션', adapters.security]
  ];
  const checks = await Promise.all(spec.map(([id, label, fn]) => check(id, label, fn, timeoutMs)));
  const failed = checks.filter(x=>x.state==='FAIL');
  const unknown = checks.filter(x=>x.state==='UNKNOWN');
  const overall = failed.length ? 'FAIL' : unknown.length ? 'PARTIAL' : 'PASS';
  return {schemaVersion: 1, readonly: true, overall, checks, actionsPerformed: [],
    advice: failed.length ? 'FAILED_CHECK_REQUIRES_MANUAL_REVIEW' : unknown.length ? 'CHECKS_INCOMPLETE' : 'CONNECTED_CHECKS_PASSED',
    note: 'Check results are point-in-time and do not prove downstream UI action success.'};
}

// For existing Express app: app.get('/internal/jh/diagnostics', authMiddleware, handler)
// Always use existing authentication + authorization and rate-limit middleware.
export function createJHDiagnosticHandler(adapters, options) {
  return async (_req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.json(await diagnoseJH(adapters, options));
  };
}
