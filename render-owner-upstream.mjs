import http from 'node:http';
import { createOwnerControl, parseRPC, readJSON } from './render-owner-control.mjs';

export async function createOwnerUpstream({ origin, upstreamPort, cdpURL }) {
  if (cdpURL !== 'http://127.0.0.1:9222') throw Error('OWNER_CDP_CONFIG_INVALID');
  const { chromium } = await import('playwright');
  let browser;
  const getPage = async targetId => {
    if (!browser?.isConnected()) browser = await chromium.connectOverCDP(cdpURL);
    for (const context of browser.contexts()) for (const page of context.pages()) {
      const cdp = await context.newCDPSession(page);
      try {
        const result = await cdp.send('Target.getTargetInfo');
        if (result.targetInfo.targetId === targetId) {
          // Login popups remain in the same profile, and close back to the selected tab.
          const family = [page];
          for (const candidate of context.pages())
            if (!candidate.isClosed() && family.includes(await candidate.opener())) family.push(candidate);
          return family.at(-1);
        }
      } finally { await cdp.detach(); }
    }
    return null;
  };
  const owner = createOwnerControl({ origin, getPage });
  const rpc = async (body, headers) => {
    // Node's global fetch silently replaces a caller-supplied Host header with
    // 127.0.0.1, defeating upstream --allowed-hosts for the Secure MCP Tunnel.
    // Node's native HTTP client preserves the explicit Host instead.
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1', port: upstreamPort, method: 'POST', path: '/mcp',
        headers: { ...headers, 'content-length': Buffer.byteLength(payload) },
      }, upstream => {
        let raw = '';
        upstream.setEncoding('utf8');
        upstream.on('data', chunk => { raw += chunk; });
        upstream.on('aborted', () => reject(Error('OWNER_UPSTREAM_TRUNCATED')));
        upstream.on('error', reject);
        upstream.on('end', () => {
          const get = name => {
            const value = upstream.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(', ') : (value ?? null);
          };
          const status = upstream.statusCode ?? 502;
          resolve({ response: {
            status, ok: status >= 200 && status < 300,
            headers: { get, has: name => get(name) !== null },
          }, raw });
        });
      });
      request.setTimeout(15000, () => request.destroy(Error('OWNER_UPSTREAM_TIMEOUT')));
      request.on('error', reject);
      request.end(payload);
    });
  };
  return {
    handle: owner.handle,
    async mcp(req, res, { trustedTunnel = false } = {}) {
      // The caller has already verified the EXISTING MCP bearer token.
      if (req.url !== '/mcp' || req.method !== 'POST') {
        // Legacy SSE message routes and DELETE must not bypass the owner lock.
        if (req.url === '/mcp' && req.method === 'GET') return false;
        req.resume(); res.writeHead(405, { 'content-type': 'text/plain' }); res.end('Use POST /mcp');
        return true;
      }
      let entered = false, body;
      try {
        body = await readJSON(req);
        const metadata = ['initialize', 'notifications/initialized', 'tools/list', 'ping'].includes(body.method);
        // Metadata never touches a page and must not fail when the owner is typing.
        // This preserves the upstream session (and selected tab) during handoff.
        if (!metadata) { owner.beginMCP(body.params?._meta?.jhCommandId); entered = true; }
        const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
          // The loopback-only, approved Secure MCP Tunnel ingress connects with
          // Host: 127.0.0.1:8932. The upstream allowed-hosts check must see
          // our trusted Render hostname, not that internal tunnel transport.
          // Public bearer-protected traffic still preserves its actual Host.
          host: trustedTunnel ? new URL(origin).host : req.headers.host };
        for (const name of ['mcp-session-id', 'mcp-protocol-version'])
          if (req.headers[name]) headers[name] = req.headers[name];
        const { response, raw } = await rpc(body, headers);
        const outgoing = { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' };
        if (response.headers.has('mcp-session-id')) outgoing['mcp-session-id'] = response.headers.get('mcp-session-id');
        let output = raw;
        if (response.ok && body.method === 'tools/call' && body.params?.name === 'browser_take_screenshot') {
          const result = parseRPC(raw, body.id);
          if (!result.result?.isError && result.result) {
            try {
              const id = 'owner-target-' + Date.now();
              const info = await rpc({ jsonrpc: '2.0', id, method: 'tools/call', params: {
                name: 'browser_run_code_unsafe', arguments: { code: 'async (page) => { const c = await page.context().newCDPSession(page); try { return (await c.send("Target.getTargetInfo")).targetInfo.targetId; } finally { await c.detach(); } }' } } }, headers);
              const target = parseRPC(info.raw, id);
              const text = (target.result?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
              const targetId = /### Result\s+"([A-Fa-f0-9]{32})"/.exec(text)?.[1];
              if (!info.response.ok || target.result?.isError || !targetId) throw Error('OWNER_TARGET_UNCONFIRMED');
              result.result.content.push({ type: 'text', text: JSON.stringify({
                owner_view_url: owner.offer(targetId), expires_in_seconds: 300,
                same_playwright_page: true, user_action: '링크를 열고 직접 조작을 시작하세요. 완료 후 현재 화면을 다시 확인하세요.',
                login_verified: false,
              }) });
            } catch {
              result.result.content.push({ type: 'text', text: 'OWNER_LINK_UNAVAILABLE: 화면 연결을 확인하지 못했습니다.' });
            }
            output = JSON.stringify(result); outgoing['content-type'] = 'application/json';
          }
        }
        res.writeHead(response.status, outgoing); res.end(output);
      } catch (error) {
        const active = error.message === 'OWNER_CONTROL_ACTIVE';
        res.writeHead(active ? 200 : 409, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(active ? { jsonrpc: '2.0', id: body.id, result: { isError: true,
          content: [{ type: 'text', text: 'OWNER_CONTROL_ACTIVE: 사용자가 직접 조작 중입니다. 완료할 때까지 대기하세요. 자동 재시도 금지.' }] } } :
          { code: 'OWNER_MCP_NOT_REPLAYED', automaticReplay: false }));
      } finally { if (entered) owner.endMCP(); }
      return true;
    },
  };
}
