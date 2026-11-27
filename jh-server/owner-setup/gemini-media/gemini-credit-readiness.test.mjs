/** No-network credential/credit readiness regression.
 * These tests NEVER contact Google and cannot authorize live paid calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GeminiLifeCheckpointStore} from './gemini-storage.mjs';
import {readGeminiConfiguration, createGeminiMediaService} from './gemini-service.mjs';

const NOW = Date.parse('2026-11-27T03:00:00Z');
const base = {
  JH_GEMINI_ANALYSIS_ENABLED: '1',
  JH_GEMINI_GENERATION_ENABLED: '1',
  GEMINI_API_KEY: 'offline-test-key-not-for-google',
  JH_GEMINI_CREDIT_VERIFIED: 'CLOUD_CREDIT_ONLY_V1',
  JH_GEMINI_CREDIT_APPROVAL_REF: 'local_test_only_20261127',
  JH_GEMINI_CREDIT_VALID_UNTIL: '2026-12-20T00:00:00Z',
  JH_GEMINI_VERIFIED_CREDIT_USD: '10',
  JH_GEMINI_MONTHLY_LIMIT_USD: '10',
  JH_GEMINI_REQUEST_LIMIT_USD: '2'
};
function analysis(id) {
  return {
    kind: 'analysis', requestId: 'readiness_' + id, taskRef: 'readiness_task_' + id,
    userRequest: '이 유튜브 영상 분석해줘',
    prompt: '요청한 1분 구간의 내용을 사실과 추정으로 구분해 정리해줘.',
    sourceUrl: 'https://youtu.be/abcdefghijk', startSeconds: 0, endSeconds: 60
  };
}
function localOnly(t, overrides) {
  const directory = mkdtempSync(join(tmpdir(), 'jh-gemini-credit-'));
  const store = new GeminiLifeCheckpointStore({
    databasePath: join(directory, 'life.sqlite'),
    key: Buffer.alloc(32, 39), serverDigest: 'b'.repeat(64), initialize: true
  });
  store.initializeGeminiMediaStorage();
  t.after(() => {store.close(); rmSync(directory, {recursive: true, force: true});});
  let providerPosts = 0;
  const client = {
    async createInteraction() {providerPosts++; throw Error('NETWORK_MUST_NEVER_BE_CALLED');},
    async getInteraction() {throw Error('NETWORK_MUST_NEVER_BE_CALLED');},
    async downloadVideo() {throw Error('NETWORK_MUST_NEVER_BE_CALLED');}
  };
  const service = createGeminiMediaService({
    store, ownerDigest: 'a'.repeat(64), clock: () => NOW,
    config: readGeminiConfiguration({...base, ...overrides}), client
  });
  return {service, get providerPosts() {return providerPosts;}};
}

test('prepaid balance or visible promotional credit is never sufficient proof to dispatch an API request', async t => {
  const cases = [
    ['marker_missing', {JH_GEMINI_CREDIT_VERIFIED: ''}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['approval_reference_missing', {JH_GEMINI_CREDIT_APPROVAL_REF: ''}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['approval_expiry_missing', {JH_GEMINI_CREDIT_VALID_UNTIL: ''}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['approval_expiry_invalid', {JH_GEMINI_CREDIT_VALID_UNTIL: 'not-a-date'}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['zero_verified_allowance', {JH_GEMINI_VERIFIED_CREDIT_USD: '0'}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['expired_approval', {JH_GEMINI_CREDIT_VALID_UNTIL: '2026-11-26T00:00:00Z'}, 'BLOCKED_CREDIT_VERIFICATION'],
    ['api_key_missing', {GEMINI_API_KEY: ''}, 'BLOCKED_AUTH'],
    ['feature_disabled', {JH_GEMINI_ANALYSIS_ENABLED: '0'}, 'GEMINI_FEATURE_DISABLED']
  ];
  for (const [id, overrides, expectedBlock] of cases) {
    await t.test(id, async t => {
      const f = localOnly(t, overrides);
      const request = analysis(id), preview = f.service.preview(request);
      assert.equal(preview.paidRequestSent, false);
      assert.equal(preview.blockedBy, expectedBlock);
      assert.equal(preview.readyToSubmit, false);
      const result = f.service.submit(request, preview.quoteId);
      assert.equal(result.code, expectedBlock);
      assert.equal(f.providerPosts, 0);
      const budget = f.service.status();
      assert.equal(budget.accountedApiCostUsd, 0);
      assert.equal(budget.heldApiCostUsd, 0);
      assert.equal(budget.hardBillingCapGuaranteed, false);
      assert.equal(budget.providerCreditBalanceUsd, null);
      assert.equal(budget.additionalCashChargeUsd, null);
    });
  }
});

test('even operator-verified local credit configuration is NOT a Google credit or hard-cap readback', t => {
  const f = localOnly(t, {});
  const status = f.service.status();
  assert.equal(status.creditStatus, 'OPERATOR_VERIFIED_CONFIGURATION');
  assert.equal(status.hardBillingCapGuaranteed, false);
  assert.equal(status.providerCreditBalanceUsd, null);
  assert.equal(status.additionalCashChargeUsd, null);
  assert.equal(status.extraCreditPurchaseEnabled, false);
  assert.equal(f.providerPosts, 0);
});

test('invalid local budget settings fail closed before constructing or contacting a provider', () => {
  for (const settings of [
    {JH_GEMINI_MONTHLY_LIMIT_USD: '10.000001'},
    {JH_GEMINI_REQUEST_LIMIT_USD: '10.000001'},
    {JH_GEMINI_VERIFIED_CREDIT_USD: '10.000001'},
    {JH_GEMINI_REQUEST_LIMIT_USD: '-1'},
    {JH_GEMINI_MONTHLY_LIMIT_USD: 'NaN'}
  ]) {
    assert.throws(() => readGeminiConfiguration({...base, ...settings}),
      error => error?.code === 'GEMINI_BUDGET_INVALID');
  }
});
