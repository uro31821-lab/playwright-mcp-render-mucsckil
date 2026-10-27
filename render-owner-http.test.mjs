// Local HTTP transport checks; no real account, browser profile, or production call.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createOwnerControl } from './render-owner-control.mjs';

const origin = 'https://owner.example';
const targetId = 'A'.repeat(32);

async function fixture(t) {
  const actions = [];
  const png = Buffer.alloc(24);
  png.writeUInt32BE(1280, 16); png.writeUInt32BE(900, 20);
  const page = {
    isClosed: () => false, url: () => 'https://fixture.example/account',
    screenshot: async () => png,
    mouse: { click: async (...args) => actions.push(['click', ...args]),
      wheel: async (...args) => actions.push(['scroll', ...args]) },
    keyboard: { insertText: async value => actions.push(['text', value]),
      press: async value => actions.push(['key', value]) },
  };
  const control = createOwnerControl({ origin, getPage: async id => {
    assert.equal(id, targetId); return page;
  } });
  const server = http.createServer((req, res) => {
    void control.handle(req, res).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    }).catch(() => { res.writeHead(500); res.end('LOCAL_FIXTURE_ERROR'); });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections(); await closed;
  });
  const offer = () => new URL(control.offer(targetId));
  const post = async (endpoint, body, secret, requestOrigin = origin) => {
    const response = await fetch(`${base}/owner/${endpoint}`, {
      method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { base, control, actions, offer, post };
}

test('HTTP viewer serves unique URLs and assets without consuming or exposing a ticket', { timeout: 10000 }, async t => {
  const f = await fixture(t), link = f.offer();
  const path = link.pathname + link.search;
  const html = await fetch(f.base + path + '&utm_source=chatgpt.com');
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('cache-control'), 'no-store');
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const body = await html.text();
  assert.ok(body.includes('id="start"'));
  assert.ok(!body.includes(link.hash.slice(1)));
  for (const [asset, type] of [['view.js', 'text/javascript'], ['view.css', 'text/css']]) {
    const response = await fetch(f.base + '/owner/' + asset);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.ok(!(await response.text()).includes(link.hash.slice(1)));
  }
  assert.equal((await f.post('claim', { ticket: link.searchParams.get('view') })).status, 403);
  assert.equal((await f.post('claim', { ticket: link.hash.slice(1) })).status, 200);
});

test('HTTP handoff applies one fixture input and returns control only after the release acknowledgement', { timeout: 10000 }, async t => {
  const f = await fixture(t), link = f.offer();
  const claimed = await f.post('claim', { ticket: link.hash.slice(1) });
  assert.equal(claimed.status, 200);
  const secret = claimed.body.secret;
  assert.equal(f.control.locked(), true);
  assert.throws(() => f.control.beginMCP(), /OWNER_CONTROL_ACTIVE/);
  const frame = await f.post('frame', {}, secret);
  assert.equal(frame.status, 200);
  const input = { type: 'text', text: 'local-fixture-input', frame: frame.body.frame };
  const applied = await f.post('input', input, secret);
  assert.equal(applied.status, 200);
  assert.equal(applied.body.state, 'APPLIED');
  assert.ok(!JSON.stringify(applied.body).includes(input.text));
  assert.equal((await f.post('input', input, secret)).status, 403);
  assert.deepEqual(f.actions, [['text', input.text]]);
  const done = await f.post('finish', {}, secret);
  assert.equal(done.status, 200);
  assert.deepEqual(done.body, { state: 'RELEASED', loginVerified: false });
  assert.equal(f.control.locked(), false);
  f.control.beginMCP(); f.control.endMCP();
  assert.equal((await f.post('frame', {}, secret)).status, 403);
});

test('HTTP stale links and wrong origins are rejected while the latest unused link remains usable', { timeout: 10000 }, async t => {
  const f = await fixture(t), old = f.offer(), fresh = f.offer();
  assert.notEqual(old.search, fresh.search);
  assert.equal((await f.post('claim', { ticket: old.hash.slice(1) })).status, 403);
  assert.equal((await f.post('claim', { ticket: fresh.hash.slice(1) }, null, 'https://other.example')).status, 403);
  const claim = await f.post('claim', { ticket: fresh.hash.slice(1) });
  assert.equal(claim.status, 200);
  assert.equal((await f.post('claim', { ticket: fresh.hash.slice(1) })).status, 403);
  assert.equal((await f.post('finish', {}, claim.body.secret)).status, 200);
});
