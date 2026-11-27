import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {GeminiLifeCheckpointStore as LifeCheckpointStore} from './gemini-storage.mjs';
import {createGeminiMediaService, readGeminiConfiguration} from './gemini-service.mjs';
import {MEDIA_MODELS} from './gemini-policy.mjs';

const OWNER = 'a'.repeat(64);
const NOW = Date.parse('2026-11-27T03:00:00Z');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypmp42'), Buffer.alloc(16)]);
const env = overrides => ({JH_GEMINI_ANALYSIS_ENABLED: '1', JH_GEMINI_GENERATION_ENABLED: '1',
  GEMINI_API_KEY: 'test-only-never-a-real-key', JH_GEMINI_CREDIT_VERIFIED: 'CLOUD_CREDIT_ONLY_V1',
  JH_GEMINI_CREDIT_APPROVAL_REF: 'verified_test_allowance', JH_GEMINI_CREDIT_VALID_UNTIL: '2026-12-20T00:00:00Z',
  JH_GEMINI_VERIFIED_CREDIT_USD: '10', ...overrides});
const analysis = (overrides = {}) => ({kind: 'analysis', requestId: 'request_1', taskRef: 'task_1',
  userRequest: '이 영상 분석해줘', prompt: '요청한 영상 구간의 내용을 근거와 함께 요약해줘.',
  sourceUrl: 'https://youtu.be/abcdefghijk', ...overrides});
const generation = (overrides = {}) => ({kind: 'generation', requestId: 'request_1', taskRef: 'task_1',
  userRequest: '바다가 보이는 8초 영상 만들어줘', prompt: '잔잔한 바다 위로 떠오르는 해.', ...overrides});
const usage = kind => ({total_input_tokens: 1000, total_cached_tokens: 0,
  total_output_tokens: kind === 'generation' ? 10100 : 100, total_thought_tokens: 50,
  total_tool_use_tokens: 0, total_tokens: kind === 'generation' ? 11150 : 1150,
  output_tokens_by_modality: kind === 'generation' ? [{modality: 'video', tokens: 10000}, {modality: 'text', tokens: 100}]
    : [{modality: 'text', tokens: 100}]});
const reply = (kind, overrides = {}) => ({ok: true, code: 'COMPLETED', state: 'completed',
  model: MEDIA_MODELS[kind], interactionId: 'interaction_test_1', dispatched: true, billingStatus: 'usage_reported',
  usage: usage(kind), text: kind === 'analysis' ? '요청한 구간에 대한 모의 분석입니다.' : '',
  videos: kind === 'generation' ? [{data: MP4.toString('base64'), mimeType: 'video/mp4'}] : [], ...overrides});
const coded = code => error => error?.code === code;
const nextTick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, {configuration = {}, manualSchedule = false} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'jh-gemini-service-'));
  const options = {databasePath: join(directory, 'life.sqlite'), key: Buffer.alloc(32, 39), serverDigest: 'b'.repeat(64)};
  let store = new LifeCheckpointStore({...options, initialize: true});
  store.initializeGeminiMediaStorage();
  let now = NOW, config = readGeminiConfiguration(env(configuration)), service;
  const queue = [], counts = {post: 0, get: 0, download: 0};
  const behavior = {post: body => reply(body.model === MEDIA_MODELS.analysis ? 'analysis' : 'generation'),
    get: () => reply('analysis'), download: () => ({ok: true, bytes: MP4, mimeType: 'video/mp4'})};
  const client = {
    async createInteraction(body) {counts.post++; return behavior.post(body);},
    async getInteraction(id) {counts.get++; return behavior.get(id);},
    async downloadVideo(asset) {counts.download++; return behavior.download(asset);}
  };
  const make = () => createGeminiMediaService({store, ownerDigest: OWNER, config, client, clock: () => now,
    ...(manualSchedule ? {schedule: callback => queue.push(callback)} : {})});
  service = make();
  t.after(() => {store.close(); rmSync(directory, {recursive: true, force: true});});
  return {behavior, counts, get service() {return service;}, get store() {return store;},
    setNow(value) {now = value;},
    restart(overrides) {
      queue.length = 0; store.close(); store = new LifeCheckpointStore(options);
      if (overrides) config = readGeminiConfiguration(env({...configuration, ...overrides}));
      service = make(); return service;
    },
    async runQueued() {for (const callback of queue.splice(0)) callback(); await service.drain();},
    async execute(input) {const preview = service.preview(input); const accepted = service.submit(input, preview.quoteId);
      if (manualSchedule) await this.runQueued(); else await service.drain();
      return {preview, accepted, result: service.get(preview.requestId)};}
  };
}

test('defaults do not enable either feature; a key without verified allowance cannot submit', async t => {
  const defaults = readGeminiConfiguration({});
  assert.equal(defaults.analysisEnabled, false); assert.equal(defaults.generationEnabled, false);
  const f = fixture(t, {configuration: {JH_GEMINI_CREDIT_VERIFIED: ''}});
  const {accepted} = await f.execute(analysis());
  assert.equal(accepted.code, 'BLOCKED_CREDIT_VERIFICATION'); assert.equal(f.counts.post, 0);
  assert.equal(f.service.status().providerCreditBalanceUsd, null);
  assert.equal(f.service.status().hardBillingCapGuaranteed, false);
});

test('feature switches are independent and disabling a route cannot spend', async t => {
  const f = fixture(t, {configuration: {JH_GEMINI_GENERATION_ENABLED: '0'}});
  assert.equal((await f.execute(generation())).accepted.code, 'GEMINI_FEATURE_DISABLED');
  assert.equal(f.counts.post, 0);
  const a = analysis({requestId: 'analysis_2', taskRef: 'analysis_task_2'});
  assert.equal((await f.execute(a)).result.state, 'RESULT_AVAILABLE');
  assert.equal(f.counts.post, 1);
});

test('preview is local; development consent and altered quotes never dispatch', async t => {
  const f = fixture(t);
  const development = analysis({userRequest: '영상 분석 기능 개발 시작'});
  const p = f.service.preview(development);
  assert.equal(p.paidRequestSent, false); assert.equal(f.counts.post, 0);
  assert.throws(() => f.service.submit(development, p.quoteId), coded('GEMINI_EXPLICIT_EXECUTION_REQUEST_REQUIRED'));
  assert.throws(() => f.service.preview(generation({userRequest: '영비서 편비서 기능 제작 시작'})), coded('EXPLICIT_VIDEO_REQUEST_REQUIRED'));
  const input = analysis({requestId: 'r2', taskRef: 't2'}), quote = f.service.preview(input);
  assert.throws(() => f.service.submit(input, 'wrong-quote'), coded('GEMINI_QUOTE_MISMATCH'));
  assert.throws(() => f.service.submit({...input, sourceUrl: 'https://youtu.be/otherabcdef'}, quote.quoteId), coded('GEMINI_TASK_INPUT_CONFLICT'));
  f.setNow(NOW + 15 * 60_000);
  assert.throws(() => f.service.submit(input, quote.quoteId), coded('GEMINI_QUOTE_EXPIRED'));
  assert.equal(f.counts.post, 0);
  const renewed = f.service.preview({...input, requestId: 'another_room_request'});
  assert.equal(renewed.requestId, input.requestId); assert.notEqual(renewed.quoteId, quote.quoteId);
  assert.equal(renewed.readyToSubmit, true);
  assert.throws(() => f.service.submit(input, quote.quoteId), coded('GEMINI_QUOTE_MISMATCH'));
  f.service.submit(input, renewed.quoteId); await f.service.drain();
  assert.equal(f.counts.post, 1);
});

test('double-click and another room reusing taskRef dispatch once, including after restart', async t => {
  const f = fixture(t, {manualSchedule: true}), input = analysis(), quote = f.service.preview(input);
  assert.equal(f.service.submit(input, quote.quoteId).duplicate, false);
  assert.equal(f.service.submit(input, quote.quoteId).duplicate, true);
  const fromAnotherRoom = {...input, requestId: 'another_room_request'};
  const oldQuote = f.service.preview(fromAnotherRoom);
  assert.equal(oldQuote.requestId, input.requestId);
  assert.equal(f.service.submit(fromAnotherRoom, oldQuote.quoteId).duplicate, true);
  await f.runQueued(); assert.equal(f.counts.post, 1);
  assert.equal(f.service.status().heldApiCostUsd, 0);
  assert.equal(f.service.get(input.requestId).actualApiCostUsd, 0.000675);
  f.restart(); assert.equal(f.service.submit(fromAnotherRoom, quote.quoteId).duplicate, true);
  assert.equal(f.counts.post, 1);
});

test('cancel before dispatch releases its reservation and cannot be resumed by resubmission', async t => {
  const f = fixture(t, {manualSchedule: true}), input = generation(), quote = f.service.preview(input);
  f.service.submit(input, quote.quoteId);
  assert.ok(f.service.status().heldApiCostUsd > 0);
  assert.equal(f.service.cancel(input.requestId).state, 'CANCELLED');
  await f.runQueued();
  assert.equal(f.counts.post, 0); assert.equal(f.service.status().heldApiCostUsd, 0);
  assert.equal(f.service.submit(input, quote.quoteId).state, 'CANCELLED');
});

test('unknown submission blocks new spending, preserves reserve across restart and month rollover', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {ok: false, state: 'unknown', model: null,
    usage: null, billingStatus: 'unknown', code: 'UNKNOWN_SUBMISSION'});
  const first = await f.execute(analysis());
  assert.equal(first.result.state, 'UNKNOWN');
  const held = f.service.status().heldApiCostUsd;
  assert.ok(held > 0); assert.equal(f.service.status().unresolvedRequests, 1);
  f.setNow(Date.parse('2026-12-01T00:00:00Z')); f.restart({JH_GEMINI_CREDIT_APPROVAL_REF: 'new_month_allowance'});
  assert.equal(f.service.status().heldApiCostUsd, held);
  const next = await f.execute(analysis({requestId: 'next', taskRef: 'next_task'}));
  assert.equal(next.accepted.code, 'BLOCKED_UNRECONCILED_USAGE');
  assert.equal(f.counts.post, 1);
});

test('restart quarantines an abandoned queued request before any new request is admitted', t => {
  const f = fixture(t, {manualSchedule: true}), input = analysis(), quote = f.service.preview(input);
  f.service.submit(input, quote.quoteId); f.restart();
  assert.equal(f.service.status().unresolvedRequests, 1);
  assert.equal(f.service.get(input.requestId).state, 'UNKNOWN');
  assert.equal(f.service.get(input.requestId).code, 'RESTART_REQUIRES_RECONCILIATION');
  assert.equal(f.counts.post, 0);
  assert.equal(f.service.preview(analysis({requestId: 'next', taskRef: 'next_task'})).blockedBy, 'BLOCKED_UNRECONCILED_USAGE');
});

test('partial usage from pending state and wrong model cannot release the reserve', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {state: 'in_progress'});
  const first = await f.execute(analysis());
  assert.equal(first.result.actualApiCostUsd, null);
  assert.equal(first.result.code, 'PROVIDER_CONTINUATION_NOT_AUTHORIZED');
  assert.ok(f.service.status().heldApiCostUsd > 0);
  f.behavior.get = () => reply('analysis', {model: MEDIA_MODELS.generation});
  const wrong = await f.service.refresh('request_1');
  assert.equal(wrong.code, 'PROVIDER_MODEL_NOT_VERIFIED');
  assert.equal(wrong.actualApiCostUsd, null); assert.equal(f.counts.post, 1);
});

test('result with missing usage can reconcile via the same GET without losing or downloading the result again', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('generation', {usage: null, billingStatus: 'unknown'});
  const {result} = await f.execute(generation());
  assert.equal(result.state, 'RESULT_AVAILABLE'); assert.equal(result.billingStatus, 'UNKNOWN');
  assert.ok(f.service.status().heldApiCostUsd > 0);
  const sha256 = result.output.sha256;
  f.behavior.get = id => {assert.equal(id, 'interaction_test_1'); return reply('generation', {videos: []});};
  f.behavior.download = () => {throw Error('A reconciled result must not be downloaded again');};
  const reconciled = await f.service.refresh('request_1');
  assert.equal(reconciled.state, 'RESULT_AVAILABLE'); assert.equal(reconciled.output.sha256, sha256);
  assert.equal(reconciled.actualApiCostUsd, 0.12285);
  assert.equal(f.service.status().unresolvedRequests, 0); assert.equal(f.service.status().heldApiCostUsd, 0);
  assert.deepEqual(f.counts, {post: 1, get: 1, download: 1});
  assert.deepEqual(f.service.output('request_1').asset.bytes, MP4);
});

test('a failed refresh never changes the paid job or starts a replacement', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {ok: false, state: 'unknown', usage: null, billingStatus: 'unknown'});
  await f.execute(analysis());
  const before = f.store.readGeminiMedia(OWNER, 'request_1');
  f.behavior.get = () => ({ok: false, code: 'PROVIDER_UNAVAILABLE'});
  assert.equal((await f.service.refresh('request_1')).refreshCode, 'PROVIDER_UNAVAILABLE');
  assert.deepEqual(f.store.readGeminiMedia(OWNER, 'request_1'), before);
  assert.equal(f.counts.post, 1);
});

test('verified terminal failure from GET settles reported usage without claiming successful output', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {ok: false, state: 'unknown', usage: null, billingStatus: 'unknown'});
  await f.execute(analysis());
  f.behavior.get = () => reply('analysis', {ok: false, state: 'failed', code: 'PROVIDER_FAILED', text: ''});
  const result = await f.service.refresh('request_1');
  assert.equal(result.state, 'FAILED'); assert.equal(result.actualApiCostUsd, 0.000675);
  assert.equal(result.completedAt, NOW); assert.equal(result.text, null);
  assert.equal(f.service.status().unresolvedRequests, 0); assert.equal(f.service.status().heldApiCostUsd, 0);
  assert.equal(f.counts.post, 1); assert.equal(f.counts.get, 1);
});

test('concurrent refresh shares one GET and shutdown waits for reconciliation before storage can close', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {usage: null, billingStatus: 'unknown'});
  await f.execute(analysis());
  let release;
  f.behavior.get = () => new Promise(resolve => {release = resolve;});
  const first = f.service.refresh('request_1'), second = f.service.refresh('request_1');
  await nextTick(); assert.equal(f.counts.get, 1);
  let closed = false;
  const closing = f.service.close().then(() => {closed = true;});
  await nextTick(); assert.equal(closed, false);
  assert.equal((await f.service.refresh('request_1')).refreshCode, 'GEMINI_SERVICE_CLOSING');
  release(reply('analysis'));
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one.actualApiCostUsd, 0.000675); assert.deepEqual(one, two);
  await closing; assert.equal(closed, true);
  assert.equal(f.store.readGeminiMediaBudget(OWNER).unresolved, 0);
  assert.equal(f.counts.get, 1); assert.equal(f.counts.post, 1);
});

test('download failure records reported usage and cannot claim a completed video or regenerate', async t => {
  const f = fixture(t);
  f.behavior.download = () => ({ok: false, code: 'VIDEO_DOWNLOAD_FAILED'});
  const {result, preview} = await f.execute(generation());
  assert.equal(result.state, 'RESULT_UNAVAILABLE'); assert.equal(result.actualApiCostUsd, 0.12285);
  assert.equal(f.service.status().heldApiCostUsd, 0);
  assert.equal(f.service.submit(generation(), preview.quoteId).duplicate, true);
  assert.throws(() => f.service.output('request_1'), coded('GEMINI_OUTPUT_NOT_AVAILABLE'));
  assert.equal(f.counts.post, 1);
});

test('provider identity and settled cost survive a crash during output retrieval', async t => {
  const f = fixture(t);
  f.behavior.download = () => new Promise(() => {}); // Simulate process loss, not an automatic retry.
  const input = generation(), quote = f.service.preview(input);
  f.service.submit(input, quote.quoteId); await nextTick();
  const before = f.store.readGeminiMedia(OWNER, input.requestId).job;
  assert.equal(before.state, 'RESULT_PENDING_DOWNLOAD'); assert.equal(before.interactionId, 'interaction_test_1');
  assert.equal(before.actualMicros, 122850); assert.equal(before.reservationOpen, false);
  f.restart();
  assert.equal(f.service.get(input.requestId).state, 'RESULT_UNAVAILABLE');
  assert.equal(f.service.status().unresolvedRequests, 0); assert.equal(f.counts.post, 1);
});

test('an encrypted video already written before a crash is recovered without provider access', async t => {
  const f = fixture(t);
  f.behavior.download = () => new Promise(() => {});
  const input = generation(), quote = f.service.preview(input);
  f.service.submit(input, quote.quoteId); await nextTick();
  f.store.putGeminiMediaOutput(OWNER, input.requestId,
    {mimeType: 'video/mp4', bytes: MP4, sha256: createHash('sha256').update(MP4).digest('hex')});
  f.restart();
  assert.equal(f.service.get(input.requestId).state, 'RESULT_AVAILABLE');
  assert.equal(f.service.get(input.requestId).code, 'STORED_RESULT_RECOVERED');
  assert.deepEqual(f.service.output(input.requestId).asset.bytes, MP4);
  assert.equal(f.counts.post, 1); assert.equal(f.counts.get, 0);
});

test('prototype-like request and allowance IDs cannot bypass accounting', async t => {
  const f = fixture(t, {configuration: {JH_GEMINI_CREDIT_APPROVAL_REF: '__proto__'}, manualSchedule: true});
  const input = analysis({requestId: '__proto__', taskRef: 'constructor'}), quote = f.service.preview(input);
  f.service.submit(input, quote.quoteId);
  const reserved = f.store.readGeminiMediaBudget(OWNER);
  assert.equal(Object.hasOwn(reserved.activeRequests, '__proto__'), true);
  assert.equal(Object.hasOwn(reserved.authorizations, '__proto__'), true);
  assert.ok(reserved.authorizations.__proto__.heldMicros > 0);
  await f.runQueued();
  assert.equal(f.service.get('__proto__').actualApiCostUsd, 0.000675);
  assert.equal(f.service.status().accountedApiCostUsd, 0.000675);
  assert.equal(Object.prototype.heldMicros, undefined);
});

test('corrupt persisted bucket amounts fail closed instead of resetting the budget', t => {
  const f = fixture(t), input = analysis(); f.service.preview(input);
  f.store.transactGeminiMedia(OWNER, input.requestId, ({job, budget}) => ({job,
    budget: {...budget, periods: {'2026-11': {spentMicros: -1}}}, result: null}));
  assert.throws(() => f.service.status(), coded('GEMINI_BUDGET_CORRUPT'));
  assert.throws(() => f.service.submit(input, f.service.get(input.requestId).quoteId), coded('GEMINI_BUDGET_CORRUPT'));
  assert.equal(f.counts.post, 0);
});

test('per-request, monthly and verified-credit limits block before reservation or dispatch', async t => {
  for (const [configuration, code] of [
    [{JH_GEMINI_REQUEST_LIMIT_USD: '0.000001'}, 'BLOCKED_REQUEST_COST'],
    [{JH_GEMINI_MONTHLY_LIMIT_USD: '0.000001'}, 'BLOCKED_MONTHLY_BUDGET'],
    [{JH_GEMINI_VERIFIED_CREDIT_USD: '0.000001'}, 'BLOCKED_CREDIT_ALLOWANCE'],
    [{JH_GEMINI_CREDIT_VALID_UNTIL: '2026-11-26T00:00:00Z'}, 'BLOCKED_CREDIT_VERIFICATION']
  ]) {
    await t.test(code, async t => {
      const f = fixture(t, {configuration}); const {accepted} = await f.execute(generation());
      assert.equal(accepted.code, code); assert.equal(f.counts.post, 0); assert.equal(f.service.status().heldApiCostUsd, 0);
    });
  }
});

test('price review expiry blocks submission while existing results remain readable', async t => {
  const f = fixture(t, {configuration: {JH_GEMINI_CREDIT_VALID_UNTIL: '2027-01-01T00:00:00Z'}});
  await f.execute(analysis()); f.setNow(Date.parse('2026-12-28T00:00:00Z'));
  assert.equal(f.service.get('request_1').state, 'RESULT_AVAILABLE');
  const second = await f.execute(analysis({requestId: 'r2', taskRef: 't2'}));
  assert.equal(second.accepted.code, 'BLOCKED_PRICE_REVIEW_REQUIRED'); assert.equal(f.counts.post, 1);
});

test('a confirmed local rejection releases reserve; dispatched failures never imply zero billing', async t => {
  const f = fixture(t);
  f.behavior.post = () => ({ok: false, dispatched: false, state: 'not_dispatched', code: 'API_KEY_REQUIRED'});
  const result = (await f.execute(analysis())).result;
  assert.equal(result.state, 'BLOCKED'); assert.equal(result.billingStatus, 'NOT_SUBMITTED');
  assert.equal(f.service.status().heldApiCostUsd, 0); assert.equal(f.service.status().unresolvedRequests, 0);
  f.behavior.post = () => ({ok: false, dispatched: true, state: 'failed', code: 'PROVIDER_REJECTED'});
  const failure = (await f.execute(analysis({requestId: 'r2', taskRef: 't2'}))).result;
  assert.equal(failure.billingStatus, 'UNKNOWN'); assert.equal(failure.actualApiCostUsd, null);
  assert.ok(f.service.status().heldApiCostUsd > 0);
});

test('reported cost exceeding the estimate is accounted and blocks further calls, not presented as a hard cap', async t => {
  const f = fixture(t);
  f.behavior.post = () => reply('analysis', {usage: {total_input_tokens: 40_000_000,
    total_output_tokens: 0, total_thought_tokens: 0, total_tokens: 40_000_000}});
  assert.equal((await f.execute(analysis())).result.actualApiCostUsd, 12);
  assert.equal(f.service.status().accountedApiCostUsd, 12);
  assert.equal(f.service.status().remainingLocalBudgetUsd, 0);
  const blocked = await f.execute(analysis({requestId: 'r2', taskRef: 't2'}));
  assert.equal(blocked.accepted.code, 'BLOCKED_MONTHLY_BUDGET'); assert.equal(f.counts.post, 1);
});
