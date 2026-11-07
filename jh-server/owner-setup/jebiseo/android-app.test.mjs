import test from 'node:test';
import assert from 'node:assert/strict';
import {getJebiseoAndroidTarget, inspectJebiseoAndroidAppObservation} from './android-app.mjs';

const now = Date.parse('2026-11-05T14:00:00.000Z');
const taskDigest = 'a'.repeat(64);
const expectedPackage = 'com.google.android.youtube';

// Synthetic projection shaped after BridgeService computer_use_inspect ->
// AndroidComputerUseRuntime.inspect(WAIT) + Stage61 attachReceipt(INSPECT).
// These tests do not create an authenticated host or execute a phone action.
function fixture() {
  return {taskDigest, expectedPackage, now, job: {
    type: 'computer_use_inspect', status: 'complete', error: null,
    mcpToolName: 'life_android_computer_inspect', secureRequestedEffect: 'READ_ONLY',
    action: 'WAIT', effect: 'READ_ONLY', dataClass: 'NONE', taskDigest,
    createdAtMs: now - 800, startedAtMs: now - 600, completedAt: new Date(now - 100).toISOString(),
    result: {ok: true, code: 'screen_ready',
      screen: {packageName: expectedPackage, windowId: 12,
        left: 700, top: 0, right: 1400, bottom: 1000, viewportWidth: 700, viewportHeight: 1000,
        structuralDigest: 'b'.repeat(64), screenshotDigest: null,
        locked: false, secureContext: false, routingBusy: false},
      target: {trust: 'NONE', risk: 'NONE', ambiguous: false, targetDigest: 'c'.repeat(64)},
      stage61Router: {routerVersion: 'JH168_STAGE61_RIGHT_PANE_ROUTER_V3',
        routeSchema: 'JH168_STAGE61_ROUTE_REQUEST_V1', schema: 'JH168_STAGE61_UNIFIED_RECEIPT_V1',
        provider: 'ANDROID_COMPUTER_USE', action: 'READ_ONLY_INSPECT', phase: 'INSPECT',
        routeCode: 'READ_ONLY_COMPUTER_USE_INSPECTION', allowed: true,
        fallbackEligible: false, compatibilityDirectProvider: false, replayAllowed: false,
        leftGptProtected: true, rightWorkVerified: true, sameDisplay: true,
        fixedLayout: 'LEFT_GPT_RIGHT_WORK', chatPackage: 'com.openai.chatgpt',
        chatWindowId: 11, workPackage: expectedPackage, workWindowId: 12,
        chatBounds: '0,0,700,1000', workBounds: '700,0,1400,1000',
        chatDisplayId: 0, workDisplayId: 0, outcome: 'READ_ONLY_VERIFIED', originalCode: 'screen_ready',
        actionDispatched: false, resultVerified: false, successReceipt: false,
        verifiedUnsupportedNoEffect: false, automaticReplay: false, unifiedReceiptDigest: 'd'.repeat(64)}
    }
  }};
}
function reject(change, code) {
  const input = fixture(); change(input);
  const got = inspectJebiseoAndroidAppObservation(input);
  assert.equal(got.ok, false);
  assert.equal(got.authorityVerified, false);
  assert.equal(Object.hasOwn(got, 'evidence'), false);
  if (code) assert.equal(got.code, code);
}

test('canonical source aliases select one known package without URL or caller-label guessing', () => {
  assert.deepEqual(getJebiseoAndroidTarget(expectedPackage), {packageName: expectedPackage, target: '유튜브 앱'});
  assert.deepEqual(getJebiseoAndroidTarget('com.google.android.gm'), {packageName: 'com.google.android.gm', target: '지메일 앱'});
  assert.deepEqual(getJebiseoAndroidTarget('com.instagram.android'), {packageName: 'com.instagram.android', target: '인스타그램 앱'});
  for (const bad of ['com.openai.chatgpt', 'com.koreanlifehub.bridge', 'com.android.systemui',
    'org.telegram.messenger', 'com.unknown.app', '유튜브', 'https://youtube.com',
    'com.google.android.youtube ', '__proto__', null, {packageName: expectedPackage}])
    assert.equal(getJebiseoAndroidTarget(bad), null);
  assert.ok(Object.isFrozen(getJebiseoAndroidTarget(expectedPackage)));
});

test('matching real-producer shape proves only a bounded structural RIGHT app observation', () => {
  const input = fixture(), original = structuredClone(input);
  const got = inspectJebiseoAndroidAppObservation(input);
  assert.equal(got.ok, true);
  assert.equal(got.authorityVerified, false);
  assert.deepEqual(got.evidence, {schema: 'jh.jebiseo-android-app-observation.v1', scope: 'RIGHT_APP_WINDOW_ONLY',
    packageName: expectedPackage, windowId: 12, chatWindowId: 11, displayId: 0,
    workBounds: [700, 0, 1400, 1000], chatBounds: [0, 0, 700, 1000],
    createdAtMs: now - 800, startedAtMs: now - 600, completedAtMs: now - 100});
  assert.deepEqual(input, original);
  assert.ok(Object.isFrozen(got) && Object.isFrozen(got.evidence) && Object.isFrozen(got.evidence.workBounds));
  assert.equal(Object.hasOwn(got.evidence, 'observedAtMs'), false);
  assert.equal(Object.hasOwn(got, 'appActionVerified'), false);
});

test('requires the original complete read-only WAIT job and its exact task binding', () => {
  for (const [key, value] of [['type', 'agent_snapshot'], ['status', 'queued'], ['error', 'lost'],
    ['mcpToolName', 'life_android_execute_computer_action'], ['secureRequestedEffect', 'MUTATION'],
    ['action', 'CLICK'], ['effect', 'REVERSIBLE_WRITE'], ['dataClass', 'PERSONAL']])
    reject(input => {input.job[key] = value;});
  reject(input => {input.job.taskDigest = 'e'.repeat(64);}, 'ANDROID_APP_TASK_BINDING_MISMATCH');
  reject(input => {delete input.job.action;});
  reject(input => {input.job = {structuredContent: input.job};}, 'ANDROID_APP_ORIGINAL_INSPECTION_REQUIRED');
  reject(input => {input.job.result = {url: JSON.stringify(input.job.result)};});
  reject(input => {input.job.result = {ok: false, code: 'unavailable', next: input.job.result};});
});

test('old, unordered, future or missing timestamps cannot become current app evidence', () => {
  reject(input => {input.job.createdAtMs = now - 45001;}, 'ANDROID_APP_OBSERVATION_TIME_UNVERIFIED');
  reject(input => {input.job.startedAtMs = now - 900;}, 'ANDROID_APP_OBSERVATION_TIME_UNVERIFIED');
  reject(input => {input.job.completedAt = new Date(now - 700).toISOString();});
  reject(input => {input.job.completedAt = new Date(now + 1).toISOString();});
  reject(input => {input.job.completedAt = String(now - 100);});
  reject(input => {input.job.startedAtMs = String(now - 600);});
  reject(input => {delete input.job.createdAtMs;});
});

test('screen_ready still rejects locked, sensitive, routing-busy or action-bearing observations', () => {
  for (const field of ['locked', 'secureContext', 'routingBusy'])
    for (const value of [true, 'false', null, undefined])
      reject(input => {input.job.result.screen[field] = value;}, 'ANDROID_APP_CURRENT_SCREEN_UNVERIFIED');
  for (const field of ['executed', 'dispatched', 'phoneActionDispatched', 'resultVerified', 'automaticReplay'])
    for (const value of [true, 'false']) reject(input => {input.job.result[field] = value;});
  reject(input => {input.job.result.ok = 'true';});
  reject(input => {input.job.result.target.trust = 'ACCESSIBILITY_VERIFIED';});
  reject(input => {input.job.result.target.risk = 'CONSEQUENTIAL';});
  reject(input => {input.job.result.screen.screenshotDigest = 'a'.repeat(64);});
});

test('preflight receipt never substitutes for the actual inspected package, window or bounds', () => {
  reject(input => {input.job.result.screen.packageName = 'com.google.android.gm';}, 'ANDROID_APP_PREFLIGHT_SCREEN_MISMATCH');
  reject(input => {input.job.result.screen.windowId = 13;}, 'ANDROID_APP_PREFLIGHT_SCREEN_MISMATCH');
  reject(input => {input.job.result.screen.left = 701;}, 'ANDROID_APP_PREFLIGHT_SCREEN_MISMATCH');
  reject(input => {input.job.result.screen.viewportWidth = 701;}, 'ANDROID_APP_PREFLIGHT_SCREEN_MISMATCH');
  reject(input => {input.job.result.screen.windowId = '12';});
  reject(input => {input.job.result.screen.packageName = 'com.google.android.gm';
    input.job.result.stage61Router.workPackage = 'com.google.android.gm';}, 'ANDROID_APP_TARGET_PACKAGE_MISMATCH');
});

test('requires a same-display native LEFT ChatGPT and RIGHT work app with exact numeric identities', () => {
  for (const change of [r => {r.chatDisplayId = null;}, r => {r.workDisplayId = '0';},
    r => {r.workDisplayId = 1;}, r => {r.chatDisplayId = -1;}, r => {r.chatWindowId = 12;},
    r => {r.workWindowId = -1;}, r => {r.chatPackage = 'com.android.chrome';},
    r => {r.chatBounds = '700,0,1400,1000'; r.workBounds = '0,0,700,1000';},
    r => {r.chatBounds = '0,1000,700,2000';}, r => {r.chatBounds = '0,0,800,1000';}])
    reject(input => change(input.job.result.stage61Router), 'ANDROID_APP_RIGHT_LAYOUT_UNVERIFIED');
});

test('unverified or action receipts and string booleans stay rejected', () => {
  for (const [key, value] of [['phase', 'EXECUTE'], ['outcome', 'VERIFIED_PASS'], ['allowed', 'true'],
    ['sameDisplay', 'true'], ['rightWorkVerified', false], ['actionDispatched', true],
    ['resultVerified', true], ['successReceipt', true], ['automaticReplay', 'false'],
    ['provider', 'ANDROID_WEB'], ['action', 'NATIVE_APP_ACTION'], ['unifiedReceiptDigest', 'missing']])
    reject(input => {input.job.result.stage61Router[key] = value;}, 'ANDROID_APP_CURRENT_SCOPE_UNVERIFIED');
  reject(input => {delete input.job.result.stage61Router;}, 'ANDROID_APP_CURRENT_SCOPE_UNVERIFIED');
});

test('rejects unsafe targets and caller-injected alternative primary result arguments', () => {
  for (const pkg of ['com.openai.chatgpt', 'com.koreanlifehub.bridge', 'com.koreanlifehub.bridge.debug',
    'com.android.systemui', 'com.android.permissioncontroller', 'https://youtube.com', '', null])
    reject(input => {input.expectedPackage = pkg;}, 'ANDROID_APP_OBSERVATION_ARGUMENTS_INVALID');
  reject(input => {input.raw = input.job;}, 'ANDROID_APP_OBSERVATION_ARGUMENTS_INVALID');
  reject(input => {input.taskDigest = 'bad';}, 'ANDROID_APP_OBSERVATION_ARGUMENTS_INVALID');
  assert.equal(inspectJebiseoAndroidAppObservation(null).ok, false);
});
