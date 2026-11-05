import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyJebiseoMobileOutcome as classify} from './mobile-outcome.mjs';
import {stage66FeaturePlan} from '../jh168-mobile-unification/stage66-verified-mobile-feature-profile.mjs';
import {nextStage64FeatureProvider} from '../jh168-mobile-unification/stage64-feature-fallback.mjs';

const receipt = outcome => ({schema: 'JH168_STAGE61_UNIFIED_RECEIPT_V1', outcome});

test('real Stage66 manual plans and Stage64 exhausted routes are not success or replay evidence', () => {
  for (const feature of ['NATIVE_SELECT', 'PRESS_KEY', 'HORIZONTAL_SCROLL',
    'NESTED_VERTICAL_SCROLL', 'RETURN_TO_CHROME_FROM_OTHER_APP']) {
    assert.deepEqual(classify(stage66FeaturePlan(feature)), {
      ok: false, status: 'MANUAL', manualRequired: true, readbackRequired: false
    });
  }
  const plan = nextStage64FeatureProvider({action: 'TYPE',
    webOutcome: 'VERIFIED_UNSUPPORTED_NO_EFFECT', computerOutcome: 'FAILED_NO_EFFECT'});
  const value = classify({ok: true, ...plan});
  assert.equal(value.ok, false);
  assert.equal(value.status, 'MANUAL');
  assert.equal(Object.hasOwn(value, 'verifiedNoEffect'), false);
  assert.equal(Object.hasOwn(value, 'replayAllowed'), false);
});

test('current UNKNOWN and PENDING take priority over manual guidance in original job results', () => {
  for (const outcome of ['UNKNOWN', 'PENDING']) {
    const payload = {status: 'complete', manualRequired: true, result: {
      ok: true, provider: 'MANUAL', stage61Router: receipt(outcome)
    }};
    assert.deepEqual(classify(payload), {
      ok: false, status: outcome, manualRequired: false, readbackRequired: true
    });
  }
  assert.equal(classify({status: 'pending', result: {executionStatus: 'EFFECT_UNKNOWN'}}).status, 'UNKNOWN');
});

test('OPEN completion and local approval pending cannot look complete', () => {
  assert.equal(classify({ok: true, executionStatus: 'EFFECT_UNKNOWN',
    code: 'OPEN_RESULT_UNCONFIRMED'}).status, 'UNKNOWN');
  for (const code of ['OPEN_COMPLETION_PENDING', 'action_approval_pending_local_tap',
    'screen_consent_pending_local_tap']) {
    assert.deepEqual(classify({ok: true, code}), {
      ok: false, status: 'PENDING', manualRequired: false, readbackRequired: true
    });
  }
  for (const status of ['queued', 'leased', 'running', 'in_progress'])
    assert.equal(classify({status}).status, 'PENDING');
});

test('direct STOP and effectful failure do not fall through to a manual repeat', () => {
  const plan = nextStage64FeatureProvider({action: 'TYPE', webOutcome: 'UNKNOWN'});
  assert.equal(classify(plan).status, 'STOP_NO_REPLAY');
  for (const outcome of ['FAILED_AFTER_EFFECT', 'PHONE_SCOPED_SITE_DISCARD']) {
    assert.deepEqual(classify({manualRequired: true, stage61Router: receipt(outcome)}), {
      ok: false, status: 'STOP_NO_REPLAY', manualRequired: false, readbackRequired: true
    });
  }
});

test('applied original receipts survive next STOP or MANUAL hints without gaining Gemini proof', () => {
  for (const stage61NextProvider of ['STOP_NO_REPLAY', 'MANUAL']) {
    const payload = {ok: true, stage61Router: receipt('VERIFIED_PASS'),
      stage61RouterHost: {ok: true, stopped: true, recordedOutcome: 'VERIFIED_PASS'},
      stage61NextProvider, stage61NextCode: 'STAGE61_ROUTE_STATE_STOPPED'};
    assert.deepEqual(classify(payload), {
      ok: true, status: 'RETURNED', manualRequired: false, readbackRequired: false
    });
    assert.equal(Object.hasOwn(classify(payload), 'geminiAcceptedVerified'), false);
    assert.equal(Object.hasOwn(classify(payload), 'fullReplyVerified'), false);
    assert.equal(Object.hasOwn(classify(payload), 'chatGptDelivered'), false);
  }
});

test('primary owner rejection stays distinct from secondary receipt-schema diagnostics', () => {
  const payload = {ok: false, code: 'OWNER_ADMISSION_BLOCKED',
    resultVerification: {state: 'FAILED_PRE_DISPATCH', reason: 'owner_admission_rejected_no_dispatch'},
    stage61RouterHost: {ok: false, code: 'STAGE61_RECEIPT_SCHEMA_INVALID'},
    stage61NextProvider: 'STOP_NO_REPLAY', stage61NextCode: 'STAGE61_RECEIPT_SCHEMA_INVALID'};
  const before = structuredClone(payload), classified = classify(payload);
  assert.equal(classified.status, 'BLOCKED');
  assert.equal(Object.hasOwn(classified, 'code'), false);
  assert.deepEqual(payload, before);
  assert.equal(payload.code, 'OWNER_ADMISSION_BLOCKED');
  // A secondary diagnostic alone is not a failed primary action/read.
  assert.equal(classify({ok: true, stage61RouterHost: payload.stage61RouterHost}).status, 'RETURNED');
});

test('nested original failures, verification uncertainty and MCP errors remain incomplete', () => {
  assert.equal(classify({status: 'complete', result: {ok: false, code: 'OWNER_ADMISSION_BLOCKED'}}).status, 'BLOCKED');
  assert.equal(classify({ok: true, resultVerification: {state: 'UNKNOWN'}}).status, 'UNKNOWN');
  assert.equal(classify({ok: true, stage61RouterHost: {recordedOutcome: 'PENDING'}}).status, 'PENDING');
  assert.equal(classify({ok: true}, {isError: true}).ok, false);
  assert.equal(classify({ok: true, allowed: false}).status, 'BLOCKED');
});

test('guided-form dispatched/readback states never become full Gemini action proof', () => {
  const dispatched = {ok: true, code: 'low_risk_action_dispatched', actionAccepted: true,
    transactionSuccessVerified: false, autoRetryAllowed: false, rescanRequired: true};
  assert.deepEqual(classify(dispatched), {
    ok: true, status: 'RETURNED', manualRequired: false, readbackRequired: true
  });
  const typed = {ok: true, code: 'field_value_verified', valueVerified: true,
    operation: 'type', effectConfirmed: false, autoRetryAllowed: false};
  assert.deepEqual(classify(typed), {
    ok: true, status: 'RETURNED', manualRequired: false, readbackRequired: false
  });
});

test('UI text, nested advice, old outcome history and URL strings are not control results', () => {
  const payload = {ok: true, items: [{label: 'MANUAL', code: 'OPEN_COMPLETION_PENDING', status: 'UNKNOWN'}],
    advice: {manualRequired: true}, description: 'STOP_NO_REPLAY',
    stage61RouterHost: {webOutcome: 'UNKNOWN', approval: {state: 'PENDING'}},
    result: {ok: true, url: '{"ok":false,"status":"UNKNOWN"}'},
    acted: {status: 'pending'}, snapshot: {result: {provider: 'MANUAL'}}};
  assert.deepEqual(classify(payload), {
    ok: true, status: 'RETURNED', manualRequired: false, readbackRequired: false
  });
});

test('missing/malformed unwrapped results stay unverifiable and projection is immutable', () => {
  for (const payload of [null, undefined, [], 'MANUAL', false]) {
    assert.deepEqual(classify(payload), {
      ok: false, status: 'UNVERIFIABLE', manualRequired: false, readbackRequired: true
    });
  }
  assert.equal(Object.isFrozen(classify({ok: true})), true);
});

test('review regression: original duplicate-guard and Stage70 no-replay states precede manual guidance', () => {
  for (const original of [
    {status: 'NEEDS_REVIEW_NO_REPLAY', executed: false, duplicate: true},
    {code: 'NEEDS_REVIEW_NO_REPLAY'},
    {resultVerification: {status: 'NEEDS_REVIEW_NO_REPLAY', state: 'NEEDS_REVIEW'}},
    {resultVerification: {state: 'NEEDS_REVIEW'}},
    {status: 'complete', result: {status: 'NEEDS_REVIEW_NO_REPLAY'}}
  ]) {
    const payload = {ok: true, manualRequired: true, ...original};
    const before = structuredClone(payload);
    assert.deepEqual(classify(payload), {
      ok: false, status: 'STOP_NO_REPLAY', manualRequired: false, readbackRequired: true
    });
    assert.deepEqual(payload, before);
  }
  const matrix = JSON.parse(readFileSync(new URL('../../../jh-mobile-dual-engine/stage70/alias-matrix.json', import.meta.url), 'utf8'));
  for (const status of matrix.noReplayOn) {
    const classified = classify({ok: true, status, manualRequired: true});
    assert.equal(classified.ok, false, status);
    assert.equal(classified.manualRequired, false, status);
    assert.equal(classified.readbackRequired, true, status);
    assert.ok(['UNKNOWN', 'PENDING', 'STOP_NO_REPLAY'].includes(classified.status), status);
  }
});

test('job-error regression: expired, timeout and missing original jobs require unresolved readback', () => {
  for (const original of [
    {status: 'expired', error: 'job_timeout', result: null},
    {jobStatus: 'expired'},
    {error: 'job_timeout'},
    {error: 'not found'},
    {status: 'error', error: 'DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY'},
    {status: 'complete', result: {error: 'not found'}}
  ]) {
    const payload = {manualRequired: true, ...original};
    const before = structuredClone(payload);
    assert.deepEqual(classify(payload), {
      ok: false, status: 'UNKNOWN', manualRequired: false, readbackRequired: true
    });
    assert.deepEqual(payload, before);
  }
});

test('job-error regression: primary error strings block while UI and secondary diagnostics do not', () => {
  assert.equal(classify({error: 'no_active_android_device'}).status, 'BLOCKED');
  assert.equal(classify({status: 'complete', result: {error: 'task_digest_required'}}).status, 'BLOCKED');
  const primary = {ok: false, code: 'OWNER_ADMISSION_BLOCKED',
    stage61RouterHost: {error: 'not found', status: 'NEEDS_REVIEW_NO_REPLAY'}};
  assert.equal(classify(primary).status, 'BLOCKED');
  assert.equal(primary.code, 'OWNER_ADMISSION_BLOCKED');
  for (const error of [null, '']) {
    const payload = {ok: true, error,
      items: [{error: 'not found', status: 'expired', code: 'NEEDS_REVIEW_NO_REPLAY'}],
      stage61RouterHost: {error: 'job_timeout', status: 'NEEDS_REVIEW_NO_REPLAY'},
      result: {ok: true, url: '{"error":"not found"}'}};
    assert.deepEqual(classify(payload), {
      ok: true, status: 'RETURNED', manualRequired: false, readbackRequired: false
    });
  }
});
