/** Gemini media orchestration inside the existing owner service.
 * Pure local previews; one paid POST per immutable request; no restart replay.
 * The existing encrypted life.sqlite holds metadata, reservations and outputs.
 * A local budget is NOT proof of a Google credit balance or a billing hard cap.
 */
import {createHash, randomUUID} from 'node:crypto';
import {normalizeMediaRequest, estimateMediaCost, calculateMediaActualCost, isExplicitMediaExecutionRequest} from './gemini-policy.mjs';
import {createGeminiClient} from './gemini-provider.mjs';

const MICROS = 1_000_000;
const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const QUOTE_MS = 15 * 60_000;
const PRICE_REVIEW_UNTIL = Date.parse('2026-12-27T14:59:59Z');
const pending = new Set(['QUEUED', 'SUBMITTING', 'SUBMITTED']);
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const error = code => { throw Object.assign(new Error(code), {code}); };
const codeOf = e => typeof e?.code === 'string' && /^[A-Za-z0-9_]{1,96}$/.test(e.code) ? e.code : 'GEMINI_OPERATION_FAILED';
const periodOf = now => new Date(now + 9 * 60 * 60_000).toISOString().slice(0, 7);
const money = micros => Number((micros / MICROS).toFixed(6));
const own = (map, key, fallback) => Object.hasOwn(map, key) ? map[key] : fallback;
const put = (map, key, value) => Object.defineProperty(map, key, {value, writable: true, enumerable: true, configurable: true});
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;

function usd(value, fallback, max) {
  if (value === undefined || value === '') return fallback;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) error('GEMINI_BUDGET_INVALID');
  const amount = Math.round(Number(value) * MICROS);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > max) error('GEMINI_BUDGET_INVALID');
  return amount;
}
function enabled(value) {
  if (value === undefined || value === '' || value === '0') return false;
  if (value !== '1') error('GEMINI_ENABLE_FLAG_INVALID');
  return true;
}

/** Operator configuration, never accepted as MCP arguments. No billing action. */
export function readGeminiConfiguration(env = process.env) {
  const reference = env.JH_GEMINI_CREDIT_APPROVAL_REF || '';
  const expiresAt = Date.parse(env.JH_GEMINI_CREDIT_VALID_UNTIL || '');
  return Object.freeze({
    analysisEnabled: enabled(env.JH_GEMINI_ANALYSIS_ENABLED),
    generationEnabled: enabled(env.JH_GEMINI_GENERATION_ENABLED),
    apiKey: typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '',
    monthlyLimitMicros: usd(env.JH_GEMINI_MONTHLY_LIMIT_USD, 10 * MICROS, 10 * MICROS),
    perRequestLimitMicros: usd(env.JH_GEMINI_REQUEST_LIMIT_USD, 2 * MICROS, 10 * MICROS),
    authorization: Object.freeze({
      verified: env.JH_GEMINI_CREDIT_VERIFIED === 'CLOUD_CREDIT_ONLY_V1' && ID.test(reference) && Number.isFinite(expiresAt),
      reference, expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      amountMicros: usd(env.JH_GEMINI_VERIFIED_CREDIT_USD, 0, 10 * MICROS)
    }),
    priceReviewUntil: PRICE_REVIEW_UNTIL
  });
}

function emptyBudget() { return {version: 1, periods: {}, authorizations: {}, heldMicros: 0, unresolved: 0, activeRequests: {}}; }
function inspectBudget(budget) {
  if (!budget) return emptyBudget();
  if (!plain(budget) || budget.version !== 1 || !plain(budget.periods) || !plain(budget.authorizations) ||
      !nonnegative(budget.heldMicros) || !nonnegative(budget.unresolved) || !plain(budget.activeRequests)) error('GEMINI_BUDGET_CORRUPT');
  let held = 0, spent = 0, monthlySpent = 0;
  for (const [period, value] of Object.entries(budget.periods)) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period) || !plain(value) || !nonnegative(value.spentMicros)) error('GEMINI_BUDGET_CORRUPT');
    monthlySpent += value.spentMicros;
  }
  for (const [reference, value] of Object.entries(budget.authorizations)) {
    if (!ID.test(reference) || !plain(value) || !nonnegative(value.spentMicros) || !nonnegative(value.heldMicros)) error('GEMINI_BUDGET_CORRUPT');
    held += value.heldMicros; spent += value.spentMicros;
  }
  if (![held, spent, monthlySpent].every(nonnegative) || held !== budget.heldMicros || spent !== monthlySpent ||
      Object.entries(budget.activeRequests).some(([id, value]) => !ID.test(id) || value !== true)) error('GEMINI_BUDGET_CORRUPT');
  return clone(budget);
}
function bucket(budget, period, reference) {
  if (Object.keys(budget.periods).length > 120 || Object.keys(budget.authorizations).length > 120) error('GEMINI_BUDGET_HISTORY_LIMIT');
  if (!Object.hasOwn(budget.periods, period)) put(budget.periods, period, {spentMicros: 0});
  if (!Object.hasOwn(budget.authorizations, reference)) put(budget.authorizations, reference, {spentMicros: 0, heldMicros: 0});
  return {month: budget.periods[period], credit: budget.authorizations[reference]};
}
function bodyDigest(request) {
  // The normalized provider body contains the actual source/photo/prompt.
  return hash(JSON.stringify({kind: request.kind, taskRef: request.taskRef, actor: request.actor,
    userRequest: request.userRequest, body: request.body}));
}
function descriptor(request) {
  return request.kind === 'analysis' ? {source: request.source} : {
    durationSeconds: request.durationSeconds, resolution: request.resolution,
    aspectRatio: request.aspectRatio, count: 1,
    inputAssetRef: request.image?.assetRef || null,
    inputAssetDigest: request.image?.data ? hash(Buffer.from(request.image.data, 'base64')) : null
  };
}
function publicJob(job) {
  if (!job) return {ok: false, code: 'GEMINI_REQUEST_NOT_FOUND'};
  return {
    ok: true, requestId: job.requestId, taskRef: job.taskRef, actor: job.actor,
    kind: job.kind, state: job.state, quoteId: job.quoteId, quoteExpiresAt: job.quoteExpiresAt,
    source: job.source || null, model: job.model, durationSeconds: job.durationSeconds || null,
    resolution: job.resolution || job.source?.resolution || null, aspectRatio: job.aspectRatio || null,
    inputAssetRef: job.inputAssetRef || null, inputAssetDigest: job.inputAssetDigest || null,
    estimatedApiCostUsd: money(job.estimatedMicros), reservedApiCostUsd: money(job.reserveMicros),
    actualApiCostUsd: job.actualMicros === null ? null : money(job.actualMicros),
    billingStatus: job.billingStatus, appliedGoogleCreditUsd: null, additionalCashChargeUsd: null,
    creditApplication: 'NOT_VERIFIED_BY_THIS_API', providerInteractionId: job.interactionId,
    text: job.text || null, analysisMode: job.kind === 'analysis' ? 'MODEL_RESULT_UNVERIFIED' : null,
    output: job.output || null, verification: job.verification || 'NOT_RUN',
    code: job.code, cancelRequested: job.cancelRequested, automaticReplay: false,
    submittedAt: job.submittedAt, completedAt: job.completedAt
  };
}

export function createGeminiMediaService({store, ownerDigest, config, client, clock = Date.now, schedule = setImmediate} = {}) {
  if (!store || typeof store.transactGeminiMedia !== 'function' || !/^[a-f0-9]{64}$/.test(ownerDigest || '') ||
      typeof clock !== 'function' || typeof schedule !== 'function' || !config) error('GEMINI_SERVICE_CONFIGURATION_INVALID');
  store.assertGeminiMediaReady();
  const provider = client || createGeminiClient({apiKey: config.apiKey, timeoutMs: 180_000});
  const running = new Map();
  const refreshing = new Map();
  let closing = false;

  function normalizedInput(input) {
    const request = clone(normalizeMediaRequest(input));
    const previous = store.findGeminiMediaJob(ownerDigest, request.taskRef, request.kind);
    if (previous) {
      if (previous.bodyDigest !== bodyDigest(request)) error('GEMINI_TASK_INPUT_CONFLICT');
      request.requestId = previous.requestId;
    }
    return request;
  }

  function gate(kind, budget, reserveMicros = 0, now = clock()) {
    if (closing) return 'GEMINI_SERVICE_CLOSING';
    if (!(kind === 'analysis' ? config.analysisEnabled : config.generationEnabled)) return 'GEMINI_FEATURE_DISABLED';
    if (typeof config.apiKey !== 'string' || config.apiKey.trim().length < 12) return 'BLOCKED_AUTH';
    if (!config.authorization.verified || now >= config.authorization.expiresAt || config.authorization.amountMicros <= 0) return 'BLOCKED_CREDIT_VERIFICATION';
    if (now > config.priceReviewUntil) return 'BLOCKED_PRICE_REVIEW_REQUIRED';
    if (budget.unresolved > 0) return 'BLOCKED_UNRECONCILED_USAGE';
    if (reserveMicros > config.perRequestLimitMicros) return 'BLOCKED_REQUEST_COST';
    const month = own(budget.periods, periodOf(now), {spentMicros: 0});
    const credit = own(budget.authorizations, config.authorization.reference, {spentMicros: 0, heldMicros: 0});
    if (month.spentMicros + budget.heldMicros + reserveMicros > config.monthlyLimitMicros) return 'BLOCKED_MONTHLY_BUDGET';
    if (credit.spentMicros + budget.heldMicros + reserveMicros > config.authorization.amountMicros) return 'BLOCKED_CREDIT_ALLOWANCE';
    return null;
  }
  function status() {
    const budget = inspectBudget(store.readGeminiMediaBudget(ownerDigest));
    const month = own(budget.periods, periodOf(clock()), {spentMicros: 0});
    return {ok: true, features: {analysis: {enabled: config.analysisEnabled, blockedBy: gate('analysis', budget)},
      generation: {enabled: config.generationEnabled, blockedBy: gate('generation', budget)}},
      period: periodOf(clock()), monthlyLimitUsd: money(config.monthlyLimitMicros),
      accountedApiCostUsd: money(month.spentMicros), heldApiCostUsd: money(budget.heldMicros),
      unresolvedRequests: budget.unresolved, remainingLocalBudgetUsd: money(Math.max(0, config.monthlyLimitMicros - month.spentMicros - budget.heldMicros)),
      creditStatus: config.authorization.verified ? 'OPERATOR_VERIFIED_CONFIGURATION' : 'UNVERIFIED',
      providerCreditBalanceUsd: null, additionalCashChargeUsd: null,
      hardBillingCapGuaranteed: false, extraCreditPurchaseEnabled: false, automaticReplay: false};
  }
  function preview(input) {
    const request = normalizedInput(input), cost = estimateMediaCost(request), now = clock();
    if (!Number.isSafeInteger(cost.reserveMicros) || cost.reserveMicros < 1 || !Number.isSafeInteger(cost.estimatedMicros)) error('GEMINI_COST_ESTIMATE_INVALID');
    const digest = bodyDigest(request);
    return store.transactGeminiMedia(ownerDigest, request.requestId, ({job, budget: saved}) => {
      const budget = inspectBudget(saved);
      if (job) {
        if (job.bodyDigest !== digest) error('GEMINI_REQUEST_ID_CONFLICT');
        // Only an unsubmitted plan can receive a new quote. Reusing its task ID
        // must remain possible after expiry without creating a replacement job.
        if (job.state === 'PLANNED' && (now >= job.quoteExpiresAt || job.priceVersion !== cost.priceVersion)) {
          job.quoteId = randomUUID(); job.quoteExpiresAt = now + QUOTE_MS;
          job.estimatedMicros = cost.estimatedMicros; job.reserveMicros = cost.reserveMicros;
          job.priceVersion = cost.priceVersion;
        }
        const blockedBy = gate(request.kind, budget, job.reserveMicros, now);
        return {job, budget, result: {...publicJob(job), blockedBy,
          readyToSubmit: job.state === 'PLANNED' && blockedBy === null, paidRequestSent: false,
          priceVersion: job.priceVersion, hardBillingCapGuaranteed: false}};
      }
      job = {version: 1, requestId: request.requestId, taskRef: request.taskRef, actor: request.actor,
        kind: request.kind, bodyDigest: digest, quoteId: randomUUID(), quoteExpiresAt: now + QUOTE_MS,
        state: 'PLANNED', model: request.model, ...descriptor(request),
        estimatedMicros: cost.estimatedMicros, reserveMicros: cost.reserveMicros,
        priceVersion: cost.priceVersion, actualMicros: null, billingStatus: 'NOT_SUBMITTED',
        reservationPeriod: null, authorizationRef: null, reservationOpen: false, unresolved: false,
        interactionId: null, output: null, text: null, code: 'PREVIEW_ONLY', verification: 'NOT_RUN',
        cancelRequested: false, submittedAt: null, completedAt: null};
      const blockedBy = gate(request.kind, budget, cost.reserveMicros, now);
      return {job, budget, result: {...publicJob(job), blockedBy, readyToSubmit: blockedBy === null,
        priceVersion: cost.priceVersion, paidRequestSent: false, hardBillingCapGuaranteed: false,
        instruction: 'Present the source or input photo, requested segment or video settings, and estimated API cost. Submit only the current explicit media request using this quote and identical input. Development consent is not media-generation consent.'}};
    });
  }
  function releaseReservation(job, budget, actualMicros = null) {
    if (!job.reservationOpen) return;
    const {month, credit} = bucket(budget, job.reservationPeriod, job.authorizationRef);
    budget.heldMicros -= job.reserveMicros; credit.heldMicros -= job.reserveMicros;
    if (budget.heldMicros < 0 || credit.heldMicros < 0) error('GEMINI_RESERVATION_CORRUPT');
    if (actualMicros !== null) {month.spentMicros += actualMicros; credit.spentMicros += actualMicros;}
    job.reservationOpen = false;
    if (job.unresolved) {budget.unresolved--; job.unresolved = false;}
  }
  function markUnknown(job, budget) {
    if (!job.unresolved) {job.unresolved = true; budget.unresolved++;}
    job.billingStatus = 'UNKNOWN';
  }
  function update(requestId, apply) {
    return store.transactGeminiMedia(ownerDigest, requestId, ({job, budget: saved}) => {
      if (!job) error('GEMINI_REQUEST_NOT_FOUND');
      const budget = inspectBudget(saved); apply(job, budget);
      inspectBudget(budget);
      return {job, budget, result: publicJob(job)};
    });
  }
  async function recordReply(request, reply) {
    if (reply.dispatched === false && reply.state === 'not_dispatched') {
      return update(request.requestId, (job, budget) => {
        releaseReservation(job, budget); job.state = 'BLOCKED'; job.code = reply.code;
        delete budget.activeRequests[job.requestId];
        job.billingStatus = 'NOT_SUBMITTED'; job.completedAt = clock();
      });
    }
    if (reply.model !== request.model) {
      return update(request.requestId, (job, budget) => {
        if (job.state !== 'RESULT_AVAILABLE') job.state = 'UNKNOWN';
        job.code = reply.code === 'UNKNOWN_SUBMISSION' ? reply.code : 'PROVIDER_MODEL_NOT_VERIFIED';
        job.interactionId = reply.interactionId || job.interactionId;
        delete budget.activeRequests[job.requestId]; markUnknown(job, budget);
      });
    }
    // Persist provider identity and final usage BEFORE downloading any output.
    // A crash during retrieval must not lose the receipt of a paid generation.
    const receipt = update(request.requestId, (job, budget) => {
      job.interactionId = reply.interactionId || job.interactionId;
      job.code = reply.code || 'PROVIDER_RESULT';
      const finalUsage = ['completed', 'failed', 'cancelled'].includes(reply.state) && reply.billingStatus === 'usage_reported';
      // Saved descriptors intentionally omit the source image/prompt. Only the
      // immutable model/kind are needed to price an existing interaction's usage.
      const actual = finalUsage ? calculateMediaActualCost({...request, body: {model: request.model}}, reply.usage) : {actualMicros: null};
      if (actual.actualMicros !== null && job.actualMicros === null) {
        if (!Number.isSafeInteger(actual.actualMicros) || actual.actualMicros < 0) error('GEMINI_ACTUAL_COST_INVALID');
        job.actualMicros = actual.actualMicros;
        releaseReservation(job, budget, actual.actualMicros);
        job.billingStatus = 'USAGE_REPORTED_NOT_INVOICE';
      } else if (actual.actualMicros !== null && actual.actualMicros !== job.actualMicros) {
        markUnknown(job, budget); job.code = 'PROVIDER_USAGE_CONFLICT_REQUIRES_REVIEW';
      } else if (job.actualMicros === null) markUnknown(job, budget);
      // Refresh can reconcile unknown usage without losing an obtained result.
      if (job.state === 'RESULT_AVAILABLE') return;
      job.state = reply.state === 'completed' ? 'RESULT_PENDING_DOWNLOAD' : reply.state === 'unknown' ? 'UNKNOWN' : 'FAILED';
      if (['in_progress', 'requires_action', 'requires_continuation'].includes(reply.state)) {
        job.state = 'UNKNOWN'; job.code = 'PROVIDER_CONTINUATION_NOT_AUTHORIZED';
      }
      if (job.state !== 'RESULT_PENDING_DOWNLOAD') delete budget.activeRequests[job.requestId];
      if (['failed', 'cancelled'].includes(reply.state)) job.completedAt = clock();
    });
    if (reply.state !== 'completed' || receipt.state === 'RESULT_AVAILABLE') return receipt;
    let downloaded = null;
    if (reply.state === 'completed' && request.kind === 'generation' && reply.videos?.length === 1) {
      try {
        const bytes = await provider.downloadVideo(reply.videos[0]);
        if (bytes.ok && bytes.mimeType === 'video/mp4' && bytes.bytes) {
          downloaded = store.putGeminiMediaOutput(ownerDigest, request.requestId,
            {mimeType: 'video/mp4', bytes: Buffer.from(bytes.bytes), sha256: hash(bytes.bytes)});
        }
      } catch { /* The single provider job remains recorded; never generate again. */ }
    }
    return update(request.requestId, (job, budget) => {
      if (job.state === 'RESULT_AVAILABLE') return;
      if (reply.state === 'completed' && request.kind === 'analysis' && reply.text) {
        job.state = 'RESULT_AVAILABLE'; job.text = reply.text.slice(0, 32000);
        job.verification = 'PROVIDER_ANALYSIS_NOT_INDEPENDENTLY_VERIFIED';
      } else if (reply.state === 'completed' && request.kind === 'generation' && downloaded) {
        job.state = 'RESULT_AVAILABLE';
        job.output = {mimeType: downloaded.mimeType, sha256: downloaded.sha256, byteLength: downloaded.byteLength,
          ref: 'jh-gemini-media://output/' + job.requestId};
        job.verification = 'DOWNLOADED_CONTAINER_CHECKED_PLAYBACK_NOT_CHECKED';
      } else if (reply.state === 'completed') {
        job.state = 'RESULT_UNAVAILABLE'; job.code = 'PROVIDER_OUTPUT_NOT_RECOVERED';
      } else if (['in_progress', 'requires_action', 'requires_continuation'].includes(reply.state)) {
        job.state = 'UNKNOWN'; job.code = 'PROVIDER_CONTINUATION_NOT_AUTHORIZED';
      } else {
        job.state = reply.state === 'unknown' ? 'UNKNOWN' : 'FAILED';
      }
      delete budget.activeRequests[job.requestId];
      job.completedAt = clock();
    });
  }
  async function run(request) {
    try {
      const start = update(request.requestId, (job, budget) => {
        if (job.state !== 'QUEUED' || job.cancelRequested || closing) {
          if (job.state === 'QUEUED') {releaseReservation(job, budget); job.state = 'CANCELLED'; job.code = 'CANCELLED_BEFORE_DISPATCH'; delete budget.activeRequests[job.requestId];}
          return;
        }
        // Recheck account/price expiry immediately before the one POST.
        const blocked = gate(request.kind, budget, 0);
        if (blocked) {releaseReservation(job, budget); job.state = 'BLOCKED'; job.code = blocked; delete budget.activeRequests[job.requestId]; return;}
        job.state = 'SUBMITTING'; job.submittedAt = clock(); job.code = 'PROVIDER_REQUEST_STARTED';
      });
      if (start.state !== 'SUBMITTING') return start;
      const reply = await provider.createInteraction(request.body);
      return await recordReply(request, reply);
    } catch (e) {
      return update(request.requestId, (job, budget) => {
        if (job.state !== 'RESULT_AVAILABLE') job.state = job.actualMicros === null ? 'UNKNOWN' : 'RESULT_UNAVAILABLE';
        job.code = codeOf(e); delete budget.activeRequests[job.requestId];
        if (job.actualMicros === null) markUnknown(job, budget);
      });
    }
  }
  function submit(input, quoteId) {
    const request = normalizedInput(input), digest = bodyDigest(request), now = clock();
    if (!isExplicitMediaExecutionRequest(request.kind, request.userRequest)) error('GEMINI_EXPLICIT_EXECUTION_REQUEST_REQUIRED');
    const accepted = store.transactGeminiMedia(ownerDigest, request.requestId, ({job, budget: saved}) => {
      if (!job) error('GEMINI_PREVIEW_REQUIRED');
      if (job.bodyDigest !== digest || job.quoteId !== quoteId) error('GEMINI_QUOTE_MISMATCH');
      const budget = inspectBudget(saved);
      if (job.state !== 'PLANNED') return {job, budget, result: {...publicJob(job), duplicate: true}};
      if (now >= job.quoteExpiresAt) error('GEMINI_QUOTE_EXPIRED');
      const blocked = gate(request.kind, budget, job.reserveMicros, now);
      if (blocked) return {job, budget, result: {...publicJob(job), ok: false, code: blocked, paidRequestSent: false}};
      job.reservationPeriod = periodOf(now); job.authorizationRef = config.authorization.reference;
      const {credit} = bucket(budget, job.reservationPeriod, job.authorizationRef);
      budget.heldMicros += job.reserveMicros; credit.heldMicros += job.reserveMicros;
      job.reservationOpen = true; job.state = 'QUEUED'; job.code = 'SINGLE_SUBMISSION_QUEUED';
      put(budget.activeRequests, job.requestId, true);
      inspectBudget(budget);
      return {job, budget, result: {...publicJob(job), duplicate: false}};
    });
    if (accepted.ok && accepted.state === 'QUEUED' && !accepted.duplicate) {
      let finish;
      const completion = new Promise(resolve => {finish = resolve;});
      running.set(request.requestId, completion);
      schedule(() => {run(request).catch(() => {}).finally(() => {running.delete(request.requestId); finish();});});
    }
    return accepted;
  }
  function get(requestId) {
    if (!ID.test(requestId || '')) error('GEMINI_REQUEST_ID_INVALID');
    const current = store.readGeminiMedia(ownerDigest, requestId).job;
    if (current && pending.has(current.state) && !running.has(requestId)) {
      return update(requestId, (job, budget) => {
        job.state = 'UNKNOWN'; job.code = 'RESTART_REQUIRES_RECONCILIATION'; markUnknown(job, budget);
        delete budget.activeRequests[job.requestId];
      });
    }
    return publicJob(current);
  }
  function cancel(requestId) {
    return update(requestId, (job, budget) => {
      job.cancelRequested = true;
      if (job.state === 'PLANNED' || job.state === 'QUEUED') {
        releaseReservation(job, budget); job.state = 'CANCELLED'; job.code = 'CANCELLED_BEFORE_DISPATCH';
        delete budget.activeRequests[job.requestId];
      } else job.code = 'STOPPED_NO_REPLAY_PROVIDER_DISPATCH_NOT_REVERSED';
    });
  }
  async function refresh(requestId) {
    const current = get(requestId);
    if (closing) return {...current, refreshCode: 'GEMINI_SERVICE_CLOSING'};
    if (refreshing.has(requestId)) return refreshing.get(requestId);
    if (!current.ok || (current.state === 'RESULT_AVAILABLE' && current.billingStatus !== 'UNKNOWN') || running.has(requestId)) return current;
    const job = store.readGeminiMedia(ownerDigest, requestId).job;
    if (!job?.interactionId) return {...current, refreshCode: 'NO_PROVIDER_ID_REQUIRES_BILLING_REVIEW'};
    // store:false is the default. A provider may no longer retain this ID.
    // GET failure leaves the original uncertainty and reservation intact.
    const work = Promise.resolve().then(async () => {
      const reply = await provider.getInteraction(job.interactionId);
      const terminalReceipt = reply.interactionId === job.interactionId && reply.model === job.model &&
        ['completed', 'failed', 'cancelled'].includes(reply.state) && reply.billingStatus === 'usage_reported';
      if (!reply.ok && !terminalReceipt) return {...current, refreshCode: reply.code, automaticReplay: false};
      if (reply.interactionId !== job.interactionId) return {...current, refreshCode: 'PROVIDER_INTERACTION_NOT_VERIFIED', automaticReplay: false};
      return recordReply(job, reply);
    }).finally(() => {running.delete(requestId); refreshing.delete(requestId);});
    // Shutdown must wait for usage reconciliation and output storage as well as
    // initial submission. Concurrent reads reuse the same GET operation.
    running.set(requestId, work); refreshing.set(requestId, work);
    return work;
  }
  function output(requestId) {
    const job = get(requestId);
    if (!job.ok || job.state !== 'RESULT_AVAILABLE' || job.kind !== 'generation' || !job.output) error('GEMINI_OUTPUT_NOT_AVAILABLE');
    const asset = store.loadGeminiMediaOutput(ownerDigest, requestId);
    if (!asset || asset.sha256 !== job.output.sha256) error('GEMINI_OUTPUT_READBACK_MISMATCH');
    return {job, asset};
  }
  async function drain() { await Promise.allSettled([...running.values()]); }
  async function close() { closing = true; await drain(); }
  // The existing owner startup already holds its single-runtime storage lock.
  // Quarantine abandoned submissions before any NEW request can pass the gate.
  const savedBudget = inspectBudget(store.readGeminiMediaBudget(ownerDigest));
  for (const requestId of Object.keys(savedBudget.activeRequests)) {
    const savedJob = store.readGeminiMedia(ownerDigest, requestId).job;
    const recoveredAsset = savedJob?.state === 'RESULT_PENDING_DOWNLOAD'
      ? store.loadGeminiMediaOutput(ownerDigest, requestId) : null;
    update(requestId, (job, budget) => {
      if (pending.has(job.state)) {
        job.state = 'UNKNOWN'; job.code = 'RESTART_REQUIRES_RECONCILIATION'; markUnknown(job, budget);
      } else if (job.state === 'RESULT_PENDING_DOWNLOAD') {
        const asset = recoveredAsset;
        if (asset) {
          job.state = 'RESULT_AVAILABLE'; job.code = 'STORED_RESULT_RECOVERED';
          job.output = {mimeType: asset.mimeType, sha256: asset.sha256, byteLength: asset.bytes.length,
            ref: 'jh-gemini-media://output/' + requestId};
          job.verification = 'DOWNLOADED_CONTAINER_CHECKED_PLAYBACK_NOT_CHECKED';
        } else {job.state = 'RESULT_UNAVAILABLE'; job.code = 'RESULT_RETRIEVAL_INTERRUPTED';}
      }
      delete budget.activeRequests[requestId];
    });
  }
  return Object.freeze({status, preview, submit, get, refresh, cancel, output, drain, close});
}
