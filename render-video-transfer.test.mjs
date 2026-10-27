import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVideoTransfer } from './render-video-transfer.mjs';

const origin = 'https://video.example';
const taskId = 'a'.repeat(32);
const secret = 'local-fixture-only-'.repeat(4);
const bytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(64)]);
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jh-video-test-'));
  let now = Date.now();
  let store = await createVideoTransfer({ origin, root, secret, clock: () => now,
    probe: async () => ({ durationSeconds: 10, width: 320, height: 180 }), ...options });
  const server = http.createServer((req, res) => void store.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const local = u => base + new URL(u).pathname + new URL(u).search;
  const upload = (offer, data = bytes, extra = {}) => fetch(base + '/video-transfer/upload', {
    method: 'PUT', headers: { origin, authorization: 'Bearer ' + new URLSearchParams(new URL(offer.uploadUrl).hash.slice(1)).get('upload'),
      'content-type': 'video/mp4', ...extra }, body: data });
  t.after(async () => { store.close(); const done = new Promise(r => server.close(r)); server.closeAllConnections(); await done; await rm(root, { recursive: true, force: true }); });
  return { root, base, local, upload, store: () => store, now: () => now,
    advance: ms => { now += ms; }, async restart() {
      store.close(); store = await createVideoTransfer({ origin, root, secret, clock: () => now, ...options });
    } };
}

test('upload, immutable result, download bytes and ranges survive restart', async t => {
  const f = await fixture(t), offer = await f.store().create(taskId);
  assert.equal(offer.state, 'WAITING');
  const result = await (await f.upload(offer)).json();
  assert.equal(result.state, 'READY'); assert.equal(result.durationSeconds, 10);
  assert.equal(result.bytes, bytes.length); assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const url = f.local(result.downloadUrl);
  assert.match((await fetch(url, { method: 'HEAD' })).headers.get('content-disposition'), /^attachment;/);
  const playback = await fetch(f.local(result.playbackUrl), { method: 'HEAD' });
  assert.match(playback.headers.get('content-disposition'), /^inline;/);
  assert.equal(playback.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), bytes);
  const partial = await fetch(url, { headers: { Range: 'bytes=4-7' } });
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'ftyp');
  assert.equal((await fetch(url, { headers: { Range: 'bytes=999-' } })).status, 416);
  const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await f.upload(offer, Buffer.alloc(300))).status, 200);
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), bytes);
  await f.restart();
  assert.equal(f.store().lookup(taskId, offer.transferId).sha256, result.sha256);
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), bytes);
});

test('wrong capability, origin, task and purpose cannot read or upload', async t => {
  const f = await fixture(t), offer = await f.store().create(taskId);
  assert.throws(() => f.store().lookup('b'.repeat(32), offer.transferId), /VIDEO_RESULT_NOT_FOUND/);
  assert.equal((await f.upload(offer, bytes, { origin: 'https://other.example' })).status, 400);
  assert.equal((await f.upload(offer, bytes, { authorization: 'Bearer forged' })).status, 400);
  const readToken = new URLSearchParams(new URL(offer.resultUrl).hash.slice(1)).get('result');
  assert.equal((await f.upload(offer, bytes, { authorization: 'Bearer ' + readToken })).status, 400);
  assert.equal((await fetch(f.base + '/video-transfer/status')).status, 400);
  assert.equal(f.store().lookup(taskId, offer.transferId).state, 'WAITING');
  const page = await fetch(f.local(offer.uploadUrl));
  assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(!(await page.text()).includes(readToken));
});

test('bounded capacity, size, invalid media and validator failure leave no public result', async t => {
  const f = await fixture(t, { maxBytes: 100, maxTransfers: 1 });
  const offer = await f.store().create(taskId);
  await assert.rejects(f.store().create('b'.repeat(32)), /VIDEO_CAPACITY_REACHED/);
  assert.equal((await f.upload(offer, Buffer.alloc(101))).status, 400);
  assert.equal((await f.upload(offer, Buffer.alloc(60))).status, 400);
  assert.equal(f.store().lookup(taskId, offer.transferId).state, 'WAITING');
  assert.deepEqual((await readdir(f.root)).sort(), [offer.transferId + '.json']);
  const bad = await fixture(t, { probe: async () => { throw Error('VIDEO_INVALID'); } });
  const pending = await bad.store().create(taskId);
  assert.equal((await bad.upload(pending)).status, 400);
  assert.equal(bad.store().lookup(taskId, pending.transferId).downloadUrl, undefined);
  assert.deepEqual(await readdir(bad.root), [pending.transferId + '.json']);
});

test('same task is idempotent under concurrency and expired files are removed', async t => {
  const f = await fixture(t);
  const offers = await Promise.all(Array.from({ length: 10 }, () => f.store().create(taskId)));
  assert.equal(new Set(offers.map(o => o.uploadUrl)).size, 1);
  const saved = await (await f.upload(offers[0])).json();
  f.advance(25 * 60 * 60 * 1000);
  assert.equal((await fetch(f.local(saved.downloadUrl))).status, 400);
  await f.store().create('b'.repeat(32));
  assert.ok((await readdir(f.root)).every(n => !n.startsWith(saved.transferId)));
});

test('simultaneous upload is refused until the first outcome can be observed', async t => {
  let release, started;
  const wait = new Promise(r => { started = r; });
  const f = await fixture(t, { probe: async () => { started(); await new Promise(r => { release = r; }); return { durationSeconds: 1, width: 1, height: 1 }; } });
  const offer = await f.store().create(taskId);
  const first = f.upload(offer); await wait;
  const second = await f.upload(offer); assert.equal((await second.json()).code, 'VIDEO_UPLOAD_IN_PROGRESS');
  assert.equal(f.store().lookup(taskId, offer.transferId).state, 'UPLOADING');
  release(); assert.equal((await first).status, 200);
  assert.equal(f.store().lookup(taskId, offer.transferId).state, 'READY');
});
