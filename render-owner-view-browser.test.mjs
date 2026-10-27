// Real Chromium + HTTPS viewer checks. Only local synthetic pages are used.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createOwnerControl, OWNER_LINK_TTL_MS } from './render-owner-control.mjs';

let browser;
// Match render-owner-browser.mjs: the production image ships full Chromium,
// not the separate chromium-headless-shell binary used by the default launch.
before(async () => { browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); });
const targetId = 'A'.repeat(32);

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jh-viewer-test-'));
  let context, server;
  t.after(async () => {
    await context?.close();
    if (server?.listening) {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections(); await closed;
    }
    await rm(directory, { recursive: true, force: true });
  });
  // Generate and remove a test-only certificate. Never package a private key.
  const keyPath = path.join(directory, 'key.pem'), certPath = path.join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  let control, fixturePage, clock = Date.now(), holdNextFrame = false, releaseFrame, frameStarted;
  const requests = { claim: 0, finish: 0, input: 0 };
  server = https.createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (req, res) => {
    if (req.url === '/fixture') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Local fixture</title><label style="display:block;margin:30px">Fixture input<input id="fixture-input" style="display:block;width:300px;height:40px"></label>');
      return;
    }
    if (req.url === '/owner/claim') requests.claim++;
    if (req.url === '/owner/finish') requests.finish++;
    if (req.url === '/owner/input') requests.input++;
    void control.handle(req, res).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    }).catch(() => { res.writeHead(500); res.end('LOCAL_FIXTURE_ERROR'); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `https://127.0.0.1:${server.address().port}`;
  context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(8000);
  fixturePage = await context.newPage(); await fixturePage.setViewportSize({ width: 1280, height: 900 });
  await fixturePage.goto(origin + '/fixture');
  const screenshot = fixturePage.screenshot.bind(fixturePage);
  fixturePage.screenshot = async options => {
    if (holdNextFrame) {
      holdNextFrame = false;
      await new Promise(resolve => { releaseFrame = resolve; frameStarted(); });
    }
    return screenshot(options);
  };
  control = createOwnerControl({ origin, clock: () => clock, getPage: async id => {
    assert.equal(id, targetId); return fixturePage;
  } });
  const viewer = await context.newPage();
  // A function predicate works with the viewer's strict CSP; a string would
  // require unsafe-eval and must not weaken the production security policy.
  const waitReady = () => viewer.waitForFunction(() => !busy && Boolean(frame));
  const claim = async () => {
    await viewer.locator('#start').click();
    await viewer.waitForFunction(() => document.getElementById('finish').disabled === false);
    await waitReady();
  };
  const rejectOldLink = async () => {
    const oldLink = control.offer(targetId); clock += OWNER_LINK_TTL_MS + 1;
    await viewer.goto(oldLink); await viewer.locator('#start').click();
    await viewer.waitForFunction(() => document.getElementById('status').textContent.includes('이 링크를 사용할 수 없습니다'));
    assert.equal(await viewer.locator('#start').isDisabled(), true);
    assert.equal(await viewer.locator('#finish').isDisabled(), true);
  };
  const finish = async () => {
    await viewer.locator('#finish').click();
    await viewer.waitForFunction(() => document.getElementById('status').textContent.includes('직접 조작을 마쳤습니다'));
    assert.equal(control.locked(), false);
  };
  return { viewer, fixturePage, control, requests, claim, finish, waitReady, rejectOldLink,
    offer: () => control.offer(targetId),
    holdFrame: () => { holdNextFrame = true; return new Promise(resolve => { frameStarted = resolve; }); },
    releaseFrame: () => releaseFrame(),
  };
}

test('real browser opens a new document URL after rejection and can return control', { timeout: 30000 }, async t => {
  const f = await fixture(t); await f.rejectOldLink();
  const previous = f.viewer.url(), latest = f.offer();
  await f.viewer.goto(latest);
  assert.notEqual(f.viewer.url(), previous);
  assert.equal(new URL(f.viewer.url()).hash, '');
  assert.equal(await f.viewer.locator('#start').isEnabled(), true);
  assert.equal(f.requests.claim, 1); // Navigation alone never takes control.
  await f.claim(); await f.finish();
  assert.equal(f.requests.claim, 2); assert.equal(f.requests.finish, 1);
});

test('real browser accepts a fresh fragment in the same failed document without automatic claim', { timeout: 30000 }, async t => {
  const f = await fixture(t); await f.rejectOldLink();
  const current = new URL(f.viewer.url()), latest = new URL(f.offer());
  await f.viewer.goto(current.href + latest.hash);
  await f.viewer.waitForFunction(() => document.getElementById('start').disabled === false);
  assert.equal(new URL(f.viewer.url()).search, current.search);
  assert.equal(f.requests.claim, 1);
  await f.claim(); await f.finish();
});

test('real viewer inputs into its target and queues Finish while a screenshot is pending', { timeout: 30000 }, async t => {
  const f = await fixture(t); await f.viewer.goto(f.offer()); await f.claim();
  t.diagnostic('Viewer claimed and first frame displayed');
  const box = await f.fixturePage.locator('#fixture-input').boundingBox();
  await f.viewer.locator('#screen').click({ position: { x: box.x + 20, y: box.y + 20 } });
  t.diagnostic('Canvas click completed');
  await f.fixturePage.waitForFunction(() => document.activeElement.id === 'fixture-input');
  t.diagnostic('Target fixture input focused');
  await f.waitReady();
  const inputFrameStarted = f.holdFrame();
  await f.viewer.locator('#refresh').click(); await inputFrameStarted;
  await f.viewer.locator('#text').fill('local-fixture-text');
  assert.equal(await f.viewer.locator('#send').isDisabled(), true);
  assert.equal(f.requests.input, 1); // Only the earlier canvas click was sent.
  assert.equal(await f.viewer.locator('#text').inputValue(), 'local-fixture-text');
  f.releaseFrame(); await f.waitReady();
  await f.viewer.locator('#send').click();
  await f.fixturePage.waitForFunction(() => document.getElementById('fixture-input').value === 'local-fixture-text');
  t.diagnostic('Target fixture input received text');
  await f.waitReady();
  assert.equal(f.requests.input, 2); // Exactly one text submission, no replay.
  assert.throws(() => f.control.beginMCP(), /OWNER_CONTROL_ACTIVE/);
  const started = f.holdFrame();
  await f.viewer.locator('#refresh').click(); await started;
  t.diagnostic('Screenshot held pending Finish');
  await f.viewer.locator('#finish').click();
  assert.equal(await f.viewer.locator('#send').isDisabled(), true);
  assert.equal(f.requests.finish, 0);
  assert.match(await f.viewer.locator('#status').textContent(), /완료 요청을 받았습니다/);
  f.releaseFrame();
  await f.viewer.waitForFunction(() => document.getElementById('status').textContent.includes('직접 조작을 마쳤습니다'));
  assert.equal(f.requests.finish, 1); assert.equal(f.control.locked(), false);
  f.control.beginMCP(); f.control.endMCP();
  assert.equal(await f.viewer.locator('#finish').isDisabled(), true);
});
