/* JH host-only decision learning. Original portable application code.
 * Explicit goal -> prediction -> observed outcome -> reviewed explanation.
 * Source authority is host-attested. This module neither authenticates a
 * report nor proves causes, trains a model, or authorizes external actions.
 * No imports, network, filesystem, timers, credentials or background work.
 * The host/CLI owns authorization for immutable ownerScope.
 */
(function installJHDecisionLearning(root) {
  'use strict';
  const VERSION = '1.0.0';
  const SCHEMA = 'jh.decision-learning.v1';
  const MAX_STATE_BYTES = 2 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 512 * 1024;
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
  const LIMITS = { goals: 200, decisions: 1000, predictions: 500, outcomes: 1000, reviews: 1000, events: 3000 };
  const COMMON = ['expectedRevision', 'sourceRef', 'at'];
  const TERMINAL = new Set(['completed', 'dismissed', 'superseded']);
  const EVENT_IDS = { goal: 'goalId', status: 'decisionId', prediction: 'predictionId', outcome: 'outcomeId', review: 'reviewId' };
  const CAUSES = new Set(['candidate_information', 'priority_interpretation', 'context_changed', 'preference_changed', 'execution_issue', 'unknown']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function check(value, code = 'DECISION_INPUT_INVALID') {
    if (!value) fail(code);
  }
  function plain(value, code = 'DECISION_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string' && !RESERVED.has(key)) &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
    return descriptors;
  }
  function fields(value, required, optional = [], code = 'DECISION_INPUT_INVALID') {
    plain(value, code);
    check(required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
  }
  function integer(value, min, max, code = 'DECISION_INPUT_INVALID') {
    check(Number.isSafeInteger(value) && value >= min && value <= max, code);
    return value;
  }
  function wellFormed(value) {
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
  }
  function text(value, max, code = 'DECISION_INPUT_INVALID', empty = false) {
    check(typeof value === 'string' && value.length <= max && wellFormed(value) &&
      (empty || value.trim().length > 0) &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), code);
    return value;
  }
  function credential(value) {
    return /\bBearer\s+\S+/i.test(value) ||
      /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|passwd|secret|authorization)\s*[:=]\s*\S+/i.test(value) ||
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/.test(value) ||
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value);
  }
  function normalizedText(value, max, code = 'DECISION_INPUT_INVALID', empty = false) {
    text(value, max, code, empty);
    const result = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    text(result, max, code, empty);
    check(!credential(result), code);
    return result;
  }
  function token(value, code = 'DECISION_INPUT_INVALID', lower = false) {
    const result = normalizedText(value, 160, code);
    const normalized = lower ? result.toLowerCase() : result;
    check(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(normalized) &&
      !RESERVED.has(normalized.toLowerCase()), code);
    return normalized;
  }
  function iso(value, code = 'DECISION_INPUT_INVALID') {
    text(value, 40, code);
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    check(match && Number.isFinite(Date.parse(value)), code);
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    check(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
      Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59 &&
      Number(match[9] || 0) <= 23 && Number(match[10] || 0) <= 59, code);
    const result = new Date(value).toISOString();
    check(result.length === 24, code);
    return result;
  }
  function hash(value, code = 'DECISION_INPUT_INVALID') {
    check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), code);
    return value;
  }
  function uniqueTokens(value, max, code = 'DECISION_INPUT_INVALID', allowEmpty = true) {
    check(Array.isArray(value) && value.length <= max && (allowEmpty || value.length > 0), code);
    const result = value.map(item => token(item, code));
    check(new Set(result).size === result.length, code);
    return result;
  }
  function clean(value, code = 'DECISION_INPUT_INVALID', depth = 0, budget = { nodes: 100000, chars: 0 }) {
    check(depth <= 32 && --budget.nodes >= 0, code);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { check(Number.isFinite(value), code); return value; }
    if (typeof value === 'string') {
      check(wellFormed(value), code);
      budget.chars += value.length;
      check(budget.chars <= MAX_STATE_BYTES, code);
      return value;
    }
    if (Array.isArray(value)) {
      check(Object.getPrototypeOf(value) === Array.prototype && value.length <= 10000 &&
        Reflect.ownKeys(value).length === value.length + 1, code);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return Array.from({ length: value.length }, (_, index) => {
        const item = descriptors[index];
        check(item && own(item, 'value') && item.enumerable, code);
        return clean(item.value, code, depth + 1, budget);
      });
    }
    const descriptors = plain(value, code), result = {};
    for (const key of Object.keys(descriptors)) {
      budget.chars += key.length;
      check(budget.chars <= MAX_STATE_BYTES, code);
      result[key] = clean(descriptors[key].value, code, depth + 1, budget);
    }
    return result;
  }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  function utf8(value) {
    const bytes = [];
    for (let i = 0; i < value.length; i++) {
      let point = value.charCodeAt(i);
      if (point >= 0xd800 && point <= 0xdbff) {
        point = 0x10000 + ((point - 0xd800) << 10) + value.charCodeAt(++i) - 0xdc00;
      }
      if (point < 0x80) bytes.push(point);
      else if (point < 0x800) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 63));
      else if (point < 0x10000) bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 63), 0x80 | (point & 63));
      else bytes.push(0xf0 | (point >>> 18), 0x80 | ((point >>> 12) & 63), 0x80 | ((point >>> 6) & 63), 0x80 | (point & 63));
    }
    return bytes;
  }
  // Original implementation of the SHA-256 compression algorithm. Constants
  // are the standard fractional square/cube-root words, not library code.
  const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256(value) {
    const bytes = utf8(value), bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000), low = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 255);
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 255);
    const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const ror = (word, bits) => (word >>> bits) | (word << (32 - bits));
    const words = new Array(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        words[i] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
      }
      for (let i = 16; i < 64; i++) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) +
          words[i - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) | 0;
      }
      let [a, b, c, d, e, f, g, h] = state;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + words[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((word, i) => { state[i] = (state[i] + word) | 0; });
    }
    return state.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function digest(value) { return sha256(canonical(value)); }
  function fingerprint(value) { return digest(clean(value)); }
  function without(value, keys) {
    const result = {};
    for (const key of Object.keys(value)) if (!keys.includes(key)) result[key] = value[key];
    return result;
  }
  function same(a, b) { return canonical(a) === canonical(b); }
  function scope(value) {
    fields(value, ['topic'], ['project', 'aspect']);
    const result = { topic: token(value.topic, undefined, true) };
    for (const key of ['project', 'aspect']) if (own(value, key)) result[key] = token(value[key], undefined, true);
    return result;
  }
  function finite(value) {
    check(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12);
    return value;
  }
  function unit(value) { finite(value); check(value >= 0 && value <= 1); return value; }
  function refs(value, allowEmpty = false) {
    check(Array.isArray(value) && value.length <= 6 && (allowEmpty || value.length >= 1));
    const result = value.map(item => normalizedText(item, 500, undefined, allowEmpty));
    check(new Set(result).size === result.length);
    return result;
  }
  function priorities(value) {
    check(Array.isArray(value) && value.length <= 20);
    const result = value.map(item => {
      fields(item, ['key', 'direction', 'weight', 'reason', 'sourceRef']);
      check(['higher', 'lower'].includes(item.direction));
      return { key: token(item.key, undefined, true), direction: item.direction,
        weight: integer(item.weight, 1, 5), reason: normalizedText(item.reason, 800),
        sourceRef: normalizedText(item.sourceRef, 500) };
    });
    check(new Set(result.map(item => item.key)).size === result.length);
    return result;
  }
  function constraints(value) {
    check(Array.isArray(value) && value.length <= 20);
    const result = value.map(item => {
      fields(item, ['key', 'operator', 'value', 'reason', 'sourceRef']);
      check(['gte', 'lte'].includes(item.operator));
      return { key: token(item.key, undefined, true), operator: item.operator, value: unit(item.value),
        reason: normalizedText(item.reason, 800), sourceRef: normalizedText(item.sourceRef, 500) };
    });
    check(new Set(result.map(item => item.key + ':' + item.operator)).size === result.length);
    return result;
  }
  function measurements(value, expected) {
    check(Array.isArray(value) && value.length <= 20 && (!expected || value.length >= 1));
    const result = value.map(item => {
      fields(item, expected ? ['key', 'unit', 'min', 'max'] : ['key', 'unit', 'value']);
      const base = { key: token(item.key, undefined, true), unit: normalizedText(item.unit, 80) };
      if (!expected) return { ...base, value: item.value === null ? null : finite(item.value) };
      const min = item.min === null ? null : finite(item.min), max = item.max === null ? null : finite(item.max);
      check((min !== null || max !== null) && (min === null || max === null || min <= max));
      return { ...base, min, max };
    });
    check(new Set(result.map(item => item.key)).size === result.length);
    return result;
  }
  function normalizePayload(kind, input) {
    const raw = clean(input), members = {
      goal: ['goalId', 'scope', 'goal', 'reason', 'basis', 'priorities', 'constraints', 'validUntil', 'supersedes'],
      status: ['decisionId', 'goalId', 'status', 'basis', 'reason'],
      prediction: ['predictionId', 'goalId', 'optionId', 'expected', 'expectedBenefit', 'expectedBurden', 'uncertainties'],
      outcome: ['outcomeId', 'predictionId', 'observed', 'summary', 'basis'],
      review: ['reviewId', 'outcomeId', 'cause', 'explanation', 'proposedAdjustment', 'basis', 'evidenceRefs'],
    };
    check(own(members, kind));
    fields(raw, [...COMMON, ...members[kind]]);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const base = { sourceRef: normalizedText(raw.sourceRef, 500), at: iso(raw.at) };
    if (kind === 'goal') {
      check(['user_explicit', 'host_inferred'].includes(raw.basis));
      const validUntil = raw.validUntil === null ? null : iso(raw.validUntil);
      check(validUntil === null || Date.parse(validUntil) > Date.parse(base.at));
      return { goalId: token(raw.goalId), scope: scope(raw.scope), goal: normalizedText(raw.goal, 1200),
        reason: normalizedText(raw.reason, 800), basis: raw.basis, priorities: priorities(raw.priorities),
        constraints: constraints(raw.constraints), validUntil,
        supersedes: raw.supersedes === null ? null : token(raw.supersedes), ...base };
    }
    if (kind === 'status') {
      check(['active', 'paused', 'completed', 'dismissed'].includes(raw.status) &&
        ['user_explicit', 'host_verified'].includes(raw.basis));
      return { decisionId: token(raw.decisionId), goalId: token(raw.goalId), status: raw.status,
        basis: raw.basis, reason: normalizedText(raw.reason, 800), ...base };
    }
    if (kind === 'prediction') {
      check(Array.isArray(raw.uncertainties) && raw.uncertainties.length <= 10);
      const uncertainties = raw.uncertainties.map(item => normalizedText(item, 400));
      check(new Set(uncertainties).size === uncertainties.length);
      return { predictionId: token(raw.predictionId), goalId: token(raw.goalId), optionId: token(raw.optionId),
        expected: measurements(raw.expected, true), expectedBenefit: normalizedText(raw.expectedBenefit, 1000),
        expectedBurden: normalizedText(raw.expectedBurden, 1000), uncertainties, ...base };
    }
    if (kind === 'outcome') {
      check(['user_report', 'host_verified'].includes(raw.basis));
      return { outcomeId: token(raw.outcomeId), predictionId: token(raw.predictionId),
        observed: measurements(raw.observed, false), summary: normalizedText(raw.summary, 1200), basis: raw.basis, ...base };
    }
    check(CAUSES.has(raw.cause) && ['reviewed_inference', 'user_explicit'].includes(raw.basis));
    return { reviewId: token(raw.reviewId), outcomeId: token(raw.outcomeId), cause: raw.cause,
      explanation: normalizedText(raw.explanation, 1200), proposedAdjustment: normalizedText(raw.proposedAdjustment, 1200),
      basis: raw.basis, evidenceRefs: refs(raw.evidenceRefs), ...base };
  }
  function eventKey(kind, data) { return kind + ':' + data[EVENT_IDS[kind]]; }
  function emptyState(ownerScope, now) {
    return { schema: SCHEMA, apiVersion: VERSION, ownerScope, createdAt: now, updatedAt: now,
      revision: 0, goals: {}, decisions: {}, predictions: {}, outcomes: {}, reviews: {}, events: {} };
  }
  function createState(input) {
    input = clean(input);
    fields(input, ['ownerScope', 'now']);
    return emptyState(normalizedText(input.ownerScope, 160), iso(input.now));
  }
  function capacity(state) {
    for (const [name, limit] of Object.entries(LIMITS)) {
      plain(state[name], 'DECISION_STATE_INVALID');
      check(Object.keys(state[name]).length <= limit, 'DECISION_STATE_CAPACITY');
    }
    check(utf8(JSON.stringify(state)).length <= MAX_STATE_BYTES, 'DECISION_STATE_CAPACITY');
  }
  function boundedOutput(value) {
    check(utf8(JSON.stringify(value)).length <= MAX_OUTPUT_BYTES, 'DECISION_OUTPUT_CAPACITY');
    return value;
  }
  function timeOrder(at, earliest) { check(Date.parse(at) >= Date.parse(earliest), 'DECISION_TIME_ORDER'); }
  function goalOf(state, goalId) {
    check(own(state.goals, goalId), 'DECISION_GOAL_NOT_FOUND');
    return state.goals[goalId];
  }
  function contextOf(goal, at) {
    const expired = goal.validUntil !== null && Date.parse(at) >= Date.parse(goal.validUntil);
    const eligible = goal.status === 'active' && !expired;
    return { goalId: goal.id, eligible, eligibilityReason: goal.status !== 'active' ? goal.status : expired ? 'expired' : 'active',
      status: goal.status, scope: goal.scope, goal: goal.goal, reason: goal.reason, sourceRef: goal.sourceRef,
      basis: goal.basis, priorities: goal.priorities, constraints: goal.constraints, validUntil: goal.validUntil,
      goalRevision: goal.goalRevision, statusReason: goal.statusReason, statusBasis: goal.statusBasis,
      statusSourceRef: goal.statusSourceRef, supersedes: goal.supersedes, supersededBy: goal.supersededBy,
      authorizesExecution: false };
  }
  function insert(map, id, record) {
    check(!own(map, id), 'DECISION_ID_CONFLICT');
    map[id] = record;
  }
  function statusUpdate(goal, status, reason, basis, sourceRef, at, revision) {
    goal.status = status; goal.statusReason = reason; goal.statusBasis = basis;
    goal.statusSourceRef = sourceRef; goal.updatedAt = at; goal.goalRevision = revision;
  }
  function applyEvent(state, kind, data, event) {
    const key = eventKey(kind, data), revision = event.revision, metadata = { eventKey: key, revision };
    timeOrder(data.at, state.updatedAt);
    if (kind === 'goal') {
      check(!own(state.goals, data.goalId), 'DECISION_ID_CONFLICT');
      if (data.supersedes !== null) {
        const previous = goalOf(state, data.supersedes);
        check(data.basis === 'user_explicit', 'DECISION_EVIDENCE_INVALID');
        check(same(data.scope, previous.scope), 'DECISION_SCOPE_MISMATCH');
        check(!TERMINAL.has(previous.status), 'DECISION_GOAL_TERMINAL');
        statusUpdate(previous, 'superseded', data.reason, data.basis, data.sourceRef, data.at, revision);
        previous.supersededBy = data.goalId;
      }
      insert(state.goals, data.goalId, { id: data.goalId, scope: data.scope, goal: data.goal,
        reason: data.reason, basis: data.basis, priorities: data.priorities, constraints: data.constraints,
        validUntil: data.validUntil, supersedes: data.supersedes, supersededBy: null,
        status: data.basis === 'user_explicit' ? 'active' : 'proposed', statusReason: data.reason,
        statusBasis: data.basis, statusSourceRef: data.sourceRef, sourceRef: data.sourceRef,
        createdAt: data.at, updatedAt: data.at, createdRevision: revision, goalRevision: revision, ...metadata });
    } else if (kind === 'status') {
      const goal = goalOf(state, data.goalId);
      check(!TERMINAL.has(goal.status), 'DECISION_GOAL_TERMINAL');
      if (data.status === 'active' && ['proposed', 'paused'].includes(goal.status)) {
        check(data.basis === 'user_explicit', 'DECISION_EVIDENCE_INVALID');
      }
      insert(state.decisions, data.decisionId, { id: data.decisionId, ...without(data, ['decisionId']), ...metadata });
      statusUpdate(goal, data.status, data.reason, data.basis, data.sourceRef, data.at, revision);
    } else if (kind === 'prediction') {
      const goal = goalOf(state, data.goalId), goalSnapshot = clean(contextOf(goal, data.at));
      check(goalSnapshot.eligible, 'DECISION_GOAL_INELIGIBLE');
      insert(state.predictions, data.predictionId, { id: data.predictionId,
        ...without(data, ['predictionId']), goalRevision: goal.goalRevision, goalSnapshot, ...metadata });
    } else if (kind === 'outcome') {
      check(own(state.predictions, data.predictionId), 'DECISION_PREDICTION_NOT_FOUND');
      const prediction = state.predictions[data.predictionId];
      timeOrder(data.at, prediction.at);
      const declared = new Map(prediction.expected.map(item => [item.key, item]));
      for (const metric of data.observed) {
        check(declared.has(metric.key), 'DECISION_EVIDENCE_INVALID');
        check(metric.unit === declared.get(metric.key).unit, 'DECISION_UNIT_MISMATCH');
      }
      insert(state.outcomes, data.outcomeId, { id: data.outcomeId, goalId: prediction.goalId,
        ...without(data, ['outcomeId']), ...metadata });
    } else {
      check(own(state.outcomes, data.outcomeId), 'DECISION_OUTCOME_NOT_FOUND');
      timeOrder(data.at, state.outcomes[data.outcomeId].at);
      insert(state.reviews, data.reviewId, { id: data.reviewId, ...without(data, ['reviewId']), ...metadata });
    }
    state.events[key] = event; state.revision = revision; state.updatedAt = data.at;
  }
  function validateState(value) {
    try {
      const code = 'DECISION_STATE_INVALID', state = clean(value, code);
      fields(state, ['schema', 'apiVersion', 'ownerScope', 'createdAt', 'updatedAt', 'revision',
        'goals', 'decisions', 'predictions', 'outcomes', 'reviews', 'events'], [], code);
      check(state.schema === SCHEMA && state.apiVersion === VERSION &&
        normalizedText(state.ownerScope, 160, code) === state.ownerScope &&
        iso(state.createdAt, code) === state.createdAt && iso(state.updatedAt, code) === state.updatedAt, code);
      integer(state.revision, 0, LIMITS.events, code);
      capacity(state);
      const records = Object.entries(state.events).sort((a, b) => a[1].revision - b[1].revision);
      check(records.length === state.revision, code);
      const restored = emptyState(state.ownerScope, state.createdAt);
      for (const [key, event] of records) {
        fields(event, ['eventId', 'kind', 'payload', 'at', 'revision', 'fingerprint'], [], code);
        check(own(EVENT_IDS, event.kind) && event.revision === restored.revision + 1, code);
        const data = normalizePayload(event.kind, { ...event.payload, expectedRevision: restored.revision });
        check(same(data, event.payload) && event.at === data.at && event.eventId === data[EVENT_IDS[event.kind]] &&
          key === eventKey(event.kind, data) && event.fingerprint === digest({ kind: event.kind, payload: data }), code);
        applyEvent(restored, event.kind, data, event);
      }
      check(same(restored, state), code);
      return state;
    } catch (error) {
      if (error && error.code === 'DECISION_STATE_CAPACITY') throw error;
      fail('DECISION_STATE_INVALID');
    }
  }
  function resultFor(kind, data) {
    const result = { [EVENT_IDS[kind]]: data[EVENT_IDS[kind]] };
    if (['status', 'prediction'].includes(kind)) result.goalId = data.goalId;
    if (kind === 'outcome') result.predictionId = data.predictionId;
    if (kind === 'review') result.outcomeId = data.outcomeId;
    return result;
  }
  function mutate(value, input, kind) {
    const state = validateState(value), data = normalizePayload(kind, input), key = eventKey(kind, data);
    const identity = digest({ kind, payload: data }), result = resultFor(kind, data);
    if (own(state.events, key)) {
      check(state.events[key].fingerprint === identity, 'DECISION_ID_CONFLICT');
      return { state, result: { ...result, duplicate: true, changed: false, revision: state.revision } };
    }
    check(input.expectedRevision === state.revision, 'DECISION_REVISION_CONFLICT');
    const event = { eventId: data[EVENT_IDS[kind]], kind, payload: data, at: data.at,
      revision: state.revision + 1, fingerprint: identity };
    applyEvent(state, kind, data, event);
    capacity(state);
    return { state, result: { ...result, duplicate: false, changed: true, revision: state.revision } };
  }
  function recordGoal(state, input) { return mutate(state, input, 'goal'); }
  function setGoalStatus(state, input) { return mutate(state, input, 'status'); }
  function recordPrediction(state, input) { return mutate(state, input, 'prediction'); }
  function recordOutcome(state, input) { return mutate(state, input, 'outcome'); }
  function recordReview(state, input) { return mutate(state, input, 'review'); }

  function readGoal(value, input, optional = []) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['goalId', 'at'], optional);
    const goalId = token(raw.goalId), at = iso(raw.at);
    timeOrder(at, state.updatedAt);
    const goal = goalOf(state, goalId);
    return { state, raw, at, goal, context: contextOf(goal, at) };
  }
  function goalContext(value, input) {
    return boundedOutput(readGoal(value, input).context);
  }
  function comparisonOf(state, predictionId, outcomeId) {
    check(own(state.predictions, predictionId), 'DECISION_PREDICTION_NOT_FOUND');
    check(own(state.outcomes, outcomeId), 'DECISION_OUTCOME_NOT_FOUND');
    const prediction = state.predictions[predictionId], outcome = state.outcomes[outcomeId];
    check(outcome.predictionId === predictionId, 'DECISION_EVIDENCE_INVALID');
    const observed = new Map(outcome.observed.map(item => [item.key, item]));
    const sourceRefs = [...new Set([prediction.sourceRef, outcome.sourceRef])];
    const metrics = prediction.expected.map(target => {
      const item = observed.get(target.key), value = item ? item.value : null;
      const unknown = value === null;
      const below = !unknown && target.min !== null && value < target.min;
      const above = !unknown && target.max !== null && value > target.max;
      return { key: target.key, unit: target.unit, target: { min: target.min, max: target.max }, value,
        status: unknown ? 'unknown' : below || above ? 'missed' : 'matched',
        observation: !item ? 'missing' : unknown ? 'unknown' : 'observed',
        delta: unknown ? null : below ? value - target.min : above ? value - target.max : 0, sourceRefs };
    });
    const missed = metrics.some(item => item.status === 'missed');
    const known = metrics.filter(item => item.status !== 'unknown').length;
    return { predictionId, outcomeId, goalId: prediction.goalId, goalRevision: prediction.goalRevision,
      metrics, overall: missed ? 'missed' : known === 0 ? 'unknown' : known < metrics.length ? 'partial' : 'matched',
      basis: outcome.basis, predictionSourceRef: prediction.sourceRef, outcomeSourceRef: outcome.sourceRef,
      independentlyVerified: false, authorizesExecution: false };
  }
  function compare(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['predictionId', 'outcomeId']);
    return boundedOutput(comparisonOf(state, token(raw.predictionId), token(raw.outcomeId)));
  }
  function reviewContext(value, input) {
    const { state, raw, at, goal, context } = readGoal(value, input, ['limit']);
    const limit = raw.limit === undefined ? 3 : integer(raw.limit, 1, 10), reviewLimit = 10;
    const matching = Object.values(state.outcomes).filter(outcome => Date.parse(outcome.at) <= Date.parse(at) &&
      same(state.predictions[outcome.predictionId].goalSnapshot.scope, goal.scope))
      .sort((a, b) => b.revision - a.revision || cmp(a.id, b.id));
    const items = matching.slice(0, limit).map(outcome => {
      const prediction = state.predictions[outcome.predictionId];
      const reviews = Object.values(state.reviews).filter(review => review.outcomeId === outcome.id &&
        Date.parse(review.at) <= Date.parse(at)).sort((a, b) => b.revision - a.revision || cmp(a.id, b.id));
      return { prediction, outcome, comparison: comparisonOf(state, prediction.id, outcome.id),
        reviews: reviews.slice(0, reviewLimit), reviewsOmitted: Math.max(0, reviews.length - reviewLimit) };
    });
    return boundedOutput({ goalId: goal.id, scope: goal.scope, goalContext: context, items,
      totalAvailable: matching.length, omitted: matching.length - items.length, limit, reviewLimit,
      causalityVerified: false, updatesGoalCriteria: false, updatesPreferences: false, authorizesExecution: false });
  }
  function candidateInput(value) {
    fields(value, ['id', 'goalId', 'label', 'sourceRefs', 'stage', 'eligible',
      'benefit', 'confidence', 'setupBurden', 'ongoingBurden', 'interruptionCost']);
    check(['ready', 'blocked', 'later'].includes(value.stage) &&
      (value.eligible === null || typeof value.eligible === 'boolean'));
    const result = { id: token(value.id), goalId: token(value.goalId), label: normalizedText(value.label, 160),
      sourceRefs: refs(value.sourceRefs, true), stage: value.stage, eligible: value.eligible };
    for (const key of ['benefit', 'confidence', 'setupBurden', 'ongoingBurden', 'interruptionCost']) {
      result[key] = value[key] === null ? null : unit(value[key]);
    }
    return result;
  }
  const rounded = value => Math.round(value * 1e12) / 1e12;
  function selectProposals(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['goalId', 'at', 'mode', 'candidates'], ['limit']);
    const goalId = token(raw.goalId), at = iso(raw.at);
    timeOrder(at, state.updatedAt);
    const context = contextOf(goalOf(state, goalId), at);
    check(['busy', 'normal', 'explore'].includes(raw.mode));
    const requestedLimit = raw.limit === undefined ? 1 : integer(raw.limit, 1, 3);
    const limit = raw.mode === 'explore' ? requestedLimit : 1;
    check(Array.isArray(raw.candidates) && raw.candidates.length <= 20);
    const candidates = raw.candidates.map(candidateInput);
    check(new Set(candidates.map(item => item.id)).size === candidates.length);
    const multiplier = raw.mode === 'busy' ? 2 : raw.mode === 'explore' ? 0.5 : 1;
    const ready = [], deferred = [];
    for (const candidate of candidates) {
      let reason = null;
      if (!context.eligible) reason = 'goal_' + context.eligibilityReason;
      else if (candidate.goalId !== goalId) reason = 'goal_mismatch';
      else if (candidate.stage !== 'ready') reason = candidate.stage;
      else if (candidate.eligible !== true) reason = candidate.eligible === null ? 'eligibility_unknown' : 'ineligible';
      else if (candidate.sourceRefs.length === 0 || candidate.sourceRefs.some(ref => ref.length === 0)) reason = 'evidence_missing';
      const unknownFields = ['benefit', 'confidence', 'setupBurden', 'ongoingBurden', 'interruptionCost']
        .filter(key => candidate[key] === null);
      if (!reason && unknownFields.length) reason = 'metrics_unknown';
      let score = null, scoreComponents = null;
      if (!reason) {
        scoreComponents = { expectedValue: rounded(candidate.benefit * candidate.confidence),
          setupPenalty: rounded(0.25 * candidate.setupBurden), ongoingPenalty: rounded(0.25 * candidate.ongoingBurden),
          interruptionPenalty: rounded(multiplier * 0.25 * candidate.interruptionCost) };
        score = rounded(candidate.benefit * candidate.confidence - 0.25 * candidate.setupBurden -
          0.25 * candidate.ongoingBurden - multiplier * 0.25 * candidate.interruptionCost);
        if (score <= 0) reason = 'nonpositive_utility';
      }
      if (reason) {
        const entry = { id: candidate.id, goalId: candidate.goalId, label: candidate.label,
          reason, sourceRefs: candidate.sourceRefs, score };
        if (reason === 'metrics_unknown') entry.unknownFields = unknownFields;
        deferred.push(entry);
      } else ready.push({ ...candidate, score, scoreComponents });
    }
    ready.sort((a, b) => b.score - a.score || cmp(a.id, b.id));
    const selected = ready.slice(0, limit);
    for (const candidate of ready.slice(limit)) deferred.push({ id: candidate.id, goalId: candidate.goalId,
      label: candidate.label, reason: 'selection_limit', sourceRefs: candidate.sourceRefs, score: candidate.score });
    deferred.sort((a, b) => cmp(a.id, b.id));
    return boundedOutput({ selected, deferred, goalContext: context, mode: raw.mode, limit, requestedLimit,
      scoreKind: 'caller_supplied_expected_utility', effectivenessVerified: false,
      authorizesExecution: false, hypothesesRemainUnconfirmed: true });
  }
  function interpretTurn(input) {
    const raw = clean(input);
    fields(raw, ['text', 'taskId', 'pendingQuestion']);
    text(raw.text, 500, 'DECISION_INPUT_INVALID', true);
    const phrase = raw.text.normalize('NFKC').trim().replace(/[.!。]+$/u, '').trim();
    const taskId = raw.taskId === null ? null : token(raw.taskId);
    let pending = null;
    if (raw.pendingQuestion !== null) {
      fields(raw.pendingQuestion, ['id', 'kind'], ['optionId']);
      check(['choice', 'preference', 'action'].includes(raw.pendingQuestion.kind));
      pending = { id: token(raw.pendingQuestion.id), kind: raw.pendingQuestion.kind,
        optionId: own(raw.pendingQuestion, 'optionId') ? token(raw.pendingQuestion.optionId) : null };
    }
    const taskIntents = new Map([
      ['계속', 'continue_task'], ['계속진행', 'continue_task'], ['계속 진행', 'continue_task'], ['다음 작업 진행', 'continue_task'],
      ['했어', 'reported_step_done'], ['별로', 'negative_feedback_cause_unknown'], ['별로야', 'negative_feedback_cause_unknown'],
      ['나중에', 'pause_task'], ['중지', 'stop_task'],
    ]);
    let intent = 'host_interpretation_required';
    if (taskIntents.has(phrase)) intent = taskId === null ? 'context_required' : taskIntents.get(phrase);
    else if (['그래', '응', '네'].includes(phrase)) intent = pending === null ? 'context_required' : 'acknowledge_pending';
    return boundedOutput({ intent, taskId, pendingQuestionId: pending ? pending.id : null,
      pendingQuestionKind: pending ? pending.kind : null, optionId: pending ? pending.optionId : null,
      persistPreference: false, authorizesExecution: false, externallyVerified: false });
  }

  root.JHDecisionLearning = Object.freeze({ VERSION, SCHEMA, fingerprint, createState, validateState,
    recordGoal, setGoalStatus, recordPrediction, recordOutcome, recordReview,
    goalContext, compare, reviewContext, selectProposals, interpretTurn });
})(globalThis);
