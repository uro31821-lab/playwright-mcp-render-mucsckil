import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVideoTransfer } from './render-video-transfer.mjs';
import { createOwnerUpstream } from './render-owner-upstream.mjs';

test('authenticated MCP discovery and legacy navigation expose the same task transfer without changing protocol replies', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jh-video-mcp-'));
  const origin = 'https://video.example', taskId = 'd'.repeat(32);
  const video = await createVideoTransfer({ origin, root, secret: 'fixture-only' });
  const forwarded = [];
  const upstream = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw); forwarded.push(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id,
      result: body.method === 'tools/list' ? { tools: [{ name: 'browser_navigate' }] } : { content: [{ type: 'text', text: 'fixture page' }] } }));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const owner = await createOwnerUpstream({ origin, upstreamPort: upstream.address().port, cdpURL: 'http://127.0.0.1:9222', video });
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer fixture') { req.resume(); res.writeHead(401); res.end(); return; }
    void owner.mcp(req, res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { video.close(); for (const s of [server, upstream]) {
    const done = new Promise(r => s.close(r)); s.closeAllConnections(); await done;
  } await rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const rpc = async (method, params, id = 1) => (await fetch(url, { method: 'POST',
    headers: { Authorization: 'Bearer fixture', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json();
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  const listed = await rpc('tools/list', {});
  assert.deepEqual(listed.result.tools.map(t => t.name), ['browser_navigate', 'browser_video_transfer_create', 'browser_video_transfer_status']);
  const created = await rpc('tools/call', { name: 'browser_video_transfer_create', arguments: { task_id: taskId } });
  const offer = created.result.structuredContent;
  const nav = await rpc('tools/call', { name: 'browser_navigate', arguments: { url: origin + '/video-transfer/?task=' + taskId } });
  assert.equal(JSON.parse(nav.result.content[1].text).videoTransfer.transferId, offer.transferId);
  const found = await rpc('tools/call', { name: 'browser_video_transfer_status', arguments: { task_id: taskId, transfer_id: offer.transferId } });
  assert.equal(found.result.structuredContent.uploadUrl, offer.uploadUrl);
  const wrong = await rpc('tools/call', { name: 'browser_video_transfer_status', arguments: { task_id: 'e'.repeat(32), transfer_id: offer.transferId } });
  assert.equal(wrong.result.isError, true);
  const response = { jsonrpc: '2.0', id: 'server-roots', result: { roots: [] } };
  await fetch(url, { method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify(response) });
  assert.deepEqual(forwarded.at(-1), response);
});
