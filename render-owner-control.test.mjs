import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createOwnerControl, parseRPC, OWNER_LINK_TTL_MS } from './render-owner-control.mjs';
const origin = 'https://owner.example';
const targetId = 'A'.repeat(32);
function fixture() {
  let now = 1000;
  const actions = [];
  const png = Buffer.alloc(24); png.writeUInt32BE(1280, 16); png.writeUInt32BE(900, 20);
  const page = { isClosed: () => false, url: () => 'https://login.example', screenshot: async () => png,
    mouse: { click: async (...args) => actions.push(['click', ...args]), wheel: async (...args) => actions.push(['scroll', ...args]) },
    keyboard: { insertText: async value => actions.push(['text', value]), press: async value => actions.push(['key', value]) } };
  const control = createOwnerControl({ origin, clock: () => now, getPage: async id => {
    assert.equal(id, targetId); return page;
  } });
  async function request(path, body, secret, extra = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url: '/owner/' + path, method: 'POST', headers: { origin,
      'content-type': 'application/json', authorization: secret ? `Bearer ${secret}` : '', ...extra } });
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(data) { this.body = JSON.parse(data); } };
    await control.handle(req, res); return res;
  }
  async function get(path) {
    const req = { url: path, method: 'GET', headers: {} };
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(data) { this.body = String(data); } };
    const handled = await control.handle(req, res);
    return { ...res, handled };
  }
  const offer = () => control.offer(targetId).split('#')[1];
  const claim = async () => (await request('claim', { ticket: offer() })).body.secret;
  return { control, request, get, offer, claim, actions, page, advance: ms => { now += ms; } };
}
test('GPT link-tracking query renders viewer without granting access', async () => {
  const f = fixture();
  const ticket = f.offer();
  const page = await f.get('/owner/?utm_source=chatgpt.com');
  assert.equal(page.handled, true);
  assert.equal(page.status, 200);
  assert.match(page.body, /<html/i);
  assert.match(page.headers['Content-Security-Policy'], /default-src 'none'/);
  assert.equal((await f.get('/owner/')).status, 200);
  const unwanted = await f.get('/owner/?utm_source=unknown');
  assert.equal(unwanted.status, 403);
  assert.equal((await f.get('/owner/claim')).status, 403);
  // Viewing the HTML does not consume the one-use credential.
  assert.equal((await f.request('claim', { ticket })).status, 200);
});
test('ticket is one-use and does not grant MCP authorization', async () => {
  const f = fixture(), ticket = f.offer();
  const first = await f.request('claim', { ticket });
  assert.equal(first.status, 200);
  assert.equal((await f.request('claim', { ticket })).status, 403);
  assert.equal((await f.request('frame', {}, ticket)).status, 403);
});
test('desktop-to-phone transfer ticket stays valid for 30 minutes minus 1 ms', async () => {
  const f = fixture(), ticket = f.offer();
  assert.equal(OWNER_LINK_TTL_MS, 30 * 60 * 1000);
  f.advance(OWNER_LINK_TTL_MS - 1);
  const r = await f.request('claim', { ticket });
  assert.equal(r.status, 200);
  assert.equal((await f.request('claim', { ticket })).status, 403);
});
test('expired and superseded links cannot acquire control', async () => {
  const f = fixture(), old = f.offer(); f.advance(OWNER_LINK_TTL_MS);
  assert.equal((await f.request('claim', { ticket: old })).status, 403);
  const second = f.offer();
  // For safety, a new browser operation still invalidates a not-yet-claimed offer.
  f.control.beginMCP('new'); f.control.endMCP();
  assert.equal((await f.request('claim', { ticket: second })).status, 403);
});
test('a newer issued link supersedes the first, even if both are under 30 minutes', async () => {
  const f = fixture(), first = f.offer(), second = f.offer();
  assert.notEqual(first, second);
  assert.equal((await f.request('claim', { ticket: first })).status, 403);
  assert.equal((await f.request('claim', { ticket: second })).status, 200);
});
test('pending ticket survives harmless browser snapshot while user switches from PC to phone', async () => {
  const f = fixture(), ticket = f.offer();
  f.advance(5 * 60 * 1000);
  // Auto status/readback must not consume or revoke an unclaimed ticket.
  f.control.beginMCP(null, false, { preserveOffer: true }); f.control.endMCP();
  f.advance(12 * 60 * 1000);
  f.control.beginMCP(null, false, { preserveOffer: true }); f.control.endMCP();
  assert.equal((await f.request('claim', { ticket })).status, 200);
  assert.equal((await f.request('claim', { ticket })).status, 403);
});
test('pending ticket is revoked on page-capable browser action but not pure readback', async () => {
  const f = fixture(), ticket = f.offer();
  f.control.beginMCP(null, false, { preserveOffer: true }); f.control.endMCP();
  f.control.beginMCP(null); f.control.endMCP(); // e.g. navigation, click or code
  assert.equal((await f.request('claim', { ticket })).status, 403);
});
test('new explicit command revokes stale ticket even if only reading page', async () => {
  const f = fixture();
  f.control.beginMCP('original', false, { preserveOffer: true }); f.control.endMCP();
  const ticket = f.offer();
  f.control.beginMCP('new-command', false, { preserveOffer: true }); f.control.endMCP();
  assert.equal((await f.request('claim', { ticket })).status, 403);
});
test('cross-origin claim and input are refused', async () => {
  const f = fixture();
  assert.equal((await f.request('claim', { ticket: f.offer() }, null, { origin: 'https://evil.example' })).status, 403);
  const secret = await f.claim();
  assert.equal((await f.request('frame', {}, secret, { origin: 'https://evil.example' })).status, 403);
});
test('manual control pauses all browser reads and writes but preserves MCP metadata', async () => {
  const f = fixture(); await f.claim();
  assert.throws(() => f.control.beginMCP(), /OWNER_CONTROL_ACTIVE/);
  f.control.beginMCP(null, true); f.control.endMCP();
  assert.equal(f.control.locked(), true);
});
test('exact frame input is applied once, with no password echo', async () => {
  const f = fixture(), secret = await f.claim();
  const frame = (await f.request('frame', {}, secret)).body.frame;
  const body = { frame, type: 'text', text: 'not-a-real-password' };
  const r = await f.request('input', body, secret);
  assert.equal(r.status, 200); assert.ok(!JSON.stringify(r).includes(body.text));
  assert.equal((await f.request('input', body, secret)).status, 403);
  assert.deepEqual(f.actions, [['text', body.text]]);
});
test('out of bounds and stale frames never execute', async () => {
  const f = fixture(), secret = await f.claim();
  let frame = (await f.request('frame', {}, secret)).body.frame;
  assert.equal((await f.request('input', { frame, type: 'click', x: -1, y: 2 }, secret)).status, 403);
  frame = (await f.request('frame', {}, secret)).body.frame; f.advance(10001);
  assert.equal((await f.request('input', { frame, type: 'key', key: 'Enter' }, secret)).status, 403);
  assert.equal(f.actions.length, 0);
});
test('finish invalidates manual credential and permits fresh MCP read', async () => {
  const f = fixture(), secret = await f.claim();
  assert.equal((await f.request('finish', {}, secret)).body.loginVerified, false);
  assert.equal((await f.request('frame', {}, secret)).status, 403);
  f.control.beginMCP(); f.control.endMCP();
});
test('abandoned sessions expire without replay', async () => {
  const f = fixture(), secret = await f.claim(); f.advance(600001);
  assert.equal(f.control.locked(), false);
  assert.equal((await f.request('frame', {}, secret)).status, 403);
  assert.equal(f.actions.length, 0);
});
test('MCP in-flight operation prevents takeover', async () => {
  const f = fixture(); const ticket = f.offer();
  f.control.beginMCP(null, true);
  assert.equal((await f.request('claim', { ticket })).status, 409);
  f.control.endMCP(); assert.equal((await f.request('claim', { ticket })).status, 200);
});
test('file URLs cannot be viewed', async () => {
  const f = fixture(); f.page.url = () => 'file:///etc/passwd';
  assert.equal((await f.request('claim', { ticket: f.offer() })).status, 403);
});
test('JSON and SSE require the exact response ID', () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'a', result: {} });
  assert.equal(parseRPC('event: message\ndata: ' + body + '\n\n', 'a').id, 'a');
  assert.throws(() => parseRPC(body, 'b'), /BINDING/);
});
