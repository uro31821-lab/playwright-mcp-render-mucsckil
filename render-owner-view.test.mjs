import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./render-owner-view.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = data => ({ ok: true, async json() { return data; } });
const bad = code => ({ ok: false, async json() { return { code }; } });

function fixture({ stallFrame = true, finishFailure = false } = {}) {
  const ids = ['status', 'start', 'finish', 'entry', 'keys', 'screen', 'site', 'text', 'refresh'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    textContent: '', disabled: id === 'finish', hidden: ['entry','keys'].includes(id),
    value: '', width: 1280, height: 900, onclick: null,
  }]));
  elements.screen.getContext = () => ({ drawImage() {}, clearRect() {} });
  elements.screen.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 900 });
  const calls = [];
  let resumeFrame;
  const frameResponse = ok({ image: '', frame: 'fake-frame', width: 1280,
    height: 900, site: 'https://example.com' });
  const waitFrame = new Promise(resolve => { resumeFrame = () => resolve(frameResponse); });
  const fakeFetch = async (path, options) => {
    calls.push({ path, method: options?.method, authorization: options?.headers?.Authorization || null });
    if (path === '/owner/claim') return ok({ secret: 'synthetic-owner-secret' });
    if (path === '/owner/frame') return stallFrame ? waitFrame : frameResponse;
    if (path === '/owner/finish') return finishFailure ? bad('OWNER_BUSY') : ok({ state: 'RELEASED' });
    if (path === '/owner/input') return ok({ state: 'APPLIED' });
    throw Error('TEST_UNEXPECTED_FETCH');
  };
  vm.runInNewContext(source, {
    document: { getElementById: id => elements[id] },
    location: { hash: '#synthetic-ticket' },
    history: { replaceState() {} },
    fetch: fakeFetch,
    atob: () => '',
    Uint8Array,
    Blob,
    createImageBitmap: async () => ({ close() {} }),
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener() {},
  }, { filename: 'render-owner-view.js' });
  return { elements, calls, resumeFrame };
}

test('Finish stays unavailable before claim and becomes available on successful handoff', async () => {
  const f = fixture({ stallFrame: false });
  assert.equal(f.elements.finish.disabled, true);
  await f.elements.start.onclick();
  assert.equal(f.elements.finish.disabled, false);
  assert.equal(f.elements.start.hidden, true);
  assert.match(f.elements.status.textContent, /직접 조작 중/);
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
