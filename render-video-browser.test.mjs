// Real HTTPS + Chromium + ffprobe, using a synthetic local video only.
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createVideoTransfer, probeVideo } from './render-video-transfer.mjs';

test('phone-width upload produces a verified download, survives reload and opens from result link', { timeout: 45000 }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jh-video-browser-'));
  let server, browser, store;
  t.after(async () => { await browser?.close(); store?.close(); if (server) {
    const done = new Promise(r => server.close(r)); server.closeAllConnections(); await done;
  } await rm(dir, { recursive: true, force: true }); });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key'),
    '-out', path.join(dir, 'cert'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const video = path.join(dir, 'fixture.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
  const bytes = await readFile(video), probe = await probeVideo(video);
  assert.equal(probe.durationSeconds, 1);
  server = https.createServer({ key: await readFile(path.join(dir, 'key')), cert: await readFile(path.join(dir, 'cert')) },
    (req, res) => { if (req.url.startsWith('/video-transfer/')) void store.handle(req, res); else { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `https://127.0.0.1:${server.address().port}`;
  store = await createVideoTransfer({ origin, root: path.join(dir, 'store'), secret: 'test-only' });
  const offer = await store.create('c'.repeat(32));
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(offer.uploadUrl);
  await page.locator('#upload').waitFor({ state: 'visible' });
  // Phone browsers often reuse the same document when only #fragment changes.
  await page.goto(offer.resultUrl);
  await page.locator('#upload').waitFor({ state: 'hidden' });
  await page.goto(offer.uploadUrl);
  await page.locator('#upload').waitFor({ state: 'visible' });
  await page.locator('#file').setInputFiles(video);
  await page.locator('#send').click();
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.match(await page.locator('#status').innerText(), /받아 확인/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.waitForFunction(() => document.getElementById('player').readyState >= 1);
  await page.waitForFunction(() => document.getElementById('player').currentTime > 0);
  const playback = await page.locator('#watch').getAttribute('href');
  const streamed = await context.request.get(playback, { headers: { Range: 'bytes=0-31' } });
  assert.equal(streamed.status(), 206);
  assert.match(streamed.headers()['content-disposition'], /^inline;/);
  const href = await page.locator('#download').getAttribute('href');
  const downloaded = await context.request.get(href);
  assert.match(downloaded.headers()['content-disposition'], /^attachment;/);
  assert.equal(downloaded.status(), 200); assert.deepEqual(await downloaded.body(), bytes);
  await page.reload(); await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#download').getAttribute('href'), href);
  const result = await context.newPage(); await result.goto(offer.resultUrl);
  await result.locator('#result').waitFor({ state: 'visible' });
  await result.waitForFunction(() => document.getElementById('player').currentTime > 0);
  assert.equal(await result.locator('#player').evaluate(video => video.muted), true);
  assert.equal(await result.locator('#download').getAttribute('href'), href);
  assert.equal(await result.locator('#upload').isVisible(), false);
});
