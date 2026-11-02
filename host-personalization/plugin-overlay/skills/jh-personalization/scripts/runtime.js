/* JH host-only personalization. Original portable application code.
 * Explicit context, scoped priorities, reasons, choices and after-use feedback.
 * No network, filesystem, credentials, timers, model training or emotion inference.
 * Records are JSON data. Evidence references are host attestations, not independent
 * verification. The host/CLI must authorize access to the immutable ownerScope.
 */
(function installJHPersonalization(root) {
  'use strict';
  const VERSION = '1.0.0';
  const SCHEMA = 'jh.personalization.v1';
  const MAX_STATE_BYTES = 2 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 512 * 1024;
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
  const LIMITS = { preferences: 1000, choices: 500, feedback: 500, events: 2000 };
  const BASE_FIELDS = ['expectedRevision', 'sourceRef', 'at'];
  const BASES = { stated: 0, after_use: 1, explicit_correction: 1 };
  const EVENT_KINDS = ['preference', 'revision', 'choice', 'feedback'];
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function check(value, code = 'PERSONALIZATION_INPUT_INVALID') {
    if (!value) fail(code);
  }
  function plain(value, code = 'PERSONALIZATION_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string' && !RESERVED.has(key)) &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
    return descriptors;
  }
  function fields(value, required, optional = [], code = 'PERSONALIZATION_INPUT_INVALID') {
    plain(value, code);
    check(required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
  }
  function integer(value, min, max, code = 'PERSONALIZATION_INPUT_INVALID') {
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
  function text(value, max, code = 'PERSONALIZATION_INPUT_INVALID', empty = false) {
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
  function normalizedText(value, max, code = 'PERSONALIZATION_INPUT_INVALID', empty = false) {
    text(value, max, code, empty);
    const result = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    text(result, max, code, empty);
    check(!credential(result), code);
    return result;
  }
  function token(value, code = 'PERSONALIZATION_INPUT_INVALID', lower = false) {
    const result = normalizedText(value, 160, code);
    const normalized = lower ? result.toLowerCase() : result;
    check(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(normalized) &&
      !RESERVED.has(normalized.toLowerCase()), code);
    return normalized;
  }
  function iso(value, code = 'PERSONALIZATION_INPUT_INVALID') {
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
  function hash(value, code = 'PERSONALIZATION_INPUT_INVALID') {
    check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), code);
    return value;
  }
  function uniqueTokens(value, max, code = 'PERSONALIZATION_INPUT_INVALID', allowEmpty = true) {
    check(Array.isArray(value) && value.length <= max && (allowEmpty || value.length > 0), code);
    const result = value.map(item => token(item, code));
    check(new Set(result).size === result.length, code);
    return result;
  }
  function clean(value, code = 'PERSONALIZATION_INPUT_INVALID', depth = 0, budget = { nodes: 100000, chars: 0 }) {
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
  function applies(preferenceScope, contextScope) {
    return Object.keys(preferenceScope).every(key => preferenceScope[key] === contextScope[key]);
  }
  function criterion(value, includeId = true) {
    const result = {
      key: token(value.key, undefined, true), direction: value.direction,
      weight: integer(value.weight, 1, 5), status: value.status,
      reason: normalizedText(value.reason, 800),
    };
    check(['higher', 'lower'].includes(result.direction) && ['confirmed', 'uncertain'].includes(result.status));
    if (includeId) result.preferenceId = token(value.preferenceId);
    return result;
  }
  function sourceRefs(value, max = 6) {
    check(Array.isArray(value) && value.length >= 1 && value.length <= max);
    const refs = value.map(ref => normalizedText(ref, 500));
    check(new Set(refs).size === refs.length);
    return refs.sort(cmp);
  }
  function eventId(kind, payload) {
    return kind === 'preference' ? payload.preferenceId : kind === 'revision' ? payload.revisionId :
      kind === 'choice' ? payload.choiceId : payload.feedbackId;
  }
  function eventKey(kind, payload) { return kind + ':' + eventId(kind, payload); }
  function payload(kind, input) {
    const raw = clean(input);
    const members = {
      preference: ['preferenceId', 'scope', 'key', 'direction', 'weight', 'status', 'reason'],
      revision: ['revisionId', 'preferenceId', 'direction', 'weight', 'status', 'reason'],
      choice: ['choiceId', 'scope', 'candidateId', 'reason', 'criteria'],
      feedback: ['feedbackId', 'choiceId', 'basis', 'outcome', 'summary', 'updates'],
    };
    check(own(members, kind));
    fields(raw, [...BASE_FIELDS, ...members[kind]]);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const base = { sourceRef: normalizedText(raw.sourceRef, 500), at: iso(raw.at) };
    if (kind === 'preference') return { ...criterion(raw), scope: scope(raw.scope), ...base };
    if (kind === 'revision') {
      const fieldsOnly = criterion({ key: 'inherited', ...raw });
      return { revisionId: token(raw.revisionId), ...without(fieldsOnly, ['key']), ...base };
    }
    if (kind === 'choice') {
      check(Array.isArray(raw.criteria) && raw.criteria.length <= 20);
      const criteria = raw.criteria.map(item => {
        fields(item, ['preferenceId', 'reason']);
        return { preferenceId: token(item.preferenceId), reason: normalizedText(item.reason, 800) };
      });
      check(new Set(criteria.map(item => item.preferenceId)).size === criteria.length);
      return { choiceId: token(raw.choiceId), scope: scope(raw.scope), candidateId: token(raw.candidateId),
        reason: normalizedText(raw.reason, 800), criteria, ...base };
    }
    check(raw.basis === 'after_use' && ['positive', 'mixed', 'negative', 'uncertain'].includes(raw.outcome));
    check(Array.isArray(raw.updates) && raw.updates.length <= 20);
    const updates = raw.updates.map(item => {
      fields(item, ['preferenceId', 'key', 'direction', 'weight', 'status', 'reason', 'explicit']);
      check(item.explicit === true);
      return { ...criterion(item), explicit: true };
    });
    check(new Set(updates.map(item => item.preferenceId)).size === updates.length &&
      new Set(updates.map(item => item.key)).size === updates.length);
    return { feedbackId: token(raw.feedbackId), choiceId: token(raw.choiceId), basis: 'after_use',
      outcome: raw.outcome, summary: normalizedText(raw.summary, 1000), updates, ...base };
  }
  function emptyState(ownerScope, now) {
    return { schema: SCHEMA, apiVersion: VERSION, ownerScope, createdAt: now, updatedAt: now,
      revision: 0, preferences: {}, choices: {}, feedback: {}, events: {} };
  }
  function createState(input) {
    input = clean(input);
    fields(input, ['ownerScope', 'now']);
    return emptyState(normalizedText(input.ownerScope, 160), iso(input.now));
  }
  function capacity(state) {
    for (const [name, limit] of Object.entries(LIMITS)) {
      plain(state[name], 'PERSONALIZATION_STATE_INVALID');
      check(Object.keys(state[name]).length <= limit, 'PERSONALIZATION_STATE_CAPACITY');
    }
    check(utf8(JSON.stringify(state)).length <= MAX_STATE_BYTES, 'PERSONALIZATION_STATE_CAPACITY');
  }
  function effective(state, currentScope, at, throughRevision = state.revision) {
    const matches = Object.values(state.preferences).filter(item =>
      item.revision <= throughRevision && Date.parse(item.at) <= Date.parse(at) && applies(item.scope, currentScope));
    matches.sort((a, b) => Object.keys(b.scope).length - Object.keys(a.scope).length ||
      BASES[b.basis] - BASES[a.basis] || b.revision - a.revision || cmp(a.id, b.id));
    const winners = new Map();
    for (const item of matches) if (!winners.has(item.key)) winners.set(item.key, item);
    return winners;
  }
  function preferenceRecord(data, extras, key, revision) {
    return { id: data.preferenceId, scope: data.scope, key: data.key, direction: data.direction,
      weight: data.weight, status: data.status, reason: data.reason, sourceRef: data.sourceRef,
      at: data.at, basis: extras.basis, supersedes: extras.supersedes || null,
      choiceId: extras.choiceId || null, feedbackId: extras.feedbackId || null,
      eventKey: key, revision };
  }
  function insertPreference(state, item) {
    check(!own(state.preferences, item.id), 'PERSONALIZATION_ID_CONFLICT');
    state.preferences[item.id] = item;
  }
  function resultFor(kind, data) {
    if (kind === 'preference') return { preferenceId: data.preferenceId };
    if (kind === 'revision') return { preferenceId: data.revisionId, supersedes: data.preferenceId };
    if (kind === 'choice') return { choiceId: data.choiceId };
    return { feedbackId: data.feedbackId, choiceId: data.choiceId,
      updatedPreferenceIds: data.updates.map(item => item.preferenceId) };
  }
  // Internal event replay is also the integrity validator. Historical choices
  // are checked against the preferences that existed at that event revision.
  function applyEvent(state, kind, data, event) {
    const key = eventKey(kind, data), revision = event.revision;
    check(Date.parse(data.at) >= Date.parse(state.updatedAt), 'PERSONALIZATION_TIME_ORDER');
    if (kind === 'preference') {
      insertPreference(state, preferenceRecord(data, { basis: 'stated' }, key, revision));
    } else if (kind === 'revision') {
      check(own(state.preferences, data.preferenceId), 'PERSONALIZATION_PREFERENCE_NOT_FOUND');
      const original = state.preferences[data.preferenceId];
      const update = { ...data, preferenceId: data.revisionId, key: original.key, scope: original.scope };
      insertPreference(state, preferenceRecord(update, { basis: 'explicit_correction', supersedes: original.id }, key, revision));
    } else if (kind === 'choice') {
      check(!own(state.choices, data.choiceId), 'PERSONALIZATION_ID_CONFLICT');
      const current = effective(state, data.scope, data.at);
      for (const item of data.criteria) {
        check(own(state.preferences, item.preferenceId), 'PERSONALIZATION_PREFERENCE_NOT_FOUND');
        const preference = state.preferences[item.preferenceId];
        check(applies(preference.scope, data.scope), 'PERSONALIZATION_SCOPE_MISMATCH');
        check(current.get(preference.key)?.id === preference.id, 'PERSONALIZATION_EVIDENCE_INVALID');
      }
      state.choices[data.choiceId] = { id: data.choiceId, scope: data.scope, candidateId: data.candidateId,
        reason: data.reason, criteria: data.criteria, sourceRef: data.sourceRef, at: data.at,
        eventKey: key, revision };
    } else {
      check(own(state.choices, data.choiceId), 'PERSONALIZATION_CHOICE_NOT_FOUND');
      check(!own(state.feedback, data.feedbackId), 'PERSONALIZATION_ID_CONFLICT');
      const choice = state.choices[data.choiceId];
      for (const update of data.updates) {
        const entry = { ...update, scope: choice.scope, sourceRef: data.sourceRef, at: data.at };
        insertPreference(state, preferenceRecord(entry, { basis: 'after_use',
          choiceId: choice.id, feedbackId: data.feedbackId }, key, revision));
      }
      state.feedback[data.feedbackId] = { id: data.feedbackId, choiceId: choice.id, scope: choice.scope,
        basis: 'after_use', outcome: data.outcome, summary: data.summary, updates: data.updates,
        sourceRef: data.sourceRef, at: data.at, eventKey: key, revision };
    }
    state.events[key] = event;
    state.revision = revision;
    state.updatedAt = data.at;
  }
  function validateState(value) {
    try {
      const code = 'PERSONALIZATION_STATE_INVALID', state = clean(value, code);
      fields(state, ['schema', 'apiVersion', 'ownerScope', 'createdAt', 'updatedAt', 'revision',
        'preferences', 'choices', 'feedback', 'events'], [], code);
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
        check(EVENT_KINDS.includes(event.kind) && event.revision === restored.revision + 1, code);
        const data = payload(event.kind, { ...event.payload, expectedRevision: restored.revision });
        check(same(data, event.payload) && event.at === data.at && event.eventId === eventId(event.kind, data) &&
          key === eventKey(event.kind, data) && event.fingerprint === digest({ kind: event.kind, payload: data }), code);
        applyEvent(restored, event.kind, data, event);
      }
      check(same(restored, state), code);
      return state;
    } catch (error) {
      if (error && error.code === 'PERSONALIZATION_STATE_CAPACITY') throw error;
      fail('PERSONALIZATION_STATE_INVALID');
    }
  }
  function mutate(value, input, kind) {
    const state = validateState(value), data = payload(kind, input), key = eventKey(kind, data);
    const identity = digest({ kind, payload: data }), result = resultFor(kind, data);
    if (own(state.events, key)) {
      check(state.events[key].fingerprint === identity, 'PERSONALIZATION_ID_CONFLICT');
      return { state, result: { ...result, duplicate: true, changed: false, revision: state.revision } };
    }
    check(input.expectedRevision === state.revision, 'PERSONALIZATION_REVISION_CONFLICT');
    const event = { eventId: eventId(kind, data), kind, payload: data, at: data.at,
      revision: state.revision + 1, fingerprint: identity };
    applyEvent(state, kind, data, event);
    capacity(state);
    return { state, result: { ...result, duplicate: false, changed: true, revision: state.revision } };
  }
  function recordPreference(state, input) { return mutate(state, input, 'preference'); }
  function revisePreference(state, input) { return mutate(state, input, 'revision'); }
  function recordChoice(state, input) { return mutate(state, input, 'choice'); }
  function recordFeedback(state, input) { return mutate(state, input, 'feedback'); }

  function unit(value) {
    check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
    return value;
  }
  function contextInput(value = {}) {
    fields(value, [], ['mode', 'priorities', 'constraints']);
    const result = { mode: own(value, 'mode') ? normalizedText(value.mode, 80) : null,
      priorities: [], constraints: [] };
    if (own(value, 'priorities')) {
      check(Array.isArray(value.priorities) && value.priorities.length <= 20);
      result.priorities = value.priorities.map(item => {
        fields(item, ['key', 'direction', 'weight', 'reason', 'sourceRef']);
        return { ...without(criterion({ ...item, status: 'confirmed' }, false), ['status']),
          sourceRef: normalizedText(item.sourceRef, 500) };
      });
      check(new Set(result.priorities.map(item => item.key)).size === result.priorities.length);
    }
    if (own(value, 'constraints')) {
      check(Array.isArray(value.constraints) && value.constraints.length <= 20);
      result.constraints = value.constraints.map(item => {
        fields(item, ['key', 'operator', 'value', 'reason', 'sourceRef']);
        check(['gte', 'lte'].includes(item.operator));
        return { key: token(item.key, undefined, true), operator: item.operator, value: unit(item.value),
          reason: normalizedText(item.reason, 800), sourceRef: normalizedText(item.sourceRef, 500) };
      });
      check(new Set(result.constraints.map(item => item.key + ':' + item.operator)).size === result.constraints.length);
    }
    return result;
  }
  function candidateInput(value) {
    fields(value, ['id', 'label', 'features', 'sourceRefs']);
    plain(value.features);
    check(Object.keys(value.features).length <= 32);
    const features = {};
    for (const [rawKey, feature] of Object.entries(value.features)) {
      const key = token(rawKey, undefined, true);
      check(!own(features, key));
      features[key] = feature === null ? null : unit(feature);
    }
    return { id: token(value.id), label: normalizedText(value.label, 160), features,
      sourceRefs: sourceRefs(value.sourceRefs) };
  }
  function explainCriterion(item) {
    return { key: item.key, direction: item.direction, weight: item.weight, status: item.status,
      basis: item.basis, criterionId: item.id, scope: item.scope, sourceRefs: [item.sourceRef], reason: item.reason };
  }
  const rounded = value => Math.round(value * 1e12) / 1e12;
  function rank(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['at', 'scope', 'candidates'], ['context']);
    const at = iso(raw.at), currentScope = scope(raw.scope), context = contextInput(raw.context);
    check(Date.parse(at) >= Date.parse(state.createdAt), 'PERSONALIZATION_TIME_ORDER');
    check(Array.isArray(raw.candidates) && raw.candidates.length >= 1 && raw.candidates.length <= 20);
    const candidates = raw.candidates.map(candidateInput);
    check(new Set(candidates.map(item => item.id)).size === candidates.length);
    const winners = new Map([...effective(state, currentScope, at)].map(([key, item]) => [key, explainCriterion(item)]));
    for (const priority of context.priorities) {
      winners.set(priority.key, { key: priority.key, direction: priority.direction, weight: priority.weight,
        status: 'confirmed', basis: 'current', criterionId: null, scope: currentScope,
        sourceRefs: [priority.sourceRef], reason: priority.reason });
    }
    const selected = [...winners.values()].sort((a, b) => cmp(a.key, b.key));
    check(selected.length <= 100, 'PERSONALIZATION_STATE_CAPACITY');
    const effectiveCriteria = selected.filter(item => item.status === 'confirmed');
    const unresolved = selected.filter(item => item.status === 'uncertain');
    const totalWeight = effectiveCriteria.reduce((total, item) => total + item.weight, 0);
    const ranks = [], excluded = [];
    for (const candidate of candidates) {
      const failures = [];
      for (const constraint of context.constraints) {
        const value = own(candidate.features, constraint.key) ? candidate.features[constraint.key] : null;
        const unknown = value === null;
        const fits = !unknown && (constraint.operator === 'gte' ? value >= constraint.value : value <= constraint.value);
        if (!fits) failures.push({ key: constraint.key, code: unknown ? 'constraint_unknown' : 'constraint_mismatch',
          value, operator: constraint.operator, required: constraint.value, reason: constraint.reason,
          sourceRefs: [...new Set([...candidate.sourceRefs, constraint.sourceRef])].sort(cmp) });
      }
      if (failures.length) {
        excluded.push({ candidateId: candidate.id, label: candidate.label, reasons: failures, sourceRefs: candidate.sourceRefs });
        continue;
      }
      let sum = 0, knownWeight = 0;
      const reasons = effectiveCriteria.map(criterion => {
        const value = own(candidate.features, criterion.key) ? candidate.features[criterion.key] : null;
        const fit = value === null ? null : criterion.direction === 'higher' ? value : 1 - value;
        if (fit !== null) { sum += fit * criterion.weight; knownWeight += criterion.weight; }
        return { key: criterion.key, status: fit === null ? 'unknown' : 'known', value, fit,
          weight: criterion.weight, criterionId: criterion.criterionId,
          sourceRefs: [...new Set([...candidate.sourceRefs, ...criterion.sourceRefs])].sort(cmp), reason: criterion.reason };
      });
      ranks.push({ candidateId: candidate.id, label: candidate.label,
        score: totalWeight ? rounded(sum / totalWeight) : null,
        scoreUpper: totalWeight ? rounded((sum + totalWeight - knownWeight) / totalWeight) : null,
        coverage: totalWeight ? rounded(knownWeight / totalWeight) : 0, reasons, sourceRefs: candidate.sourceRefs });
    }
    ranks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.coverage - a.coverage || cmp(a.candidateId, b.candidateId));
    excluded.sort((a, b) => cmp(a.candidateId, b.candidateId));
    const output = { ranks, excluded, effectiveCriteria, unresolved, context,
      featureTruthVerified: false, scoreKind: 'caller_supplied_feature_fit' };
    // Explanation provenance is repeated per candidate; bound the complete
    // response as well as its inputs rather than silently dropping evidence.
    check(utf8(JSON.stringify(output)).length <= MAX_OUTPUT_BYTES - 100, 'PERSONALIZATION_OUTPUT_CAPACITY');
    output.rankingFingerprint = digest({ at, scope: currentScope, candidates, output });
    return output;
  }

  root.JHPersonalization = Object.freeze({ VERSION, SCHEMA, fingerprint, createState, validateState,
    recordPreference, revisePreference, recordChoice, recordFeedback, rank });
})(globalThis);
