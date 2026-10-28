import test from 'node:test';
import assert from 'node:assert/strict';
import { GEMINI_NATIVE_PROFILE as profile, nativeWorkViewport, nodeToWorkPoint, discoverGeminiInput } from '../src/gemini-ui.mjs';

// Sanitized geometry from the live Fold screen. No account, window ID or token retained.
const screen = { windowId: 7, packageName: profile.hostPackage, left: 1233, top: 0, right: 2448, bottom: 1713 };
const account = { windowId: '7', package: profile.hostPackage, bounds: '2313 121 2415 223' };
const title = { windowId: '7', package: profile.hostPackage, text: 'Gemini Flash', editable: 'false' };
const input = { windowId: '7', package: profile.hostPackage, viewId: profile.inputViewId,
  bounds: '1334 1431 2347 1553', editable: 'true', text: 'private draft', sensitive: 'false' };

test('absolute avatar bounds map to the centre, not the screen edge', () => {
  const p = nodeToWorkPoint(screen, account);
  assert.deepEqual(p, { x: 1131, y: 172, viewport_width: 1215, viewport_height: 1713 });
  // Reproduce JH runtime mapping: this must hit the exact observed native centre.
  assert.equal(screen.left + Math.floor(p.x * (screen.right - screen.left) / p.viewport_width), 2364);
});
test('capture viewport matches native work size even if inspect had a display-sized override', () => {
  assert.deepEqual(nativeWorkViewport({ ...screen, viewportWidth: 2448, viewportHeight: 1713 }),
    { viewport_width: 1215, viewport_height: 1713 });
});
test('nonzero top offset is removed for a vertically shifted work pane', () => {
  assert.deepEqual(nodeToWorkPoint({ ...screen, top: 100, bottom: 1813 },
    { ...account, bounds: '2313 221 2415 323' }), { x: 1131, y: 172, viewport_width: 1215, viewport_height: 1713 });
});
test('wrong windows, foreign apps and nodes crossing a pane boundary cannot become actions', () => {
  for (const node of [{ ...account, windowId: '8' }, { ...account, package: 'other.app' },
    { ...account, bounds: '1200 121 1300 223' }, { ...account, bounds: '2313 121 2450 223' }])
    assert.throws(() => nodeToWorkPoint(screen, node));
  assert.throws(() => nativeWorkViewport({ ...screen, right: NaN }));
  assert.throws(() => nodeToWorkPoint(screen, { ...account, bounds: '2313 121 2313 223' }));
});
test('Google package or text alone cannot identify the Gemini native input', () => {
  assert.notEqual(discoverGeminiInput([input], screen).code, 'GEMINI_INPUT_CANDIDATE');
  assert.notEqual(discoverGeminiInput([title], screen).code, 'GEMINI_INPUT_CANDIDATE');
  assert.notEqual(discoverGeminiInput([title, input, input], screen).code, 'GEMINI_INPUT_CANDIDATE');
});
test('candidate discovery never claims signed proof, entitlement or an unseen send button', () => {
  const result = discoverGeminiInput([title, input], screen);
  assert.equal(result.code, 'GEMINI_INPUT_CANDIDATE');
  assert.equal(result.verified, false);
  assert.equal(result.needsFreshJhValidation, true);
  assert.equal(result.submitIdentified, false);
  assert.equal(result.entitlementVerified, false);
  assert.equal(JSON.stringify(result).includes('private draft'), false);
});
