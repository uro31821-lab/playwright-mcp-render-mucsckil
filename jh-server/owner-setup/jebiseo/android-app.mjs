/**
 * Source-backed Android OPEN_APP targets and one read-only current-window view.
 * The existing Secure56 host owns authentication, dispatch and completion. This
 * module neither calls a tool nor treats public JSON or a digest as authority.
 */
const TARGETS = new Map([
  ['com.google.android.youtube', Object.freeze({packageName: 'com.google.android.youtube', target: '유튜브 앱'})],
  ['com.google.android.gm', Object.freeze({packageName: 'com.google.android.gm', target: '지메일 앱'})],
  ['com.instagram.android', Object.freeze({packageName: 'com.instagram.android', target: '인스타그램 앱'})]
]);
export const JEBISEO_ANDROID_APP_PACKAGES = Object.freeze([...TARGETS.keys()]);

/** Exact, single-package aliases in the preserved Stage62 ServiceLauncher.
 * The canonical suffix also selects the current server's explicit native-app
 * branch. No arbitrary package, URL, ambiguous brand or multi-package fallback.
 */
export function getJebiseoAndroidTarget(packageName) {
  return typeof packageName === 'string' ? TARGETS.get(packageName) ?? null : null;
}

const MAX_AGE_MS = 45000;
const HEX64 = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const positiveTime = value => Number.isSafeInteger(value) && value > 0;
const id = value => Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff;
const digest = value => typeof value === 'string' && HEX64.test(value);
const excluded = new Set(['com.openai.chatgpt', 'com.android.systemui',
  'com.sec.android.app.launcher', 'com.samsung.android.sidegesturepad',
  'com.samsung.android.soundassistant', 'com.google.android.permissioncontroller',
  'com.android.permissioncontroller', 'com.google.android.packageinstaller',
  'com.android.packageinstaller']);
const safePackage = value => typeof value === 'string' && value.length <= 200 &&
  /^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(value) && !excluded.has(value) &&
  !value.startsWith('com.koreanlifehub.bridge');
function bounds(value) {
  if (typeof value !== 'string' || !/^\d+,\d+,\d+,\d+$/.test(value)) return null;
  const b = value.split(',').map(Number);
  return b.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000) &&
    b[2] - b[0] >= 100 && b[3] - b[1] >= 100 ? b : null;
}
function completedTime(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const at = Date.parse(value);
  return positiveTime(at) && new Date(at).toISOString() === value ? at : null;
}

/** Inspect only the ORIGINAL completed computer_use_inspect WAIT projection.
 * WAIT here is inspection metadata, never the action executor or a timer.
 * Stage62 emits a preflight Stage61 scope and a separately read actual screen;
 * their package/window/bounds must agree. No phone observation timestamp is
 * invented: the authenticated host must bind this job's start/completion
 * interval after the particular OPEN_APP receipt and to the current request.
 */
export function inspectJebiseoAndroidAppObservation(input = {}) {
  const stop = code => Object.freeze({ok: false, code, authorityVerified: false});
  if (!plain(input) || Object.keys(input).some(key =>
    !['job', 'taskDigest', 'expectedPackage', 'now'].includes(key)))
    return stop('ANDROID_APP_OBSERVATION_ARGUMENTS_INVALID');
  const {job, taskDigest, expectedPackage, now = Date.now()} = input;
  if (!positiveTime(now) || !digest(taskDigest) || !safePackage(expectedPackage))
    return stop('ANDROID_APP_OBSERVATION_ARGUMENTS_INVALID');
  if (!plain(job) || job.type !== 'computer_use_inspect' || job.status !== 'complete' ||
      job.error !== null || !plain(job.result))
    return stop('ANDROID_APP_ORIGINAL_INSPECTION_REQUIRED');
  if (job.mcpToolName !== 'life_android_computer_inspect' ||
      job.secureRequestedEffect !== 'READ_ONLY' || job.action !== 'WAIT' ||
      job.effect !== 'READ_ONLY' || job.dataClass !== 'NONE')
    return stop('ANDROID_APP_READ_ONLY_INSPECTION_REQUIRED');
  if (job.taskDigest !== taskDigest) return stop('ANDROID_APP_TASK_BINDING_MISMATCH');

  const completedAtMs = completedTime(job.completedAt);
  if (!positiveTime(job.createdAtMs) || !positiveTime(job.startedAtMs) ||
      completedAtMs === null || job.createdAtMs > job.startedAtMs ||
      job.startedAtMs > completedAtMs || completedAtMs > now ||
      now - job.createdAtMs > MAX_AGE_MS)
    return stop('ANDROID_APP_OBSERVATION_TIME_UNVERIFIED');
  const result = job.result;
  if (result.ok !== true || result.code !== 'screen_ready' ||
      ['executed', 'dispatched', 'phoneActionDispatched', 'resultVerified', 'automaticReplay']
        .some(key => Object.hasOwn(result, key) && result[key] !== false))
    return stop('ANDROID_APP_INSPECTION_RESULT_UNVERIFIED');
  const screen = result.screen, target = result.target, route = result.stage61Router;
  if (!plain(screen) || !id(screen.windowId) || !safePackage(screen.packageName) ||
      !digest(screen.structuralDigest) || screen.screenshotDigest !== null ||
      screen.locked !== false || screen.secureContext !== false || screen.routingBusy !== false ||
      !plain(target) || target.trust !== 'NONE' || target.risk !== 'NONE' ||
      target.ambiguous !== false || !digest(target.targetDigest))
    return stop('ANDROID_APP_CURRENT_SCREEN_UNVERIFIED');
  if (!plain(route) || route.routerVersion !== 'JH168_STAGE61_RIGHT_PANE_ROUTER_V3' ||
      route.routeSchema !== 'JH168_STAGE61_ROUTE_REQUEST_V1' ||
      route.schema !== 'JH168_STAGE61_UNIFIED_RECEIPT_V1' ||
      route.provider !== 'ANDROID_COMPUTER_USE' || route.action !== 'READ_ONLY_INSPECT' ||
      route.phase !== 'INSPECT' || route.routeCode !== 'READ_ONLY_COMPUTER_USE_INSPECTION' ||
      route.allowed !== true || route.leftGptProtected !== true || route.rightWorkVerified !== true ||
      route.sameDisplay !== true || route.fixedLayout !== 'LEFT_GPT_RIGHT_WORK' ||
      route.outcome !== 'READ_ONLY_VERIFIED' || route.originalCode !== 'screen_ready' ||
      !digest(route.unifiedReceiptDigest) ||
      ['fallbackEligible', 'compatibilityDirectProvider', 'replayAllowed', 'actionDispatched',
        'resultVerified', 'successReceipt', 'verifiedUnsupportedNoEffect', 'automaticReplay']
        .some(key => route[key] !== false))
    return stop('ANDROID_APP_CURRENT_SCOPE_UNVERIFIED');
  const chatBounds = bounds(route.chatBounds), workBounds = bounds(route.workBounds);
  // Stage61 permits unknown display IDs in its own classifier. They do not
  // establish the same physical display for this current-app observation.
  if (route.chatPackage !== 'com.openai.chatgpt' || !id(route.chatWindowId) ||
      !id(route.workWindowId) || route.chatWindowId === route.workWindowId ||
      !id(route.chatDisplayId) || !id(route.workDisplayId) ||
      route.chatDisplayId !== route.workDisplayId || !chatBounds || !workBounds ||
      workBounds[0] < chatBounds[2] ||
      Math.min(chatBounds[3], workBounds[3]) - Math.max(chatBounds[1], workBounds[1]) < 100)
    return stop('ANDROID_APP_RIGHT_LAYOUT_UNVERIFIED');
  if (route.workPackage !== screen.packageName || route.workWindowId !== screen.windowId ||
      ['left', 'top', 'right', 'bottom'].some((key, index) => screen[key] !== workBounds[index]) ||
      screen.viewportWidth !== workBounds[2] - workBounds[0] ||
      screen.viewportHeight !== workBounds[3] - workBounds[1])
    return stop('ANDROID_APP_PREFLIGHT_SCREEN_MISMATCH');
  if (screen.packageName !== expectedPackage) return stop('ANDROID_APP_TARGET_PACKAGE_MISMATCH');

  return Object.freeze({ok: true, code: 'ANDROID_APP_OBSERVATION_CANDIDATE', authorityVerified: false,
    evidence: Object.freeze({schema: 'jh.jebiseo-android-app-observation.v1', scope: 'RIGHT_APP_WINDOW_ONLY',
      packageName: screen.packageName, windowId: screen.windowId, chatWindowId: route.chatWindowId,
      displayId: route.workDisplayId, workBounds: Object.freeze(workBounds), chatBounds: Object.freeze(chatBounds),
      createdAtMs: job.createdAtMs, startedAtMs: job.startedAtMs, completedAtMs})});
}
