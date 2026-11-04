import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGeminiAvailability} from '../scripts/availability.mjs';

// Synthetic trusted-host statuses exercise the interpreter, not a live provider.
const visibleFixture = Object.freeze({
  schema: 'jh.jebiseo-capabilities.v1', provider: 'gemini',
  productionRegistered: true, codeCandidate: false,
  runtimeMode: 'PHONE_RIGHT', mobileRoute: 'android_right',
  visibleExecutionSupported: true, internalExecutionSupported: false,
  geminiAssistanceAvailable: true, liveExecutionVerified: true
});
const internalFixture = Object.freeze({...visibleFixture,
  runtimeMode: undefined, mobileRoute: undefined, visibleExecutionSupported: false,
  internalExecutionSupported: true
});
const internal = Object.freeze({visibility: 'INTERNAL'});
const unavailable = (result, reason) => {
  assert.equal(result.available, false);
  assert.deepEqual(result.capabilities, []);
  assert.equal(result.reason, reason);
  assert.equal(result.authorizesExecution, false);
};

test('missing or unrelated provider evidence cannot activate Gemini', () => {
  for (const status of [undefined, null, [], {}, 'connected',
    {...visibleFixture, schema: 'unrelated.v1'}, {...visibleFixture, provider: 'other'}]) {
    unavailable(resolveGeminiAvailability(status), 'GEMINI_PROVIDER_STATUS_REQUIRED');
  }
});

test('visible PHONE_RIGHT is the default and does not require hidden support', () => {
  const implicit = resolveGeminiAvailability(visibleFixture);
  assert.equal(implicit.available, true);
  assert.deepEqual(implicit.capabilities, ['gemini-assistance']);
  assert.deepEqual(implicit, resolveGeminiAvailability(visibleFixture, {visibility: 'VISIBLE'}));
});

test('current candidate cannot become available through a mobile route or code tests', () => {
  unavailable(resolveGeminiAvailability({
    ...visibleFixture, productionRegistered: false, codeCandidate: true,
    visibleExecutionSupported: false, visibleMobileCandidateSupported: true,
    geminiAssistanceAvailable: false, liveExecutionVerified: false, codeTestsPassed: 150
  }), 'GEMINI_PRODUCTION_PROVIDER_UNAVAILABLE');
  for (const patch of [{productionRegistered: false}, {productionRegistered: undefined},
    {productionRegistered: 'true'}, {codeCandidate: true}]) {
    unavailable(resolveGeminiAvailability({...visibleFixture, ...patch}),
      'GEMINI_PRODUCTION_PROVIDER_UNAVAILABLE');
  }
});

test('visible availability requires the exact phone route and actual visible support', () => {
  for (const patch of [{runtimeMode: undefined}, {runtimeMode: 'PLAYWRIGHT'},
    {runtimeMode: 'ORIGINAL'}, {mobileRoute: undefined}, {mobileRoute: 'cloud_browser'}]) {
    unavailable(resolveGeminiAvailability({...visibleFixture, ...patch}),
      'GEMINI_PHONE_RIGHT_PROVIDER_REQUIRED');
  }
  for (const visibleExecutionSupported of [false, 'true', 1, null, undefined]) {
    unavailable(resolveGeminiAvailability({...visibleFixture, visibleExecutionSupported,
      visibleMobileCandidateSupported: true}), 'GEMINI_VISIBLE_EXECUTION_UNAVAILABLE');
  }
});

test('explicit INTERNAL never falls back to a visible live provider', () => {
  unavailable(resolveGeminiAvailability(visibleFixture, internal), 'HIDDEN_EXECUTION_UNAVAILABLE');
  for (const internalExecutionSupported of [false, 'true', 1, null, undefined]) {
    unavailable(resolveGeminiAvailability({...internalFixture, internalExecutionSupported}, internal),
      'HIDDEN_EXECUTION_UNAVAILABLE');
  }
  assert.equal(resolveGeminiAvailability(internalFixture, internal).available, true);
  unavailable(resolveGeminiAvailability(internalFixture), 'GEMINI_PHONE_RIGHT_PROVIDER_REQUIRED');
});

test('unknown visibility cannot silently become an allowed execution route', () => {
  for (const visibility of ['HIDDEN', 'visible', '', false, null]) {
    unavailable(resolveGeminiAvailability(visibleFixture, {visibility}), 'GEMINI_VISIBILITY_INVALID');
  }
});

test('both routes require available Gemini and verified live execution', () => {
  for (const [fixture, options] of [[visibleFixture, undefined], [internalFixture, internal]]) {
    for (const [field, reason] of [
      ['geminiAssistanceAvailable', 'GEMINI_ASSISTANCE_UNAVAILABLE'],
      ['liveExecutionVerified', 'GEMINI_LIVE_EXECUTION_UNVERIFIED']
    ]) {
      for (const value of [false, 'true', 1, null, undefined]) {
        unavailable(resolveGeminiAvailability({...fixture, [field]: value, codeTestsPassed: 150}, options), reason);
      }
    }
  }
});

test('hub capability stays advisory and does not assert the three feature results', () => {
  const status = Object.freeze({...visibleFixture, features: Object.freeze({
    YOUTUBE: true, VIDEO: true, ANDROID: true
  }), includedVideoUseAvailable: true, additionalPaymentRequired: false});
  const before = JSON.stringify(status);
  assert.deepEqual(resolveGeminiAvailability(status), {
    provider: 'gemini', available: true, capabilities: ['gemini-assistance'], reason: null,
    authorizesExecution: false, dispatchesTools: false, changesPersistentState: false
  });
  assert.equal(JSON.stringify(status), before);
});
