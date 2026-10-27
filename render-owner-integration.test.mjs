import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchOwnerBrowser } from './render-owner-browser.mjs';
import { parseRPC } from './render-owner-control.mjs';

test('same-tab owner login, MCP pause/resume, persistent login and expiry', { timeout: 90000 }, async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'jh-owner-test-'));
  let revoked = false, context, proxy;
  const site = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/login') {
      res.setHeader('Set-Cookie', 'fixtureAccount=A; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax');
      res.writeHead(302, { Location: '/account' }); res.end(); return;
    }
    res.setHeader('Content-Type', 'text/html');
    const logged = !revoked && req.headers.cookie?.includes('fixtureAccount=A');
    res.end(logged ? '<h1>Fixture account A</h1><script>localStorage.setItem("fixture","retained")</script>' :
      '<form action="/login"><input aria-label="fixture-user" style="position:absolute;left:10px;top:10px;width:250px;height:40px"><input type="password" aria-label="fixture-password" style="position:absolute;left:10px;top:70px;width:250px;height:40px"><button style="position:absolute;left:10px;top:130px">Sign in</button></form>');
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const siteURL = `http://127.0.0.1:${site.address().port}`;
  const freePort = async () => {
    const server = http.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port; await new Promise(r => server.close(r)); return port;
  };
  const upstream = await freePort(), publicPort = await freePort();
  const base = `http://127.0.0.1:${publicPort}`;
  let logs = '', session, sequence = 0;
  const mcp = async (method, params = {}) => {
    const id = ++sequence;
    const response = await fetch(base + '/mcp', { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      authorization: 'Bearer synthetic-mcp-test-token-not-real',
      ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-03-26' } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    if (response.headers.has('mcp-session-id')) session = response.headers.get('mcp-session-id');
    const raw = await response.text();
    assert.equal(response.status, 200, raw);
    return parseRPC(raw, id);
  };
  const tool = async (name, args = {}) => (await mcp('tools/call', { name, arguments: args })).result;
  const api = async (endpoint, body, secret) => {
    const response = await fetch(base + '/owner/' + endpoint, { method: 'POST',
      headers: { origin: 'https://owner.example', 'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
  };
  try {
    context = await launchOwnerBrowser({ profile, port: 9222, persistent: false,
      executablePath: process.env.JH_TEST_CHROMIUM_PATH });
    // Keep two tabs open: the owner must receive the MCP-selected tab, not the first one.
    await context.pages()[0].goto(siteURL + '/unrelated');
    proxy = spawn(process.execPath, ['render-auth-proxy.mjs', process.execPath, 'cli.js',
      '--cdp-endpoint', 'http://127.0.0.1:9222', '--shared-browser-context', '--host', '127.0.0.1',
      '--port', String(upstream), '--allowed-hosts', '*'], {
      cwd: new URL('.', import.meta.url).pathname,
      env: { ...process.env, PORT: String(publicPort), UPSTREAM_PORT: String(upstream),
        MCP_TOKEN: 'synthetic-mcp-test-token-not-real', JH_OWNER_VIEW: '1',
        CONTROL_PLANE_API_KEY: 'synthetic-tunnel-key', CONTROL_PLANE_TUNNEL_ID: 'synthetic-tunnel-id',
        JH_OWNER_CDP_URL: 'http://127.0.0.1:9222', RENDER_EXTERNAL_HOSTNAME: 'owner.example' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proxy.stdout.on('data', b => { logs += b; }); proxy.stderr.on('data', b => { logs += b; });
    for (let i = 0; i < 150; i++) {
      try { await fetch(base); break; } catch { await delay(100); }
    }
    await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'owner-test', version: '1' } });
    await tool('browser_tabs', { action: 'new' });
    const navigation = await tool('browser_navigate', { url: siteURL + '/account' });
    assert.ok(!navigation.isError, JSON.stringify(navigation));
    const screenshot = await tool('browser_take_screenshot');
    const offer = screenshot.content.filter(c => c.type === 'text').map(c => {
      try { return JSON.parse(c.text); } catch { return null; }
    }).find(c => c?.owner_view_url);
    assert.ok(offer, JSON.stringify(screenshot.content.filter(c => c.type === 'text')));
    const ticket = new URL(offer.owner_view_url).hash.slice(1);
    assert.ok(!(await tool('browser_tabs', { action: 'list' })).isError);
    // Client capability discovery may be unsupported upstream, but it still
    // must not consume an already-issued owner link.
    await mcp('resources/list');
    await mcp('resources/templates/list');
    await mcp('prompts/list');
    // The JH self-diagnostic/readback may inspect the same page while the
    // owner switches devices. It must not revoke the pending 30-minute link.
    const interveningRead = await tool('browser_snapshot');
    assert.ok(!interveningRead.isError, JSON.stringify(interveningRead));
    const { secret } = await api('claim', { ticket });
    assert.ok((await tool('browser_snapshot')).isError);
    const privateReply = await fetch('http://127.0.0.1:8932/mcp', { method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': session,
        accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'tunnel-fence', method: 'tools/call',
        params: { name: 'browser_snapshot', arguments: {} } }) });
    assert.equal((await privateReply.json()).result.isError, true);
    // Metadata remains usable; manual lock does not expire or replace the MCP session.
    assert.ok((await mcp('tools/list')).result.tools.length > 0);
    const action = async body => {
      const { frame } = await api('frame', {}, secret);
      await api('input', { ...body, frame }, secret);
    };
    await action({ type: 'click', x: 100, y: 30 });
    await action({ type: 'text', text: 'synthetic-user' });
    await action({ type: 'click', x: 100, y: 90 });
    await action({ type: 'text', text: 'synthetic-password-should-not-appear-in-logs' });
    await action({ type: 'key', key: 'Enter' });
    const page = context.pages().find(p => p.url().endsWith('/account'));
    await page.waitForSelector('h1');
    assert.equal(await context.pages()[0].locator('input').first().inputValue(), '');
    const done = await api('finish', {}, secret); assert.equal(done.loginVerified, false);
    const snapshot = await tool('browser_snapshot');
    assert.match(JSON.stringify(snapshot), /Fixture account A/);
    assert.ok(!logs.includes('synthetic-password-should-not-appear-in-logs'));
    assert.ok(!logs.includes(ticket));
    assert.ok(!logs.includes(secret));
    assert.match(logs, /LINK_CLAIMED/);
    assert.match(logs, /CONTROL_RELEASED/);
    proxy.kill('SIGTERM'); await new Promise(resolve => proxy.once('exit', resolve)); proxy = null;
    await context.close();
    context = await launchOwnerBrowser({ profile, port: 9222, persistent: false,
      executablePath: process.env.JH_TEST_CHROMIUM_PATH });
    const restored = context.pages()[0]; await restored.goto(siteURL + '/account');
    assert.equal(await restored.locator('h1').textContent(), 'Fixture account A');
    assert.equal(await restored.evaluate(() => localStorage.getItem('fixture')), 'retained');
    revoked = true; await restored.reload();
    assert.equal(await restored.locator('input[type=password]').count(), 1);
  } catch (error) {
    // All data here is synthetic. Never use this test against real user accounts.
    console.error(logs); throw error;
  } finally {
    proxy?.kill('SIGTERM'); await context?.close();
    await new Promise(resolve => site.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});

