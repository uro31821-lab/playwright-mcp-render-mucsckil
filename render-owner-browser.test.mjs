import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchOwnerBrowser, requirePersistentMount } from './render-owner-browser.mjs';
import { createOwnerControl } from './render-owner-control.mjs';

test('real browser owner input retains valid site login across restart and detects revocation', { timeout: 45000 }, async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'jh-profile-test-'));
  let context, revoked = false;
  const site = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url.split('?')[0] === '/login') {
      res.writeHead(302, { 'Set-Cookie': 'fixtureAccount=A; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax', Location: '/account' });
      res.end(); return;
    }
    res.end(!revoked && req.headers.cookie?.includes('fixtureAccount=A') ?
      '<h1>Account A</h1><script>localStorage.setItem("fixture","retained")</script>' :
      '<form action="/login"><input type="password" style="position:absolute;top:10px;left:10px;width:300px;height:40px"><button>Login</button></form>');
  });
  await new Promise(r => site.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${site.address().port}/account`;
  let control;
  const viewer = http.createServer((req, res) => void control.handle(req, res));
  await new Promise(r => viewer.listen(0, '127.0.0.1', r));
  const api = async (endpoint, body, secret) => {
    const response = await fetch(`http://127.0.0.1:${viewer.address().port}/owner/${endpoint}`, {
      method: 'POST', headers: { origin: 'https://owner.example', 'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  };
  try {
    context = await launchOwnerBrowser({ profile, port: 9222, persistent: false, executablePath: process.env.JH_TEST_CHROMIUM_PATH });
    const unrelated = context.pages()[0]; await unrelated.goto(url);
    const page = await context.newPage(); await page.goto(url);
    const cdp = await context.newCDPSession(page);
    const { targetInfo } = await cdp.send('Target.getTargetInfo'); await cdp.detach();
    control = createOwnerControl({ origin: 'https://owner.example', getPage: async id => {
      assert.equal(id, targetInfo.targetId); return page;
    } });
    const ticket = new URL(control.offer(targetInfo.targetId)).hash.slice(1);
    const { secret } = await api('claim', { ticket });
    const input = async body => {
      const { frame, image } = await api('frame', {}, secret);
      assert.ok(Buffer.from(image, 'base64').length > 1000);
      await api('input', { ...body, frame }, secret);
    };
    await input({ type: 'click', x: 100, y: 30 });
    await input({ type: 'text', text: 'fixture-password' });
    assert.equal(await page.locator('input').inputValue(), 'fixture-password');
    assert.equal(await unrelated.locator('input').inputValue(), '');
    assert.throws(() => control.beginMCP(), /OWNER_CONTROL_ACTIVE/);
    await input({ type: 'key', key: 'Enter' });
    await page.waitForSelector('h1');
    assert.equal((await api('finish', {}, secret)).loginVerified, false);
    control.beginMCP(); control.endMCP();
    await context.close();
    context = await launchOwnerBrowser({ profile, port: 9222, persistent: false, executablePath: process.env.JH_TEST_CHROMIUM_PATH });
    const restored = context.pages()[0]; await restored.goto(url);
    assert.equal(await restored.locator('h1').textContent(), 'Account A');
    assert.equal(await restored.evaluate(() => localStorage.getItem('fixture')), 'retained');
    revoked = true; await restored.reload();
    assert.equal(await restored.locator('input[type=password]').count(), 1);
  } finally {
    await context?.close(); await new Promise(r => viewer.close(r)); await new Promise(r => site.close(r));
    await rm(profile, { recursive: true, force: true });
  }
});

test('persistent mode cannot quietly use an unmounted ephemeral profile', async () => {
  await assert.rejects(requirePersistentMount('/tmp/profile'), /OWNER_PROFILE_PATH_INVALID/);
  // This unit intentionally points to an empty file, never a user filesystem mount.
  await assert.rejects(requirePersistentMount('/var/data/jh-browser-profile', '/dev/null'), /OWNER_PERSISTENT_DISK_REQUIRED/);
});
