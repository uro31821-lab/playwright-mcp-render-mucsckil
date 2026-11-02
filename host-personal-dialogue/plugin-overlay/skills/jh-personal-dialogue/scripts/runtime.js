/* JH host-only personal dialogue. Original portable application code.
 * Connect explicit questions, handoff attempts and two user-feedback routes.
 * Source labels are host attestations, not independent proof or execution rights.
 * No imports, network, filesystem, timers, LLM, background work or inference.
 * The host owns authorization for immutable ownerScope and when to ask.
 */
(function installJHPersonalDialogue(root) {
  'use strict';
  const VERSION = '1.0.0';
  const SCHEMA = 'jh.personal-dialogue.v1';
  const MAX_STATE_BYTES = 2 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 512 * 1024;
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
  const LIMITS = { subjects: 300, questions: 500, presentations: 1000, feedback: 2000, parkings: 1000, events: 4000 };
  const COMMON = ['expectedRevision', 'sourceRef', 'at'];
  const EVENT_IDS = { subject: 'subjectId', question: 'questionId', presentation: 'presentationId', feedback: 'feedbackId', parking: 'parkingId' };
  const SIGNALS = {
    considering: new Set(['interested', 'chosen', 'declined', 'paused', 'uncertain', 'change_requested']),
    experience: new Set(['positive', 'mixed', 'negative', 'uncertain', 'not_used']),
    preference: new Set(['confirmed', 'corrected', 'uncertain']),
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function check(value, code = 'DIALOGUE_INPUT_INVALID') {
    if (!value) fail(code);
  }
  function plain(value, code = 'DIALOGUE_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string' && !RESERVED.has(key)) &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
    return descriptors;
  }
  function fields(value, required, optional = [], code = 'DIALOGUE_INPUT_INVALID') {
    plain(value, code);
    check(required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
  }
  function integer(value, min, max, code = 'DIALOGUE_INPUT_INVALID') {
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
  function text(value, max, code = 'DIALOGUE_INPUT_INVALID', empty = false) {
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
  function normalizedText(value, max, code = 'DIALOGUE_INPUT_INVALID', empty = false) {
    text(value, max, code, empty);
    const result = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    text(result, max, code, empty);
    check(!credential(result), code);
    return result;
  }
  function token(value, code = 'DIALOGUE_INPUT_INVALID', lower = false) {
    const result = normalizedText(value, 160, code);
    const normalized = lower ? result.toLowerCase() : result;
    check(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(normalized) &&
      !RESERVED.has(normalized.toLowerCase()), code);
    return normalized;
  }
  function iso(value, code = 'DIALOGUE_INPUT_INVALID') {
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
  function hash(value, code = 'DIALOGUE_INPUT_INVALID') {
    check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), code);
    return value;
  }
  function uniqueTokens(value, max, code = 'DIALOGUE_INPUT_INVALID', allowEmpty = true) {
    check(Array.isArray(value) && value.length <= max && (allowEmpty || value.length > 0), code);
    const result = value.map(item => token(item, code));
    check(new Set(result).size === result.length, code);
    return result;
  }
  function clean(value, code = 'DIALOGUE_INPUT_INVALID', depth = 0, budget = { nodes: 100000, chars: 0 }) {
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
  function normalizePayload(kind, input) {
    const raw = clean(input), members = {
      subject: ['subjectId', 'scope', 'label', 'reason', 'sourceKind', 'externalRef'],
      question: ['questionId', 'subjectId', 'threadId', 'kind', 'rationale', 'proposal', 'questionText', 'basedOnFeedbackId'],
      presentation: ['presentationId', 'questionId', 'threadId'],
      feedback: ['feedbackId', 'subjectId', 'threadId', 'route', 'questionId', 'phase', 'signal',
        'summary', 'reason', 'appliesTo', 'preferenceKey', 'useEvidenceRef'],
      parking: ['parkingId', 'questionId', 'threadId', 'reason'],
    };
    check(own(members, kind));
    fields(raw, [...COMMON, ...members[kind]]);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const base = { sourceRef: normalizedText(raw.sourceRef, 500), at: iso(raw.at) };
    if (kind === 'subject') {
      check(['user_explicit', 'host_reviewed'].includes(raw.sourceKind));
      let externalRef = null;
      if (raw.externalRef !== null) {
        fields(raw.externalRef, ['system', 'id']);
        check(['personalization', 'decision_learning', 'proactive_research'].includes(raw.externalRef.system));
        externalRef = { system: raw.externalRef.system, id: token(raw.externalRef.id) };
      }
      return { subjectId: token(raw.subjectId), scope: scope(raw.scope), label: normalizedText(raw.label, 160),
        reason: normalizedText(raw.reason, 800), sourceKind: raw.sourceKind, externalRef, ...base };
    }
    if (kind === 'question') {
      check(['proposal', 'experience', 'clarification'].includes(raw.kind));
      const proposal = raw.proposal === null ? null : normalizedText(raw.proposal, 1000);
      check(raw.kind === 'proposal' ? proposal !== null : proposal === null);
      return { questionId: token(raw.questionId), subjectId: token(raw.subjectId), threadId: token(raw.threadId),
        kind: raw.kind, rationale: normalizedText(raw.rationale, 800), proposal,
        questionText: normalizedText(raw.questionText, 500),
        basedOnFeedbackId: raw.basedOnFeedbackId === null ? null : token(raw.basedOnFeedbackId), ...base };
    }
    if (kind === 'presentation') return { presentationId: token(raw.presentationId),
      questionId: token(raw.questionId), threadId: token(raw.threadId), ...base };
    if (kind === 'parking') return { parkingId: token(raw.parkingId),
      questionId: token(raw.questionId), threadId: token(raw.threadId),
      reason: normalizedText(raw.reason, 800), ...base };
    check(['spontaneous', 'elicited'].includes(raw.route) && own(SIGNALS, raw.phase) && SIGNALS[raw.phase].has(raw.signal));
    check(['this_task', 'ongoing', 'unspecified'].includes(raw.appliesTo));
    const questionId = raw.questionId === null ? null : token(raw.questionId);
    check(raw.route === 'spontaneous' ? questionId === null : questionId !== null);
    const preferenceKey = raw.preferenceKey === null ? null : token(raw.preferenceKey, undefined, true);
    check(raw.phase === 'preference' ? preferenceKey !== null : preferenceKey === null);
    const useEvidenceRef = raw.useEvidenceRef === null ? null : normalizedText(raw.useEvidenceRef, 500);
    if (raw.phase !== 'experience' || raw.signal === 'not_used') check(useEvidenceRef === null);
    else if (['positive', 'mixed', 'negative'].includes(raw.signal)) check(useEvidenceRef !== null);
    return { feedbackId: token(raw.feedbackId), subjectId: token(raw.subjectId), threadId: token(raw.threadId),
      route: raw.route, questionId, phase: raw.phase, signal: raw.signal,
      summary: normalizedText(raw.summary, 1200), reason: raw.reason === null ? null : normalizedText(raw.reason, 800),
      appliesTo: raw.appliesTo, preferenceKey, useEvidenceRef, ...base };
  }
  function eventKey(kind, data) { return kind + ':' + data[EVENT_IDS[kind]]; }
  function emptyState(ownerScope, now) {
    return { schema: SCHEMA, apiVersion: VERSION, ownerScope, createdAt: now, updatedAt: now, revision: 0,
      subjects: {}, questions: {}, presentations: {}, feedback: {}, parkings: {}, events: {} };
  }
  function createState(input) {
    input = clean(input);
    fields(input, ['ownerScope', 'now']);
    return emptyState(normalizedText(input.ownerScope, 160), iso(input.now));
  }
  function capacity(state) {
    for (const [name, limit] of Object.entries(LIMITS)) {
      plain(state[name], 'DIALOGUE_STATE_INVALID');
      check(Object.keys(state[name]).length <= limit, 'DIALOGUE_STATE_CAPACITY');
    }
    check(utf8(JSON.stringify(state)).length <= MAX_STATE_BYTES, 'DIALOGUE_STATE_CAPACITY');
  }
  function boundedOutput(value) {
    check(utf8(JSON.stringify(value)).length <= MAX_OUTPUT_BYTES, 'DIALOGUE_OUTPUT_CAPACITY');
    return value;
  }
  function timeOrder(at, earliest) { check(Date.parse(at) >= Date.parse(earliest), 'DIALOGUE_TIME_ORDER'); }
  function subjectOf(state, subjectId) {
    check(own(state.subjects, subjectId), 'DIALOGUE_SUBJECT_NOT_FOUND');
    return state.subjects[subjectId];
  }
  function questionOf(state, questionId) {
    check(own(state.questions, questionId), 'DIALOGUE_QUESTION_NOT_FOUND');
    return state.questions[questionId];
  }
  function insert(map, id, record) {
    check(!own(map, id), 'DIALOGUE_ID_CONFLICT');
    map[id] = record;
  }
  function pendingInThread(state, threadId) {
    return Object.values(state.questions).find(question => question.threadId === threadId && question.status === 'asked') || null;
  }
  function updateQuestion(question, status, at, revision) {
    question.status = status; question.updatedAt = at; question.statusRevision = revision;
  }
  function applyEvent(state, kind, data, event) {
    const key = eventKey(kind, data), revision = event.revision, metadata = { eventKey: key, revision };
    timeOrder(data.at, state.updatedAt);
    if (kind === 'subject') {
      insert(state.subjects, data.subjectId, { id: data.subjectId, ...without(data, ['subjectId']), ...metadata });
    } else if (kind === 'question') {
      subjectOf(state, data.subjectId);
      check(!Object.values(state.questions).some(question => question.subjectId === data.subjectId &&
        question.threadId === data.threadId && question.kind === data.kind), 'DIALOGUE_QUESTION_DUPLICATE');
      if (data.basedOnFeedbackId !== null) {
        check(own(state.feedback, data.basedOnFeedbackId), 'DIALOGUE_FEEDBACK_NOT_FOUND');
        check(state.feedback[data.basedOnFeedbackId].subjectId === data.subjectId, 'DIALOGUE_SUBJECT_MISMATCH');
      }
      insert(state.questions, data.questionId, { id: data.questionId, ...without(data, ['questionId']),
        status: 'draft', updatedAt: data.at, statusRevision: revision,
        presentationId: null, feedbackId: null, parkingId: null, ...metadata });
    } else if (kind === 'presentation') {
      const question = questionOf(state, data.questionId);
      check(question.threadId === data.threadId, 'DIALOGUE_THREAD_MISMATCH');
      check(question.status === 'draft', 'DIALOGUE_QUESTION_STATE');
      check(pendingInThread(state, data.threadId) === null, 'DIALOGUE_PENDING_QUESTION');
      insert(state.presentations, data.presentationId, { id: data.presentationId,
        ...without(data, ['presentationId']), subjectId: question.subjectId,
        deliveryStatus: 'handoff_attempted', userReadVerified: false, ...metadata });
      updateQuestion(question, 'asked', data.at, revision); question.presentationId = data.presentationId;
    } else if (kind === 'parking') {
      const question = questionOf(state, data.questionId);
      check(question.threadId === data.threadId, 'DIALOGUE_THREAD_MISMATCH');
      check(['draft', 'asked'].includes(question.status), 'DIALOGUE_QUESTION_STATE');
      insert(state.parkings, data.parkingId, { id: data.parkingId, ...without(data, ['parkingId']),
        subjectId: question.subjectId, basis: 'host_context_change', ...metadata });
      updateQuestion(question, 'parked', data.at, revision); question.parkingId = data.parkingId;
    } else {
      const subject = subjectOf(state, data.subjectId);
      let question = null;
      if (data.route === 'elicited') {
        question = questionOf(state, data.questionId);
        check(question.subjectId === data.subjectId, 'DIALOGUE_SUBJECT_MISMATCH');
        check(question.threadId === data.threadId, 'DIALOGUE_THREAD_MISMATCH');
        check(question.status === 'asked', 'DIALOGUE_QUESTION_STATE');
        check(question.kind === 'clarification' ||
          (question.kind === 'proposal' && data.phase === 'considering') ||
          (question.kind === 'experience' && data.phase === 'experience'), 'DIALOGUE_PHASE_MISMATCH');
      }
      insert(state.feedback, data.feedbackId, { id: data.feedbackId, ...without(data, ['feedbackId']),
        scope: subject.scope, sourceAuthority: 'user_explicit',
        afterUseReported: data.phase === 'experience' && data.useEvidenceRef !== null && data.signal !== 'not_used',
        ...metadata });
      if (question !== null) {
        updateQuestion(question, data.signal === 'paused' ? 'deferred' : data.signal === 'declined' ? 'dismissed' : 'answered',
          data.at, revision);
        question.feedbackId = data.feedbackId;
      }
    }
    state.events[key] = event; state.revision = revision; state.updatedAt = data.at;
  }
  function validateState(value) {
    try {
      const code = 'DIALOGUE_STATE_INVALID', state = clean(value, code);
      fields(state, ['schema', 'apiVersion', 'ownerScope', 'createdAt', 'updatedAt', 'revision',
        'subjects', 'questions', 'presentations', 'feedback', 'parkings', 'events'], [], code);
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
      if (error && error.code === 'DIALOGUE_STATE_CAPACITY') throw error;
      fail('DIALOGUE_STATE_INVALID');
    }
  }
  function resultFor(kind, data) {
    const result = { [EVENT_IDS[kind]]: data[EVENT_IDS[kind]] };
    if (['question', 'feedback'].includes(kind)) result.subjectId = data.subjectId;
    if (['presentation', 'feedback', 'parking'].includes(kind)) result.questionId = data.questionId;
    return result;
  }
  function mutate(value, input, kind) {
    const state = validateState(value), data = normalizePayload(kind, input), key = eventKey(kind, data);
    const identity = digest({ kind, payload: data }), result = resultFor(kind, data);
    if (own(state.events, key)) {
      check(state.events[key].fingerprint === identity, 'DIALOGUE_ID_CONFLICT');
      return { state, result: { ...result, duplicate: true, changed: false, revision: state.revision } };
    }
    check(input.expectedRevision === state.revision, 'DIALOGUE_REVISION_CONFLICT');
    const event = { eventId: data[EVENT_IDS[kind]], kind, payload: data, at: data.at,
      revision: state.revision + 1, fingerprint: identity };
    applyEvent(state, kind, data, event);
    capacity(state);
    return { state, result: { ...result, duplicate: false, changed: true, revision: state.revision } };
  }
  function recordSubject(state, input) { return mutate(state, input, 'subject'); }
  function recordQuestion(state, input) { return mutate(state, input, 'question'); }
  function markAsked(state, input) { return mutate(state, input, 'presentation'); }
  function recordFeedback(state, input) { return mutate(state, input, 'feedback'); }
  function parkQuestion(state, input) { return mutate(state, input, 'parking'); }

  function readContext(value, input, optional = []) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['scope', 'threadId', 'at'], optional);
    const currentScope = scope(raw.scope), threadId = token(raw.threadId), at = iso(raw.at);
    timeOrder(at, state.updatedAt);
    return { state, raw, currentScope, threadId, at };
  }
  function questionView(state, question, includeParking = false) {
    if (question === null) return null;
    const value = { question, subject: state.subjects[question.subjectId] };
    if (includeParking) value.parking = question.parkingId === null ? null : state.parkings[question.parkingId];
    return value;
  }
  function planQuestion(value, input) {
    const { state, currentScope, threadId } = readContext(value, input);
    const pending = pendingInThread(state, threadId);
    const drafts = Object.values(state.questions).filter(question => question.threadId === threadId &&
      question.status === 'draft' && same(state.subjects[question.subjectId].scope, currentScope))
      .sort((a, b) => a.revision - b.revision || cmp(a.id, b.id));
    const question = pending || drafts[0] || null, subject = question ? state.subjects[question.subjectId] : null;
    const shouldAsk = pending === null && question !== null;
    const sourceRefs = question ? [subject.sourceRef, question.sourceRef] : [];
    if (question && question.basedOnFeedbackId !== null) sourceRefs.push(state.feedback[question.basedOnFeedbackId].sourceRef);
    return boundedOutput({ threadId, scope: currentScope, shouldAsk,
      reason: pending ? 'awaiting_reply' : question ? 'draft_available' : 'no_draft',
      question, subject, promptPreview: shouldAsk ? question.rationale + ' ' +
        (question.proposal === null ? '' : question.proposal + ' ') + question.questionText : null,
      sourceRefs: [...new Set(sourceRefs)], authorizesExecution: false, userReadVerified: false });
  }
  function feedbackSummary(item) {
    return { id: item.id, subjectId: item.subjectId, threadId: item.threadId, questionId: item.questionId,
      summary: item.summary, reason: item.reason, scope: item.scope, sourceRef: item.sourceRef,
      route: item.route, phase: item.phase, signal: item.signal, appliesTo: item.appliesTo,
      preferenceKey: item.preferenceKey, useEvidenceRef: item.useEvidenceRef,
      afterUseReported: item.afterUseReported, sourceAuthority: item.sourceAuthority, at: item.at };
  }
  function dialogueContext(value, input) {
    const { state, raw, currentScope, threadId } = readContext(value, input, ['limit']);
    const limit = raw.limit === undefined ? 5 : integer(raw.limit, 1, 10);
    const matching = Object.values(state.feedback).filter(item => same(item.scope, currentScope))
      .sort((a, b) => b.revision - a.revision || cmp(a.id, b.id));
    const ongoing = new Map(), currentTask = new Map();
    for (const item of matching) {
      if (item.phase !== 'preference') continue;
      if (item.appliesTo === 'ongoing' && !ongoing.has(item.preferenceKey)) ongoing.set(item.preferenceKey, item);
      if (item.appliesTo === 'this_task' && item.threadId === threadId && !currentTask.has(item.preferenceKey)) {
        currentTask.set(item.preferenceKey, item);
      }
    }
    const ongoingItems = [...ongoing.values()];
    const allQuestions = Object.values(state.questions).filter(question => question.threadId === threadId &&
      same(state.subjects[question.subjectId].scope, currentScope));
    const drafts = allQuestions.filter(question => question.status === 'draft')
      .sort((a, b) => a.revision - b.revision || cmp(a.id, b.id));
    const recent = [...allQuestions].sort((a, b) => b.statusRevision - a.statusRevision || cmp(a.id, b.id));
    return boundedOutput({ scope: currentScope, threadId, items: matching.slice(0, limit).map(feedbackSummary),
      totalAvailable: matching.length, omitted: Math.max(0, matching.length - limit), limit,
      pendingQuestion: questionView(state, pendingInThread(state, threadId)),
      draftQuestions: drafts.slice(0, 10).map(question => questionView(state, question)),
      draftsOmitted: Math.max(0, drafts.length - 10),
      recentQuestions: recent.slice(0, 5).map(question => questionView(state, question, true)),
      questionsOmitted: Math.max(0, recent.length - 5),
      knownPreferences: ongoingItems.filter(item => item.signal !== 'uncertain').map(feedbackSummary),
      unresolvedPreferences: ongoingItems.filter(item => item.signal === 'uncertain').map(feedbackSummary),
      currentTaskPreferences: [...currentTask.values()].map(feedbackSummary),
      authorizesExecution: false, userReadVerified: false, infersPreferences: false });
  }

  root.JHPersonalDialogue = Object.freeze({ VERSION, SCHEMA, fingerprint, createState, validateState,
    recordSubject, recordQuestion, markAsked, recordFeedback, parkQuestion, planQuestion, dialogueContext });
})(globalThis);
