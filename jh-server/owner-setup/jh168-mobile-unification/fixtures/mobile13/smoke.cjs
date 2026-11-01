/* Local fixture behavior only. Never imports or starts a JH runtime. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = __dirname;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/destination.html', ['destination.html', 'text/html; charset=utf-8']],
  ['/fixture.css', ['fixture.css', 'text/css; charset=utf-8']],
  ['/fixture.js', ['fixture.js', 'text/javascript; charset=utf-8']],
]);
const checks = [];
let browser;
let server;
const runtimeErrors = [];
const unexpectedRequests = [];

async function check(name, run) {
  try { await run(); checks.push({ name, status: 'passed' }); }
  catch (error) { checks.push({ name, status: 'failed', error: error.message }); throw error; }
}

async function main() {
  const plan = JSON.parse(await fs.readFile(path.join(root, 'cases.json'), 'utf8'));
  await check('13-case plan preserves unexecuted phone results', async () => {
    assert.deepEqual(plan.cases.map(c => c.id), [
      'WEB01','WEB02','WEB03','WEB04','WEB05','WEB06','WEB07','WEB08','WEB09',
      'ENTRY01','ENTRY02','ENTRY03','ENTRY04',
    ]);
    assert.equal(plan.phoneE2E, 'NOT_RUN');
    assert.equal(plan.hostedHttpsUrl, null);
    for (const item of plan.cases) {
      assert.equal(item.phoneE2E, 'NOT_RUN');
      assert.equal(item.observedEvidence, null);
    }
    assert.equal(plan.cases.find(c => c.id === 'ENTRY03').fixture, null);
  });
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const resource = assets.get(pathname);
    if (!['GET', 'HEAD'].includes(request.method) || !resource) {
      response.writeHead(404); response.end(); return;
    }
    try {
      const bytes = await fs.readFile(path.join(root, resource[0]));
      response.writeHead(200, {
        'Content-Type': resource[1],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.JH_FIXTURE_BROWSER_EXECUTABLE ? { executablePath: process.env.JH_FIXTURE_BROWSER_EXECUTABLE } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  context.on('page', page => page.on('pageerror', error => runtimeErrors.push(error.message)));
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') {
      unexpectedRequests.push({ method: request.method(), origin: url.origin, pathname: url.pathname });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(origin + '/');

  await check('narrow viewport and explicit phone NOT_RUN', async () => {
    assert.match(await page.locator('#phone-e2e-state').innerText(), /NOT_RUN/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await page.locator('#screenshot-marker').count(), 1);
  });
  await check('one explicit click changes only the fixture counter', async () => {
    const before = Number(await page.locator('#click-count').innerText());
    assert.equal(before, 0);
    await page.locator('#click-button').click();
    const after = Number(await page.locator('#click-count').innerText());
    assert.equal(after, before + 1);
  });
  await check('focused text input and local form completion without navigation', async () => {
    await page.locator('#input-one').fill('JH TEST');
    assert.equal(await page.locator('#input-one').inputValue(), 'JH TEST');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input-one');
    await page.locator('#input-two').fill('SECOND');
    const url = page.url();
    const before = await page.locator('#form-result').innerText();
    await page.locator('#form-submit').click();
    const result = await page.locator('#form-result').innerText();
    assert.notEqual(result, before);
    assert.equal(result, 'LOCAL_ONLY · 확인 1회 · 첫 입력 7자 / 두 번째 6자');
    assert.equal(page.url(), url);
    assert.doesNotMatch(await page.locator('#event-log').innerText(), /JH TEST|SECOND/);
  });
  await check('native select changes the visible selected option', async () => {
    const select = page.locator('#native-select');
    await select.selectOption({ index: 1 });
    assert.equal(await select.evaluate(el => el.selectedIndex), 1);
    assert.equal(await page.locator('#select-result').innerText(), '파랑 연습 옵션');
  });
  await check('delayed condition changes after a user-triggered timer', async () => {
    await page.locator('#delay-button').click();
    assert.equal(await page.locator('#delay-status').getAttribute('data-state'), 'waiting');
    assert.equal(await page.locator('#delay-button').isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('#delay-status').dataset.state === 'ready');
    assert.equal(await page.locator('#delay-status').innerText(), 'READY · 지연 조건 문구가 나타났습니다');
    assert.equal(await page.locator('#delay-button').isDisabled(), false);
  });
  await check('outer, inner and horizontal scroll regions move independently', async () => {
    for (const [id, axis] of [['vertical-scroll', 'y'], ['inner-scroll', 'y'], ['horizontal-scroll', 'x']]) {
      const result = await page.locator('#' + id).evaluate((el, axis) => {
        const maximum = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
        if (axis === 'x') el.scrollLeft = maximum; else el.scrollTop = maximum;
        return { maximum, actual: axis === 'x' ? el.scrollLeft : el.scrollTop };
      }, axis);
      assert(result.maximum > 20, id + ' must have real overflow');
      assert(result.actual > 0, id + ' must actually scroll');
    }
    const outer = await page.locator('#vertical-scroll').evaluate(el => el.scrollTop);
    await page.locator('#inner-scroll').evaluate(el => { el.scrollTop = 0; });
    assert.equal(await page.locator('#vertical-scroll').evaluate(el => el.scrollTop), outer);
  });
  await check('dialog closes through explicit close and Escape separately', async () => {
    await page.locator('#dialog-open').click();
    assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), true);
    await page.locator('#dialog-close').click();
    assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), false);
    await page.locator('#dialog-open').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), false);
  });
  await check('bounded event log does not contain input text', async () => {
    for (let i = 0; i < 30; i++) await page.locator('#click-button').click();
    assert.equal(await page.locator('#event-log').evaluate(el => el.children.length), 24);
    assert.match(await page.locator('#event-log').innerText(), /click · count=31/);
    assert.doesNotMatch(await page.locator('#event-log').innerText(), /JH TEST|SECOND/);
    await page.locator('#clear-events').click();
    // A real click can schedule a new scroll/frame event after clearing.
    // Verify removal of old events, while permitting genuine later events.
    const cleared = await page.locator('#event-log').innerText();
    assert.match(cleared, /목록 비움/);
    assert.doesNotMatch(cleared, /click · count=/);
    assert(await page.locator('#event-log').evaluate(el => el.children.length) <= 24);
  });
  await check('reload clears counters, input, selection, timer and dialog state', async () => {
    assert.equal(await page.locator('#click-count').innerText(), '31');
    assert.equal(await page.locator('#input-one').inputValue(), 'JH TEST');
    await page.locator('#dialog-open').click();
    assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), true);
    await page.reload();
    assert.equal(await page.locator('#click-count').innerText(), '0');
    assert.equal(await page.locator('#input-one').inputValue(), '');
    assert.equal(await page.locator('#input-two').inputValue(), '');
    assert.equal(await page.locator('#native-select').inputValue(), '');
    assert.equal(await page.locator('#form-result').innerText(), '아직 확인하지 않음');
    assert.equal(await page.locator('#delay-status').getAttribute('data-state'), 'idle');
    assert.equal(await page.locator('#delay-button').isDisabled(), false);
    assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), false);
    assert.doesNotMatch(await page.locator('#event-log').innerText(), /JH TEST|SECOND|count=31/);
  });
  await check('same-tab navigation and history return remain same origin', async () => {
    await page.locator('#same-tab-link').click();
    await page.waitForURL('**/destination.html*');
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(await page.locator('#destination-heading').count(), 1);
    await page.goBack();
    await page.waitForURL(origin + '/');
    assert.equal(await page.locator('#click-button').count(), 1);
  });
  await check('new tab has no opener and stays on the fixture origin', async () => {
    const popupPromise = context.waitForEvent('page');
    await page.locator('#new-tab-link').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(new URL(popup.url()).origin, origin);
    assert.equal(await popup.locator('#destination-heading').count(), 1);
    assert.equal(await popup.evaluate(() => window.opener === null), true);
    await popup.close();
  });
  await check('no external traffic, persistence or page exceptions', async () => {
    assert.deepEqual(unexpectedRequests, []);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(await context.cookies(), []);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  });
  if (process.env.JH_FIXTURE_SCREENSHOT) {
    await page.goto(origin + '/');
    await page.screenshot({ path: process.env.JH_FIXTURE_SCREENSHOT, fullPage: true });
  }
  return { browserVersion: browser.version() };
}

(async () => {
  let metadata = {};
  let failure;
  try { metadata = await main(); }
  catch (error) { failure = error.message; process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify({
    scope: 'DESKTOP_FIXTURE_ONLY', phoneE2E: 'NOT_RUN', ...metadata,
    passed: checks.filter(c => c.status === 'passed').length,
    failed: checks.filter(c => c.status === 'failed').length + (failure && !checks.some(c => c.status === 'failed') ? 1 : 0),
    skipped: 0, checks, ...(failure ? { failure } : {}),
  }, null, 2));
})();
