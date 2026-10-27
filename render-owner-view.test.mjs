import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./render-owner-view.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = data => ({ ok: true, async json() { return data; } });
const bad = code => ({ ok: false, async json() { return { code }; } });

const firstTicket = 'a'.repeat(43), secondTicket = 'b'.repeat(43);
function fixture({ stallFrame = true, finishFailure = false, claimFailure = false,
  initialHash = '#' + firstTicket, search = '', stallClaim = false,
  stallInput = false, finishState = 'RELEASED' } = {}) {
  const ids = ['status', 'start', 'finish', 'entry', 'keys', 'screen', 'site', 'text', 'refresh', 'send'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    textContent: '', disabled: ['finish', 'send'].includes(id), hidden: ['entry','keys'].includes(id),
    value: '', width: 1280, height: 900, onclick: null,
  }]));
  elements.screen.getContext = () => ({ drawImage() {}, clearRect() {} });
  elements.screen.setAttribute = () => {};
  elements.keys.querySelectorAll = () => [];
  elements.screen.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 900 });
  const calls = [], listeners = {}, replacements = [], timers = new Map();
  let nextTimer = 0;
  const location = { hash: initialHash, pathname: '/owner/', search };
  let resumeFrame;
  const frameResponse = ok({ image: '', frame: 'fake-frame', width: 1280,
    height: 900, site: 'https://example.com' });
  const waitFrame = new Promise(resolve => { resumeFrame = () => resolve(frameResponse); });
  let resumeClaim;
  const waitClaim = new Promise(resolve => { resumeClaim = () => resolve(ok({ secret: 'synthetic-owner-secret' })); });
  const fakeFetch = async (path, options) => {
    calls.push({ path, method: options?.method, authorization: options?.headers?.Authorization || null,
      body: JSON.parse(options.body) });
    if (path === '/owner/claim') return stallClaim ? waitClaim :
      claimFailure ? bad('OWNER_LINK_EXPIRED') : ok({ secret: 'synthetic-owner-secret' });
    if (path === '/owner/frame') return stallFrame ? waitFrame : frameResponse;
    if (path === '/owner/finish') return finishFailure ? bad('OWNER_BUSY') : ok({ state: finishState });
    if (path === '/owner/input') return stallInput ? new Promise(() => {}) : ok({ state: 'APPLIED' });
    throw Error('TEST_UNEXPECTED_FETCH');
  };
  vm.runInNewContext(source, {
    document: { getElementById: id => elements[id] },
    location,
    history: { replaceState(_state, _title, url) { replacements.push(url); location.hash = ''; } },
    fetch: (path, options) => Promise.race([fakeFetch(path, options), new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Error('AbortError')), { once: true });
    })]),
    AbortController,
    atob: () => '',
    Uint8Array,
    Blob,
    createImageBitmap: async () => ({ close() {} }),
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { listeners[name] = callback; },
  }, { filename: 'render-owner-view.js' });
  return { elements, calls, resumeFrame, resumeClaim, location, replacements,
    timeoutRequest() {
      for (const [id, timer] of timers) if (timer.delay === 12000) {
        timers.delete(id); timer.callback();
      }
    },
    event(name, data = {}) { listeners[name]?.(data); },
    navigateHash(value) { location.hash = value; listeners.hashchange?.({}); } };
}

test('new hash link in the same failed tab enables a new explicit claim', async () => {
  const f = fixture({ stallFrame: false, claimFailure: true });
  await f.elements.start.onclick();
  assert.equal(f.elements.start.disabled, true);
  f.navigateHash('#' + secondTicket);
  assert.equal(f.elements.start.disabled, false);
  assert.equal(f.elements.finish.disabled, true);
  assert.equal(f.calls.length, 1); // never claim from navigation alone
  await f.elements.start.onclick();
  assert.equal(f.calls[1].body.ticket, secondTicket);
});

test('public view identifier survives fragment removal so a new offer changes the document URL', () => {
  const search = '?view=' + 'c'.repeat(32) + '&utm_source=chatgpt.com';
  const f = fixture({ search });
  assert.equal(f.replacements[0], '/owner/' + search);
  assert.ok(!f.replacements[0].includes(firstTicket));
});

test('opening a bare viewer cannot send an empty credential and explains the missing link', () => {
  const f = fixture({ initialHash: '' });
  assert.equal(f.elements.start.disabled, true);
  assert.equal(f.calls.length, 0);
  assert.match(f.elements.status.textContent, /연결 정보/);
});

test('new hash while manual control is active does not replace or finish that session', async () => {
  const f = fixture({ stallFrame: false });
  await f.elements.start.onclick();
  f.navigateHash('#' + secondTicket);
  assert.equal(f.elements.finish.disabled, false);
  assert.equal(f.elements.start.hidden, true);
  assert.equal(f.calls.filter(x => x.path === '/owner/claim').length, 1);
  assert.equal(f.calls.filter(x => x.path === '/owner/finish').length, 0);
});

test('return from browser history never shows usable controls after memory credentials are discarded', async () => {
  const f = fixture({ stallFrame: false });
  await f.elements.start.onclick();
  f.event('pagehide');
  f.event('pageshow', { persisted: true });
  assert.equal(f.elements.finish.disabled, true);
  assert.equal(f.elements.entry.hidden, true);
  assert.match(f.elements.status.textContent, /최신 링크/);
});

test('new link during an uncertain claim does not start another claim', async () => {
  const f = fixture({ stallFrame: false, stallClaim: true });
  const starting = f.elements.start.onclick();
  f.navigateHash('#' + secondTicket);
  await f.elements.start.onclick();
  assert.equal(f.calls.filter(x => x.path === '/owner/claim').length, 1);
  f.resumeClaim(); await starting;
  assert.equal(f.elements.finish.disabled, false);
});

test('late claim acknowledgement cannot restore control credentials after leaving the page', async () => {
  const f = fixture({ stallFrame: false, stallClaim: true });
  const starting = f.elements.start.onclick();
  f.event('pagehide'); f.event('pageshow', { persisted: true });
  f.resumeClaim(); await starting;
  assert.equal(f.elements.finish.disabled, true);
  assert.equal(f.elements.entry.hidden, true);
  assert.equal(f.calls.filter(x => x.path === '/owner/frame').length, 0);
  assert.match(f.elements.status.textContent, /최신 링크/);
});

test('Finish stays unavailable before claim and becomes available on successful handoff', async () => {
  const f = fixture({ stallFrame: false });
  assert.equal(f.elements.finish.disabled, true);
  await f.elements.start.onclick();
  assert.equal(f.elements.finish.disabled, false);
  assert.equal(f.elements.start.hidden, true);
  assert.match(f.elements.status.textContent, /직접 조작 중/);
});

test('text submission stays disabled during a frame and retains typed text until an explicit ready submission', async () => {
  const f = fixture({ stallFrame: true });
  const starting = f.elements.start.onclick();
  await flush(); await flush();
  f.elements.text.value = 'local-fixture-text';
  assert.equal(f.elements.send.disabled, true);
  f.elements.entry.onsubmit({ preventDefault() {} });
  assert.equal(f.elements.text.value, 'local-fixture-text');
  assert.equal(f.calls.filter(x => x.path === '/owner/input').length, 0);
  f.resumeFrame(); await starting;
  assert.equal(f.elements.send.disabled, false);
  assert.equal(f.calls.filter(x => x.path === '/owner/input').length, 0);
  f.elements.entry.onsubmit({ preventDefault() {} });
  await flush(); await flush();
  const inputs = f.calls.filter(x => x.path === '/owner/input');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].body.text, 'local-fixture-text');
  assert.equal(f.elements.text.value, '');
});

test('Finish tapped during a pending screenshot is queued once and returns control after frame', async () => {
  const f = fixture({ stallFrame: true });
  const starting = f.elements.start.onclick();
  await flush(); await flush();
  assert.equal(f.elements.finish.disabled, false);
  assert.equal(f.calls.filter(x => x.path === '/owner/frame').length, 1);
  // The frame is in-flight and the old handler used to silently ignore Finish.
  f.elements.finish.onclick();
  f.elements.finish.onclick(); // double-tap must not double-release
  assert.equal(f.calls.filter(x => x.path === '/owner/finish').length, 0);
  assert.match(f.elements.status.textContent, /완료 요청을 받았습니다/);
  f.resumeFrame();
  await starting;
  await flush(); await flush();
  assert.equal(f.calls.filter(x => x.path === '/owner/finish').length, 1);
  assert.equal(f.elements.finish.disabled, true);
  assert.match(f.elements.status.textContent, /직접 조작을 마쳤습니다/);
});

test('an unacknowledged Finish is not replayed and does not falsely claim success', async () => {
  const f = fixture({ stallFrame: false, finishFailure: true });
  await f.elements.start.onclick();
  f.elements.finish.onclick();
  await flush(); await flush();
  assert.equal(f.calls.filter(x => x.path === '/owner/finish').length, 1);
  assert.equal(f.elements.finish.disabled, false);
  assert.match(f.elements.status.textContent, /제어권 반환이 확인되지 않았습니다/);
  assert.ok(!/직접 조작을 마쳤습니다/.test(f.elements.status.textContent));
});

test('a stalled frame times out and the queued Finish can release control without waiting forever', async () => {
  const f = fixture();
  const starting = f.elements.start.onclick();
  await flush(); await flush();
  f.elements.finish.onclick();
  f.timeoutRequest();
  await starting; await flush(); await flush();
  assert.equal(f.calls.filter(x => x.path === '/owner/finish').length, 1);
  assert.match(f.elements.status.textContent, /직접 조작을 마쳤습니다/);
  // A late frame completion cannot restore an already released session.
  f.resumeFrame(); await flush();
  assert.equal(f.elements.send.disabled, true);
});

test('an uncertain text input times out once and reads back without replaying the text', async () => {
  const f = fixture({ stallFrame: false, stallInput: true });
  await f.elements.start.onclick();
  f.elements.text.value = '한글 입력 검증';
  f.elements.entry.onsubmit({ preventDefault() {} });
  await flush(); f.timeoutRequest(); await flush(); await flush();
  assert.equal(f.calls.filter(x => x.path === '/owner/input').length, 1);
  assert.equal(f.calls.filter(x => x.path === '/owner/frame').length, 2);
  assert.equal(f.elements.text.value, '');
  assert.equal(f.elements.finish.disabled, false);
  assert.match(f.elements.status.textContent, /입력은 다시 보내지 않습니다/);
});

test('an HTTP success without a RELEASED state cannot falsely confirm handback', async () => {
  const f = fixture({ stallFrame: false, finishState: 'UNKNOWN' });
  await f.elements.start.onclick(); f.elements.finish.onclick();
  await flush(); await flush();
  assert.equal(f.elements.finish.disabled, false);
  assert.match(f.elements.status.textContent, /제어권 반환이 확인되지 않았습니다/);
});
