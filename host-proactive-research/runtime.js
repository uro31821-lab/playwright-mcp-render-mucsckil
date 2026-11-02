/*
 * JH host-only proactive research, v1.
 * Pure JSON state transitions; injected read-only search/fetch callbacks.
 * No imports, network transport, filesystem, credentials, background schedule,
 * device commands, model training, or automatic implementation.
 * Topic grouping and review are explicit host judgments. Retrieved text is
 * untrusted evidence, never an instruction. Hashes detect content identity;
 * they do not authenticate a provider or independently verify a factual claim.
 *
 * Portable side-effect module: import it or evaluate the source, then use
 * globalThis.JHProactiveResearch. Collection requires host timers solely to
 * bound pending provider calls; the pure state APIs need no Web globals.
 */
(function installJHProactiveResearch(root) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA = 'jh.proactive-research.v1';
  const PACKET_SCHEMA = 'jh.proactive-research.packet.v1';
  const RUN_SCHEMA = 'jh.proactive-research.run.v1';
  const MAX_STATE_BYTES = 2 * 1024 * 1024;
  const MAX_TEXT = 16000;
  const MAX_EXCERPT = 500;
  const WINDOW_MS = 30 * 86400000;
  const COOLDOWN_MS = 7 * 86400000;
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
  const KINDS = new Set(['question', 'problem', 'explicit', 'continue', 'status']);
  const TOPIC_STATUSES = new Set(['active', 'snoozed', 'dismissed', 'resolved']);
  const SOURCE_KINDS = new Set(['official', 'source', 'paper', 'other']);
  const PACKET_STATUSES = new Set(['complete', 'partial', 'failed', 'empty']);
  const PROVIDER_CODES = new Set([
    'PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'PROVIDER_RESPONSE_INVALID',
    'PUBLIC_URL_REQUIRED', 'UNEXPECTED_REDIRECT', 'FETCH_TEXT_LIMIT',
    'FETCH_TIME_INVALID', 'SOURCE_CONFLICT', 'RESULTS_TRUNCATED',
    'FETCH_TEXT_EMPTY',
  ]);
  const MAP_LIMITS = {
    topics: 200, observations: 5000, decisions: 1000,
    runs: 500, checkpoints: 1500, proposals: 500, receipts: 1000,
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function check(value, code = 'PROACTIVE_INPUT_INVALID') {
    if (!value) fail(code);
  }
  function plain(value, code = 'PROACTIVE_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string' && !RESERVED.has(key)) &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
    return descriptors;
  }
  function fields(value, required, optional = [], code = 'PROACTIVE_INPUT_INVALID') {
    plain(value, code);
    check(required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
  }
  function integer(value, min, max, code = 'PROACTIVE_INPUT_INVALID') {
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
  function text(value, max, code = 'PROACTIVE_INPUT_INVALID', empty = false) {
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
  function normalizedText(value, max, code = 'PROACTIVE_INPUT_INVALID', empty = false) {
    text(value, max, code, empty);
    const result = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    text(result, max, code, empty);
    check(!credential(result), code);
    return result;
  }
  function token(value, code = 'PROACTIVE_INPUT_INVALID', lower = false) {
    const result = normalizedText(value, 160, code);
    const normalized = lower ? result.toLowerCase() : result;
    check(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(normalized) &&
      !RESERVED.has(normalized.toLowerCase()), code);
    return normalized;
  }
  function iso(value, code = 'PROACTIVE_INPUT_INVALID') {
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
  function hash(value, code = 'PROACTIVE_INPUT_INVALID') {
    check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), code);
    return value;
  }
  function uniqueTokens(value, max, code = 'PROACTIVE_INPUT_INVALID', allowEmpty = true) {
    check(Array.isArray(value) && value.length <= max && (allowEmpty || value.length > 0), code);
    const result = value.map(item => token(item, code));
    check(new Set(result).size === result.length, code);
    return result;
  }
  function query(value, code = 'PROACTIVE_QUERY_UNSAFE') {
    const result = normalizedText(value, 180, code);
    check(!/(?:https?|ftp|file|data):|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}[/\\]/i.test(result) &&
      !/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(result) &&
      !/\b[A-Za-z0-9+/_=-]{40,}\b/.test(result) &&
      !/(?:^|\s)(?:\+?\d[\d() -]{8,}\d)(?:$|\s)/.test(result) &&
      !/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(result), code);
    return result;
  }
  function queries(value, code = 'PROACTIVE_QUERY_UNSAFE') {
    check(Array.isArray(value) && value.length >= 1 && value.length <= 2, code);
    const result = value.map(item => query(item, code));
    check(new Set(result.map(item => item.toLowerCase())).size === result.length, code);
    return result;
  }

  // Deliberately narrow, portable public-HTTPS parser. The host additionally
  // enforces DNS, redirect and transport policy; syntax alone cannot prove DNS.
  function publicURL(value, code = 'PROACTIVE_URL_INVALID') {
    text(value, 2048, code);
    check(!/[\s\\\u0000-\u001f\u007f]/.test(value) && !credential(value), code);
    const match = /^https:\/\/([^/?#]+)([^#]*)(?:#.*)?$/i.exec(value);
    check(match, code);
    const hostname = match[1].toLowerCase();
    check(!/[@:%\[\]]/.test(hostname) && hostname.length <= 253 &&
      hostname.includes('.') && !hostname.endsWith('.'), code);
    const labels = hostname.split('.');
    check(labels.every(label => label.length >= 1 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
      /^[a-z][a-z0-9-]{1,62}$/.test(labels[labels.length - 1]) &&
      !labels.some(label => ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'onion'].includes(label)) &&
      !/(?:^|\.)(?:nip\.io|sslip\.io|localtest\.me|lvh\.me|localhost\.run)$/.test(hostname), code);
    // Reject numeric/hex IP spellings and embedded local IPv4 host aliases.
    check(!labels.every(label => /^(?:\d+|0x[0-9a-f]+)$/.test(label)) &&
      !/(?:^|[.-])(?:127|10|169[.-]254|192[.-]168|172[.-](?:1[6-9]|2\d|3[01]))(?:[.-]\d+){1,3}(?:[.-]|$)/.test(hostname), code);
    let path = match[2] || '/';
    if (path.startsWith('?')) path = '/' + path;
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { fail(code); }
    check(path.startsWith('/') && !/[\u0000-\u001f\u007f\\]/.test(decoded) &&
      !/[?&](?:access_token|token|api_key|apikey|secret|password|authorization|signature|x-amz-credential|x-amz-signature)=/i.test(decoded), code);
    return 'https://' + hostname + path;
  }

  function clean(value, code = 'PROACTIVE_INPUT_INVALID', depth = 0, budget = { nodes: 100000, chars: 0 }) {
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
  function capacity(state) {
    for (const name of Object.keys(MAP_LIMITS)) {
      check(Object.keys(state[name]).length <= MAP_LIMITS[name], 'PROACTIVE_STATE_CAPACITY');
    }
    check(utf8(JSON.stringify(state)).length <= MAX_STATE_BYTES, 'PROACTIVE_STATE_CAPACITY');
  }
  function checkedTime(at, earliest) {
    check(Date.parse(at) >= Date.parse(earliest), 'PROACTIVE_TIME_ORDER');
  }
  function cas(state, expected) {
    integer(expected, 0, Number.MAX_SAFE_INTEGER);
    check(expected === state.revision, 'PROACTIVE_REVISION_CONFLICT');
  }
  function response(state, extra, changed = false, duplicate = false) {
    return { state, result: { duplicate, changed, revision: state.revision, ...extra } };
  }
  function commit(state, at, extra) {
    check(state.revision < Number.MAX_SAFE_INTEGER, 'PROACTIVE_STATE_CAPACITY');
    state.revision++;
    if (Date.parse(at) > Date.parse(state.updatedAt)) state.updatedAt = at;
    capacity(state);
    return response(state, extra, true, false);
  }
  function replay(state, previous, identity, extra) {
    check(previous.fingerprint === identity, 'PROACTIVE_ID_CONFLICT');
    return response(state, extra, false, true);
  }
  function topicBinding(topic) {
    return digest({ topicId: topic.topicId, decisionRevision: topic.decisionRevision,
      queries: topic.publicQueries, queryReviewed: topic.queryReviewed });
  }
  function runPlan(run) {
    return { schema: RUN_SCHEMA, runId: run.runId, topicId: run.topicId, createdAt: run.createdAt,
      queries: run.queries, requestIds: run.requestIds, topicFingerprint: run.topicFingerprint,
      decisionRevision: run.decisionRevision };
  }
  function sourceID(url, contentHash) { return 'source-' + digest({ url, contentHash }); }
  function sourceRecord(value, code = 'PROACTIVE_PACKET_INVALID') {
    fields(value, ['id', 'url', 'title', 'retrievedAt', 'kind', 'contentHash', 'excerpt',
      'contentChars', 'contentScope', 'status'], [], code);
    token(value.id, code);
    check(publicURL(value.url, code) === value.url, code);
    check(normalizedText(value.title, 240, code) === value.title, code);
    check(iso(value.retrievedAt, code) === value.retrievedAt, code);
    check(SOURCE_KINDS.has(value.kind) && value.status === 'fetched' &&
      value.contentScope === 'fetched_excerpt', code);
    hash(value.contentHash, code);
    text(value.excerpt, MAX_EXCERPT, code);
    integer(value.contentChars, 1, MAX_TEXT, code);
    check(value.excerpt.length <= value.contentChars &&
      value.id === sourceID(value.url, value.contentHash), code);
    // If the entire returned text fits the stored excerpt, verify its hash too.
    if (value.contentChars <= MAX_EXCERPT) {
      check(value.excerpt.length === value.contentChars && sha256(value.excerpt) === value.contentHash, code);
    }
    return value;
  }
  function packetStatus(sources, errors) {
    return sources.length ? (errors.length ? 'partial' : 'complete') : (errors.length ? 'failed' : 'empty');
  }
  function validatePacket(value, run) {
    const code = 'PROACTIVE_PACKET_INVALID';
    const packet = clean(value, code);
    fields(packet, ['schema', 'runId', 'topicId', 'planFingerprint', 'status', 'queryResults', 'sources',
      'errors', 'limits', 'sourceRetrievalAttested', 'independentFactVerification',
      'authorizesExecution', 'packetFingerprint'], [], code);
    check(packet.schema === PACKET_SCHEMA && packet.runId === run.runId && packet.topicId === run.topicId &&
      packet.planFingerprint === run.planFingerprint && PACKET_STATUSES.has(packet.status), code);
    check(packet.sourceRetrievalAttested === true && packet.independentFactVerification === false &&
      packet.authorizesExecution === false, code);
    fields(packet.limits, ['maxSources', 'maxTextChars', 'maxExcerptChars'], [], code);
    integer(packet.limits.maxSources, 1, 6, code);
    check(packet.limits.maxTextChars === MAX_TEXT && packet.limits.maxExcerptChars === MAX_EXCERPT, code);
    check(Array.isArray(packet.queryResults) && packet.queryResults.length === run.queries.length &&
      Array.isArray(packet.sources) && packet.sources.length <= packet.limits.maxSources &&
      Array.isArray(packet.errors) && packet.errors.length <= 64, code);
    const allowed = new Set();
    packet.queryResults.forEach((result, index) => {
      fields(result, ['query', 'status', 'results'], ['errorCode'], code);
      check(result.query === run.queries[index] && ['ok', 'error'].includes(result.status) &&
        Array.isArray(result.results) && result.results.length <= 6, code);
      if (result.status === 'error') {
        check(PROVIDER_CODES.has(result.errorCode) && result.results.length === 0, code);
      } else check(!own(result, 'errorCode'), code);
      const seen = new Set();
      result.results.forEach(item => {
        fields(item, ['url', 'title'], [], code);
        check(publicURL(item.url, code) === item.url &&
          normalizedText(item.title, 240, code) === item.title && !seen.has(item.url), code);
        seen.add(item.url); allowed.add(item.url);
      });
    });
    const urls = new Set(), ids = new Set();
    packet.sources.forEach(source => {
      sourceRecord(source, code);
      check(allowed.has(source.url) && !urls.has(source.url) && !ids.has(source.id) &&
        Date.parse(source.retrievedAt) >= Date.parse(run.createdAt), code);
      urls.add(source.url); ids.add(source.id);
    });
    packet.errors.forEach(error => {
      fields(error, ['stage', 'code'], ['queryIndex', 'url'], code);
      check(['search', 'fetch'].includes(error.stage) && PROVIDER_CODES.has(error.code), code);
      if (own(error, 'queryIndex')) integer(error.queryIndex, 0, run.queries.length - 1, code);
      if (own(error, 'url')) check(publicURL(error.url, code) === error.url && allowed.has(error.url), code);
      if (error.stage === 'search') check(own(error, 'queryIndex'), code);
      if (error.stage === 'fetch') check(own(error, 'url'), code);
    });
    packet.queryResults.forEach((result, index) => {
      if (result.status === 'error') check(packet.errors.some(error => error.stage === 'search' &&
        error.queryIndex === index && error.code === result.errorCode), code);
    });
    check(packet.status === packetStatus(packet.sources, packet.errors) &&
      packet.packetFingerprint === digest(without(packet, ['packetFingerprint'])), code);
    return packet;
  }
  function validateReview(value, packet, code = 'PROACTIVE_REVIEW_INVALID') {
    const review = clean(value, code);
    const words = ['summary', 'change', 'benefit', 'integration', 'validation', 'limitations'];
    fields(review, ['relevant'], [...words, 'sourceIds'], code);
    check(typeof review.relevant === 'boolean', code);
    if (review.relevant) check(words.every(key => own(review, key)) && own(review, 'sourceIds'), code);
    for (const key of words) {
      if (own(review, key)) review[key] = normalizedText(review[key], key === 'summary' ? 800 : 1200, code);
    }
    if (own(review, 'sourceIds')) {
      review.sourceIds = uniqueTokens(review.sourceIds, 6, code, !review.relevant).sort(cmp);
      check(review.sourceIds.every(id => packet.sources.some(source => source.id === id)), 'PROACTIVE_EVIDENCE_INVALID');
    }
    if (review.relevant) check(packet.sources.length > 0, 'PROACTIVE_EVIDENCE_INVALID');
    return review;
  }
  function proposalFingerprint(proposal) {
    // Retrieval time, titles and cosmetic summary/benefit wording do not create
    // a new proposal. Concrete change/integration/validation/limits or evidence do.
    return digest({ topicId: proposal.topicId, change: proposal.change,
      integration: proposal.integration, validation: proposal.validation, limitations: proposal.limitations,
      evidence: proposal.sources.map(source => ({ url: source.url, contentHash: source.contentHash }))
        .sort((a, b) => cmp(a.url, b.url)) });
  }
  function checkRun(run, code = 'PROACTIVE_STATE_INVALID') {
    fields(run, ['schema', 'runId', 'topicId', 'createdAt', 'queries', 'requestIds',
      'topicFingerprint', 'decisionRevision', 'planFingerprint', 'beginFingerprint',
      'status', 'completedAt', 'cancelledAt', 'completionFingerprint', 'packet', 'review',
      'proposalId', 'suppressed', 'lastCheckpointId'], [], code);
    check(run.schema === RUN_SCHEMA && token(run.runId, code) === run.runId &&
      token(run.topicId, code, true) === run.topicId && iso(run.createdAt, code) === run.createdAt, code);
    check(same(queries(run.queries, code), run.queries), code);
    uniqueTokens(run.requestIds, 5000, code, false);
    integer(run.decisionRevision, 0, Number.MAX_SAFE_INTEGER, code);
    hash(run.topicFingerprint, code); hash(run.planFingerprint, code); hash(run.beginFingerprint, code);
    check(run.planFingerprint === digest(runPlan(run)) &&
      run.beginFingerprint === digest({ runId: run.runId, topicId: run.topicId, at: run.createdAt }), code);
    check(['collecting', 'completed', 'cancelled'].includes(run.status) && typeof run.suppressed === 'boolean', code);
    if (run.lastCheckpointId !== null) token(run.lastCheckpointId, code);
    if (run.packet !== null) validatePacket(run.packet, run);
    if (run.status === 'completed') {
      check(iso(run.completedAt, code) === run.completedAt && run.cancelledAt === null &&
        Date.parse(run.completedAt) >= Date.parse(run.createdAt) && run.packet !== null && run.review !== null, code);
      const review = validateReview(run.review, run.packet, code);
      check(same(review, run.review), code);
      hash(run.completionFingerprint, code);
      check(run.completionFingerprint === digest({ runId: run.runId, at: run.completedAt, packet: run.packet, review: run.review }), code);
      if (run.proposalId !== null) token(run.proposalId, code);
    } else {
      check(run.completedAt === null && run.completionFingerprint === null && run.review === null &&
        run.proposalId === null && run.suppressed === false, code);
      if (run.status === 'cancelled') check(iso(run.cancelledAt, code) === run.cancelledAt &&
        Date.parse(run.cancelledAt) >= Date.parse(run.createdAt), code);
      else check(run.cancelledAt === null, code);
    }
    return run;
  }
  function validateState(value) {
    const code = 'PROACTIVE_STATE_INVALID';
    const state = clean(value, code);
    fields(state, ['schema', 'apiVersion', 'ownerScope', 'createdAt', 'updatedAt', 'revision',
      'topics', 'observations', 'decisions', 'runs', 'checkpoints', 'proposals', 'receipts'], [], code);
    check(state.schema === SCHEMA && state.apiVersion === VERSION &&
      normalizedText(state.ownerScope, 160, code) === state.ownerScope &&
      iso(state.createdAt, code) === state.createdAt && iso(state.updatedAt, code) === state.updatedAt &&
      Date.parse(state.updatedAt) >= Date.parse(state.createdAt), code);
    integer(state.revision, 0, Number.MAX_SAFE_INTEGER, code);
    for (const name of Object.keys(MAP_LIMITS)) plain(state[name], code);
    capacity(state);
    for (const [id, topic] of Object.entries(state.topics)) {
      fields(topic, ['topicId', 'label', 'need', 'publicQueries', 'queryReviewed', 'createdAt', 'updatedAt',
        'status', 'until', 'decisionRevision', 'lastDecisionAt', 'lastDecisionId',
        'lastResearchAt', 'lastRunId', 'consumedRequestIds'], [], code);
      check(id === topic.topicId && token(id, code, true) === id &&
        normalizedText(topic.label, 160, code) === topic.label && normalizedText(topic.need, 800, code) === topic.need &&
        same(queries(topic.publicQueries, code), topic.publicQueries) && typeof topic.queryReviewed === 'boolean' &&
        TOPIC_STATUSES.has(topic.status), code);
      check(iso(topic.createdAt, code) === topic.createdAt && iso(topic.updatedAt, code) === topic.updatedAt &&
        Date.parse(topic.createdAt) >= Date.parse(state.createdAt) && Date.parse(topic.updatedAt) >= Date.parse(topic.createdAt) &&
        Date.parse(topic.updatedAt) <= Date.parse(state.updatedAt), code);
      if (topic.until !== null) check(topic.status === 'snoozed' && iso(topic.until, code) === topic.until, code);
      integer(topic.decisionRevision, 0, state.revision, code);
      if (topic.lastDecisionAt !== null) check(iso(topic.lastDecisionAt, code) === topic.lastDecisionAt &&
        Date.parse(topic.lastDecisionAt) <= Date.parse(topic.updatedAt) && own(state.decisions, topic.lastDecisionId), code);
      else check(topic.lastDecisionId === null && topic.decisionRevision === 0 && topic.status === 'active', code);
      if (topic.lastResearchAt !== null) check(iso(topic.lastResearchAt, code) === topic.lastResearchAt &&
        Date.parse(topic.lastResearchAt) <= Date.parse(topic.updatedAt) && own(state.runs, topic.lastRunId), code);
      else check(topic.lastRunId === null, code);
      uniqueTokens(topic.consumedRequestIds, 5000, code);
    }
    const requestTimes = new Map();
    for (const [id, item] of Object.entries(state.observations)) {
      fields(item, ['observationId', 'requestId', 'sourceRef', 'at', 'topicId', 'label', 'need',
        'publicQueries', 'queryReviewed', 'kind', 'fingerprint'], [], code);
      check(item.observationId === id && token(id, code) === id && token(item.requestId, code) === item.requestId &&
        token(item.topicId, code, true) === item.topicId && own(state.topics, item.topicId) &&
        ['question', 'problem', 'explicit'].includes(item.kind) && typeof item.queryReviewed === 'boolean', code);
      check(normalizedText(item.sourceRef, 500, code) === item.sourceRef && normalizedText(item.label, 160, code) === item.label &&
        normalizedText(item.need, 800, code) === item.need && iso(item.at, code) === item.at &&
        same(queries(item.publicQueries, code), item.publicQueries) &&
        Date.parse(item.at) >= Date.parse(state.topics[item.topicId].createdAt) &&
        Date.parse(item.at) <= Date.parse(state.topics[item.topicId].updatedAt), code);
      check(item.fingerprint === digest(without(item, ['fingerprint'])), code);
      if (!requestTimes.has(item.topicId)) requestTimes.set(item.topicId, new Map());
      const times = requestTimes.get(item.topicId), previous = times.get(item.requestId);
      if (previous === undefined || Date.parse(item.at) < previous) times.set(item.requestId, Date.parse(item.at));
    }
    for (const [id, item] of Object.entries(state.decisions)) {
      fields(item, ['decisionId', 'topicId', 'status', 'until', 'reason', 'sourceRef', 'at', 'fingerprint'], [], code);
      check(item.decisionId === id && token(id, code) === id && own(state.topics, item.topicId) &&
        TOPIC_STATUSES.has(item.status) && normalizedText(item.reason, 800, code) === item.reason &&
        normalizedText(item.sourceRef, 500, code) === item.sourceRef && iso(item.at, code) === item.at, code);
      check(Date.parse(item.at) >= Date.parse(state.topics[item.topicId].createdAt) &&
        Date.parse(item.at) <= Date.parse(state.topics[item.topicId].updatedAt), code);
      if (item.until !== null) check(item.status === 'snoozed' && iso(item.until, code) === item.until &&
        Date.parse(item.until) > Date.parse(item.at), code);
      check(item.fingerprint === digest(without(item, ['fingerprint'])), code);
    }
    for (const [id, run] of Object.entries(state.runs)) {
      checkRun(run, code);
      check(run.runId === id && own(state.topics, run.topicId) &&
        Date.parse(run.createdAt) >= Date.parse(state.createdAt) &&
        Date.parse(run.createdAt) <= Date.parse(state.updatedAt), code);
      const times = requestTimes.get(run.topicId);
      check(times && run.requestIds.every(requestId => times.has(requestId) && times.get(requestId) <= Date.parse(run.createdAt)), code);
      if (run.completedAt !== null) check(Date.parse(run.completedAt) <= Date.parse(state.topics[run.topicId].updatedAt), code);
      if (run.cancelledAt !== null) check(Date.parse(run.cancelledAt) <= Date.parse(state.topics[run.topicId].updatedAt), code);
      if (run.proposalId !== null) check(own(state.proposals, run.proposalId), code);
      if (run.lastCheckpointId !== null) check(own(state.checkpoints, run.lastCheckpointId), code);
    }
    for (const [id, item] of Object.entries(state.checkpoints)) {
      fields(item, ['checkpointId', 'runId', 'at', 'packet', 'fingerprint'], [], code);
      check(item.checkpointId === id && token(id, code) === id && own(state.runs, item.runId) &&
        iso(item.at, code) === item.at, code);
      check(Date.parse(item.at) >= Date.parse(state.runs[item.runId].createdAt) &&
        Date.parse(item.at) <= Date.parse(state.topics[state.runs[item.runId].topicId].updatedAt), code);
      validatePacket(item.packet, state.runs[item.runId]);
      check(item.packet.sources.every(source => Date.parse(source.retrievedAt) <= Date.parse(item.at)), code);
      check(item.fingerprint === digest(without(item, ['fingerprint'])), code);
    }
    for (const [id, proposal] of Object.entries(state.proposals)) {
      fields(proposal, ['id', 'topicId', 'runId', 'summary', 'change', 'benefit', 'integration', 'validation',
        'limitations', 'sourceIds', 'sources', 'status', 'createdAt', 'fingerprint',
        'independentFactVerification', 'implementationVerified', 'authorizesExecution'], [], code);
      check(id === proposal.id && token(id, code) === id && own(state.topics, proposal.topicId) &&
        own(state.runs, proposal.runId) && proposal.status === 'open' &&
        iso(proposal.createdAt, code) === proposal.createdAt &&
        proposal.independentFactVerification === false && proposal.implementationVerified === false &&
        proposal.authorizesExecution === false, code);
      for (const key of ['summary', 'change', 'benefit', 'integration', 'validation', 'limitations']) {
        check(normalizedText(proposal[key], key === 'summary' ? 800 : 1200, code) === proposal[key], code);
      }
      uniqueTokens(proposal.sourceIds, 6, code, false);
      check(Array.isArray(proposal.sources) && proposal.sources.length === proposal.sourceIds.length, code);
      proposal.sources.forEach(source => sourceRecord(source, code));
      check(same(proposal.sources.map(source => source.id).sort(cmp), [...proposal.sourceIds].sort(cmp)) &&
        proposal.fingerprint === proposalFingerprint(proposal) && proposal.id === 'proposal-' + proposal.fingerprint, code);
      const run = state.runs[proposal.runId];
      check(run.status === 'completed' && run.proposalId === proposal.id && run.topicId === proposal.topicId &&
        run.completedAt === proposal.createdAt &&
        proposal.sources.every(source => run.packet.sources.some(item => same(item, source))), code);
    }
    for (const [id, receipt] of Object.entries(state.receipts)) {
      fields(receipt, ['receiptId', 'proposalIds', 'at', 'fingerprint', 'deliveryStatus', 'readVerified'], [], code);
      check(id === receipt.receiptId && token(id, code) === id && iso(receipt.at, code) === receipt.at &&
        receipt.deliveryStatus === 'handoff_attempted' && receipt.readVerified === false, code);
      uniqueTokens(receipt.proposalIds, 3, code, false);
      check(receipt.proposalIds.every(proposalId => own(state.proposals, proposalId)) &&
        receipt.fingerprint === digest({ receiptId: receipt.receiptId, proposalIds: receipt.proposalIds, at: receipt.at }), code);
      check(Date.parse(receipt.at) <= Date.parse(state.updatedAt) &&
        receipt.proposalIds.every(proposalId => Date.parse(receipt.at) >= Date.parse(state.proposals[proposalId].createdAt)), code);
    }
    // Check the live pointers after all record shapes have been checked.
    for (const topic of Object.values(state.topics)) {
      if (topic.lastDecisionId !== null) {
        const decision = state.decisions[topic.lastDecisionId];
        check(decision.topicId === topic.topicId && decision.at === topic.lastDecisionAt &&
          decision.status === topic.status && decision.until === topic.until, code);
      }
      if (topic.lastRunId !== null) {
        const run = state.runs[topic.lastRunId];
        check(run.topicId === topic.topicId && run.status === 'completed' && run.completedAt === topic.lastResearchAt, code);
      }
      const active = Object.values(state.runs).filter(run => run.topicId === topic.topicId && run.status === 'collecting');
      check(active.length <= 1 && active.every(run => run.topicFingerprint === topicBinding(topic)), code);
      const completed = Object.values(state.runs).filter(run => run.topicId === topic.topicId && run.status === 'completed');
      const consumed = [...new Set(completed.flatMap(run => run.requestIds))].sort(cmp);
      check(same(consumed, topic.consumedRequestIds), code);
      if (topic.lastRunId !== null) {
        check(completed.every(run => Date.parse(run.completedAt) <= Date.parse(topic.lastResearchAt)), code);
      } else check(completed.length === 0, code);
    }
    return state;
  }

  function createState(input) {
    input = clean(input);
    fields(input, ['ownerScope', 'now']);
    const now = iso(input.now);
    return { schema: SCHEMA, apiVersion: VERSION, ownerScope: normalizedText(input.ownerScope, 160),
      createdAt: now, updatedAt: now, revision: 0, topics: {}, observations: {}, decisions: {},
      runs: {}, checkpoints: {}, proposals: {}, receipts: {} };
  }
  function observationInput(value) {
    const input = clean(value);
    fields(input, ['expectedRevision', 'observationId', 'requestId', 'sourceRef', 'at', 'topicId',
      'label', 'need', 'publicQueries', 'queryReviewed', 'kind']);
    integer(input.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    check(KINDS.has(input.kind) && typeof input.queryReviewed === 'boolean');
    return { observationId: token(input.observationId), requestId: token(input.requestId),
      sourceRef: normalizedText(input.sourceRef, 500), at: iso(input.at), topicId: token(input.topicId, undefined, true),
      label: normalizedText(input.label, 160), need: normalizedText(input.need, 800),
      publicQueries: queries(input.publicQueries), queryReviewed: input.queryReviewed, kind: input.kind };
  }
  function cancelRuns(state, topicId, at) {
    for (const run of Object.values(state.runs)) {
      if (run.topicId === topicId && run.status === 'collecting') {
        run.status = 'cancelled'; run.cancelledAt = at;
      }
    }
  }
  function observe(value, input) {
    const state = validateState(value), data = observationInput(input), identity = digest(data);
    const extra = { topicId: data.topicId, ignored: false };
    if (own(state.observations, data.observationId)) {
      return replay(state, state.observations[data.observationId], identity, extra);
    }
    cas(state, input.expectedRevision);
    if (['continue', 'status'].includes(data.kind)) return response(state, { ...extra, ignored: true });
    checkedTime(data.at, state.createdAt);
    let topic = state.topics[data.topicId];
    if (topic) {
      checkedTime(data.at, topic.updatedAt);
      if (!same(topic.publicQueries, data.publicQueries) || topic.queryReviewed !== data.queryReviewed) {
        cancelRuns(state, data.topicId, data.at);
      }
      topic.label = data.label; topic.need = data.need;
      topic.publicQueries = data.publicQueries; topic.queryReviewed = data.queryReviewed; topic.updatedAt = data.at;
    } else {
      topic = { topicId: data.topicId, label: data.label, need: data.need, publicQueries: data.publicQueries,
        queryReviewed: data.queryReviewed, createdAt: data.at, updatedAt: data.at, status: 'active',
        until: null, decisionRevision: 0, lastDecisionAt: null, lastDecisionId: null,
        lastResearchAt: null, lastRunId: null, consumedRequestIds: [] };
      state.topics[data.topicId] = topic;
    }
    state.observations[data.observationId] = { ...data, fingerprint: identity };
    return commit(state, data.at, extra);
  }
  function decideTopic(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['expectedRevision', 'decisionId', 'topicId', 'status', 'reason', 'sourceRef', 'at'], ['until']);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    check(TOPIC_STATUSES.has(raw.status));
    const data = { decisionId: token(raw.decisionId), topicId: token(raw.topicId, undefined, true), status: raw.status,
      until: raw.until === undefined || raw.until === null ? null : iso(raw.until),
      reason: normalizedText(raw.reason, 800), sourceRef: normalizedText(raw.sourceRef, 500), at: iso(raw.at) };
    check(data.until === null || (data.status === 'snoozed' && Date.parse(data.until) > Date.parse(data.at)));
    const identity = digest(data), extra = { topicId: data.topicId, status: data.status };
    if (own(state.decisions, data.decisionId)) return replay(state, state.decisions[data.decisionId], identity, extra);
    cas(state, raw.expectedRevision);
    check(own(state.topics, data.topicId), 'PROACTIVE_TOPIC_NOT_FOUND');
    const topic = state.topics[data.topicId];
    checkedTime(data.at, topic.updatedAt);
    cancelRuns(state, data.topicId, data.at);
    state.decisions[data.decisionId] = { ...data, fingerprint: identity };
    topic.status = data.status; topic.until = data.until; topic.decisionRevision++;
    topic.lastDecisionAt = data.at; topic.lastDecisionId = data.decisionId; topic.updatedAt = data.at;
    return commit(state, data.at, extra);
  }
  function effectiveActive(topic, at) {
    return topic.status === 'active' || (topic.status === 'snoozed' && topic.until !== null &&
      Date.parse(at) >= Date.parse(topic.until));
  }
  function eligibility(state, topic, at) {
    const now = Date.parse(at);
    if (!effectiveActive(topic, at)) return { reason: topic.status };
    if (now < Date.parse(topic.updatedAt)) return { reason: 'future_state' };
    if (!topic.queryReviewed) return { reason: 'query_unreviewed' };
    if (Object.values(state.runs).some(run => run.topicId === topic.topicId && run.status === 'collecting')) {
      return { reason: 'in_flight' };
    }
    const recent = Object.values(state.observations).filter(item => item.topicId === topic.topicId &&
      Date.parse(item.at) <= now && now - Date.parse(item.at) <= WINDOW_MS);
    const kinds = { question: new Set(), problem: new Set(), explicit: new Set() };
    for (const item of recent) kinds[item.kind].add(item.requestId);
    const requestIds = [...new Set(recent.map(item => item.requestId))].sort(cmp);
    const consumed = new Set(topic.consumedRequestIds);
    const newRequestIds = requestIds.filter(id => !consumed.has(id));
    const newExplicit = [...kinds.explicit].filter(id => !consumed.has(id));
    const counts = { question: kinds.question.size, problem: kinds.problem.size,
      explicit: kinds.explicit.size, distinctRequests: requestIds.length, newRequests: newRequestIds.length };
    if (!newRequestIds.length) return { reason: 'no_new_signal', counts };
    let reason;
    if (newExplicit.length) reason = 'explicit_request';
    else if (kinds.problem.size >= 2) reason = 'repeated_problem';
    else if (kinds.question.size >= 3) reason = 'repeated_question';
    else return { reason: 'not_repeated', counts };
    if (topic.lastResearchAt !== null && now - Date.parse(topic.lastResearchAt) < COOLDOWN_MS && !newExplicit.length) {
      return { reason: 'cooldown', counts };
    }
    return { eligible: true, topicId: topic.topicId, label: topic.label, need: topic.need,
      queries: [...topic.publicQueries], requestIds, reason, counts };
  }
  function plan(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['at'], ['maxTopics']);
    const at = iso(raw.at), maxTopics = raw.maxTopics === undefined ? 3 : integer(raw.maxTopics, 1, 3);
    const topics = [], skipped = [];
    const ordered = Object.values(state.topics).sort((a, b) => cmp(b.updatedAt, a.updatedAt) || cmp(a.topicId, b.topicId));
    for (const topic of ordered) {
      const result = eligibility(state, topic, at);
      if (result.eligible && topics.length < maxTopics) topics.push(without(result, ['eligible']));
      else skipped.push({ topicId: topic.topicId, reason: result.eligible ? 'topic_budget' : result.reason });
    }
    return { topics, skipped };
  }
  function beginRun(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['expectedRevision', 'runId', 'topicId', 'at']);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const data = { runId: token(raw.runId), topicId: token(raw.topicId, undefined, true), at: iso(raw.at) };
    const identity = digest(data);
    if (own(state.runs, data.runId)) {
      const run = state.runs[data.runId];
      check(run.beginFingerprint === identity, 'PROACTIVE_ID_CONFLICT');
      return response(state, { run }, false, true);
    }
    cas(state, raw.expectedRevision);
    check(own(state.topics, data.topicId), 'PROACTIVE_TOPIC_NOT_FOUND');
    const topic = state.topics[data.topicId];
    checkedTime(data.at, topic.updatedAt);
    const eligible = eligibility(state, topic, data.at);
    check(eligible.eligible, eligible.reason === 'in_flight' ? 'PROACTIVE_RUN_CONFLICT' : 'PROACTIVE_TOPIC_INELIGIBLE');
    const run = { schema: RUN_SCHEMA, runId: data.runId, topicId: data.topicId, createdAt: data.at,
      queries: [...topic.publicQueries], requestIds: eligible.requestIds, topicFingerprint: topicBinding(topic),
      decisionRevision: topic.decisionRevision, planFingerprint: '', beginFingerprint: identity,
      status: 'collecting', completedAt: null, cancelledAt: null, completionFingerprint: null,
      packet: null, review: null, proposalId: null, suppressed: false, lastCheckpointId: null };
    run.planFingerprint = digest(runPlan(run));
    state.runs[data.runId] = run; topic.updatedAt = data.at;
    return commit(state, data.at, { run });
  }

  async function bounded(callback, args, timeoutMs) {
    let timer = null;
    const work = Promise.resolve().then(() => callback(args));
    const timeout = new Promise((_, reject) => {
      timer = root.setTimeout(() => { const error = new Error('PROVIDER_TIMEOUT'); error.code = 'PROVIDER_TIMEOUT'; reject(error); }, timeoutMs);
    });
    try { return await Promise.race([work, timeout]); }
    catch (error) { fail(error && error.code === 'PROVIDER_TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR'); }
    finally { root.clearTimeout(timer); }
  }
  function excerpt(value) {
    let result = value.slice(0, MAX_EXCERPT);
    const last = result.charCodeAt(result.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) result = result.slice(0, -1);
    return result;
  }
  async function collect(runValue, adapters, options = {}) {
    const run = clean(runValue);
    checkRun(run, 'PROACTIVE_INPUT_INVALID');
    check(run.status === 'collecting', 'PROACTIVE_RUN_STALE');
    fields(adapters, ['search', 'fetch']);
    check(typeof adapters.search === 'function' && typeof adapters.fetch === 'function' &&
      typeof root.setTimeout === 'function' && typeof root.clearTimeout === 'function');
    const raw = clean(options);
    fields(raw, [], ['timeoutMs', 'maxSources', 'resume']);
    const timeoutMs = raw.timeoutMs === undefined ? 15000 : integer(raw.timeoutMs, 1, 60000);
    const previous = raw.resume === undefined || raw.resume === null ? null : validatePacket(raw.resume, run);
    const maxSources = raw.maxSources === undefined ? (previous ? previous.limits.maxSources : 6) : integer(raw.maxSources, 1, 6);
    if (previous) check(previous.limits.maxSources === maxSources, 'PROACTIVE_PACKET_INVALID');
    const errors = [];
    const queryResults = await Promise.all(run.queries.map(async (publicQuery, queryIndex) => {
      const old = previous && previous.queryResults[queryIndex];
      if (old && old.status === 'ok') {
        errors.push(...previous.errors.filter(error => error.stage === 'search' && error.queryIndex === queryIndex));
        return clean(old);
      }
      try {
        const rawResults = await bounded(adapters.search, { query: publicQuery, limit: maxSources }, timeoutMs);
        const returned = clean(rawResults, 'PROVIDER_RESPONSE_INVALID');
        check(Array.isArray(returned) && returned.length <= 100, 'PROVIDER_RESPONSE_INVALID');
        const results = [], seen = new Map();
        for (const item of returned.slice(0, 6)) {
          try {
            fields(item, ['url', 'title'], [], 'PROVIDER_RESPONSE_INVALID');
            const url = publicURL(item.url);
            const title = normalizedText(item.title, 240, 'PROVIDER_RESPONSE_INVALID');
            if (seen.has(url)) {
              if (seen.get(url) !== title) errors.push({ stage: 'search', code: 'SOURCE_CONFLICT', queryIndex });
              continue;
            }
            seen.set(url, title); results.push({ url, title });
          } catch (error) {
            errors.push({ stage: 'search', code: error.code === 'PROACTIVE_URL_INVALID' ? 'PUBLIC_URL_REQUIRED' : 'PROVIDER_RESPONSE_INVALID', queryIndex });
          }
        }
        if (returned.length > 6) errors.push({ stage: 'search', code: 'RESULTS_TRUNCATED', queryIndex });
        return { query: publicQuery, status: 'ok', results };
      } catch (error) {
        const errorCode = PROVIDER_CODES.has(error && error.code) ? error.code : 'PROVIDER_ERROR';
        errors.push({ stage: 'search', code: errorCode, queryIndex });
        return { query: publicQuery, status: 'error', results: [], errorCode };
      }
    }));
    const candidates = [], seenURLs = new Map();
    for (let queryIndex = 0; queryIndex < queryResults.length; queryIndex++) {
      for (const result of queryResults[queryIndex].results) {
        if (seenURLs.has(result.url)) {
          if (seenURLs.get(result.url) !== result.title) errors.push({ stage: 'search', code: 'SOURCE_CONFLICT', queryIndex });
        } else {
          seenURLs.set(result.url, result.title); candidates.push(result);
        }
      }
    }
    // Keep a checkpoint's successful sources selected even if a retried query
    // produces additional higher-position URLs. Never silently discard work.
    const oldURLs = previous ? previous.sources.map(source => source.url) : [];
    const selectedURLs = [...oldURLs, ...candidates.map(item => item.url).filter(url => !oldURLs.includes(url))].slice(0, maxSources);
    const sources = (await Promise.all(selectedURLs.map(async url => {
      const old = previous && previous.sources.find(source => source.url === url);
      if (old) return clean(old);
      try {
        const value = clean(await bounded(adapters.fetch, { url }, timeoutMs), 'PROVIDER_RESPONSE_INVALID');
        fields(value, ['url', 'title', 'text', 'retrievedAt', 'kind'], [], 'PROVIDER_RESPONSE_INVALID');
        let returnedURL;
        try { returnedURL = publicURL(value.url); } catch { fail('PUBLIC_URL_REQUIRED'); }
        check(returnedURL === url, 'UNEXPECTED_REDIRECT');
        const title = normalizedText(value.title, 240, 'PROVIDER_RESPONSE_INVALID');
        check(SOURCE_KINDS.has(value.kind), 'PROVIDER_RESPONSE_INVALID');
        check(typeof value.text === 'string' && value.text.length <= MAX_TEXT, 'FETCH_TEXT_LIMIT');
        text(value.text, MAX_TEXT, 'FETCH_TEXT_EMPTY');
        let retrievedAt;
        try { retrievedAt = iso(value.retrievedAt); } catch { fail('FETCH_TIME_INVALID'); }
        check(Date.parse(retrievedAt) >= Date.parse(run.createdAt), 'FETCH_TIME_INVALID');
        const contentHash = sha256(value.text);
        return { id: sourceID(url, contentHash), url, title, retrievedAt, kind: value.kind,
          contentHash, excerpt: excerpt(value.text), contentChars: value.text.length,
          contentScope: 'fetched_excerpt', status: 'fetched' };
      } catch (error) {
        errors.push({ stage: 'fetch', code: PROVIDER_CODES.has(error && error.code) ? error.code : 'PROVIDER_ERROR', url });
        return null;
      }
    }))).filter(Boolean);
    // Sorting removes provider timing from packet identity.
    errors.sort((a, b) => cmp(canonical(a), canonical(b)));
    const uniqueErrors = errors.filter((item, index) => index === 0 || !same(item, errors[index - 1]));
    const packet = { schema: PACKET_SCHEMA, runId: run.runId, topicId: run.topicId,
      planFingerprint: run.planFingerprint, status: packetStatus(sources, uniqueErrors), queryResults,
      sources, errors: uniqueErrors, limits: { maxSources, maxTextChars: MAX_TEXT, maxExcerptChars: MAX_EXCERPT },
      sourceRetrievalAttested: true, independentFactVerification: false, authorizesExecution: false };
    packet.packetFingerprint = digest(packet);
    return validatePacket(packet, run);
  }
  function currentRun(state, runId, at) {
    check(own(state.runs, runId), 'PROACTIVE_RUN_NOT_FOUND');
    const run = state.runs[runId], topic = state.topics[run.topicId];
    check(run.status === 'collecting' && effectiveActive(topic, at) &&
      run.topicFingerprint === topicBinding(topic) && run.decisionRevision === topic.decisionRevision, 'PROACTIVE_RUN_STALE');
    checkedTime(at, topic.updatedAt);
    checkedTime(at, run.createdAt);
    return run;
  }
  function checkPacketTime(packet, at) {
    check(packet.sources.every(source => Date.parse(source.retrievedAt) <= Date.parse(at)), 'PROACTIVE_TIME_ORDER');
  }
  function checkpointRun(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['expectedRevision', 'checkpointId', 'runId', 'at', 'packet']);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const checkpointId = token(raw.checkpointId), runId = token(raw.runId), at = iso(raw.at);
    check(own(state.runs, runId), 'PROACTIVE_RUN_NOT_FOUND');
    const packet = validatePacket(raw.packet, state.runs[runId]);
    const data = { checkpointId, runId, at, packet }, identity = digest(data);
    if (own(state.checkpoints, checkpointId)) {
      return replay(state, state.checkpoints[checkpointId], identity, { runId, run: state.runs[runId] });
    }
    cas(state, raw.expectedRevision);
    const run = currentRun(state, runId, at);
    checkPacketTime(packet, at);
    if (run.packet !== null) {
      check(run.packet.sources.every(source => packet.sources.some(next => same(source, next))),
        'PROACTIVE_EVIDENCE_INVALID');
    }
    state.checkpoints[checkpointId] = { ...data, fingerprint: identity };
    run.packet = packet; run.lastCheckpointId = checkpointId; state.topics[run.topicId].updatedAt = at;
    return commit(state, at, { runId, run });
  }
  function completeRun(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['expectedRevision', 'runId', 'at', 'packet', 'review']);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const runId = token(raw.runId), at = iso(raw.at);
    check(own(state.runs, runId), 'PROACTIVE_RUN_NOT_FOUND');
    const knownRun = state.runs[runId], packet = validatePacket(raw.packet, knownRun);
    const review = validateReview(raw.review, packet);
    const identity = digest({ runId, at, packet, review });
    if (knownRun.completionFingerprint !== null) {
      check(knownRun.completionFingerprint === identity, 'PROACTIVE_ID_CONFLICT');
      return response(state, { runId, status: knownRun.packet.status, proposalId: knownRun.proposalId,
        suppressed: knownRun.suppressed }, false, true);
    }
    cas(state, raw.expectedRevision);
    const run = currentRun(state, runId, at), topic = state.topics[run.topicId];
    checkPacketTime(packet, at);
    if (run.packet !== null) check(run.packet.sources.every(source => packet.sources.some(next => same(source, next))),
      'PROACTIVE_EVIDENCE_INVALID');
    let proposalId = null, suppressed = false;
    if (review.relevant && packet.sources.length > 0) {
      const sources = review.sourceIds.map(id => packet.sources.find(source => source.id === id));
      const proposal = { id: '', topicId: run.topicId, runId,
        summary: review.summary, change: review.change, benefit: review.benefit, integration: review.integration,
        validation: review.validation, limitations: review.limitations, sourceIds: [...review.sourceIds], sources,
        status: 'open', createdAt: at, fingerprint: '', independentFactVerification: false,
        implementationVerified: false, authorizesExecution: false };
      proposal.fingerprint = proposalFingerprint(proposal); proposal.id = 'proposal-' + proposal.fingerprint;
      if (own(state.proposals, proposal.id)) suppressed = true;
      else { state.proposals[proposal.id] = proposal; proposalId = proposal.id; }
    }
    run.status = 'completed'; run.completedAt = at; run.completionFingerprint = identity;
    run.packet = packet; run.review = review; run.proposalId = proposalId; run.suppressed = suppressed;
    topic.consumedRequestIds = [...new Set([...topic.consumedRequestIds, ...run.requestIds])].sort(cmp);
    topic.lastResearchAt = at; topic.lastRunId = runId; topic.updatedAt = at;
    return commit(state, at, { runId, status: packet.status, proposalId, suppressed });
  }
  function noticeOutput(items, omitted, maxChars) {
    const output = { items, omitted, maxChars, selectedChars: 0 };
    for (let i = 0; i < 4; i++) output.selectedChars = JSON.stringify(output).length;
    return output;
  }
  function notices(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['at'], ['limit', 'maxChars']);
    const at = iso(raw.at), limit = raw.limit === undefined ? 3 : integer(raw.limit, 1, 3);
    const maxChars = raw.maxChars === undefined ? 12000 : integer(raw.maxChars, 256, 12000);
    const delivered = new Set(Object.values(state.receipts).flatMap(receipt => receipt.proposalIds));
    const candidates = Object.values(state.proposals).filter(proposal => proposal.status === 'open' &&
      effectiveActive(state.topics[proposal.topicId], at) && Date.parse(proposal.createdAt) <= Date.parse(at) &&
      Date.parse(state.topics[proposal.topicId].updatedAt) <= Date.parse(at) &&
      !delivered.has(proposal.id)).sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id));
    const items = [];
    for (const proposal of candidates) {
      if (items.length >= limit) break;
      const item = { ...proposal, noticeFingerprint: digest({ id: proposal.id, fingerprint: proposal.fingerprint }) };
      const candidate = noticeOutput([...items, item], candidates.length - items.length - 1, maxChars);
      if (candidate.selectedChars <= maxChars) items.push(item);
    }
    return noticeOutput(items, candidates.length - items.length, maxChars);
  }
  function acknowledge(value, input) {
    const state = validateState(value), raw = clean(input);
    fields(raw, ['expectedRevision', 'receiptId', 'proposalIds', 'at']);
    integer(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const data = { receiptId: token(raw.receiptId), proposalIds: uniqueTokens(raw.proposalIds, 3, undefined, false).sort(cmp),
      at: iso(raw.at) };
    const identity = digest(data), extra = { receiptId: data.receiptId, proposalIds: data.proposalIds,
      deliveryStatus: 'handoff_attempted', readVerified: false };
    if (own(state.receipts, data.receiptId)) return replay(state, state.receipts[data.receiptId], identity, extra);
    cas(state, raw.expectedRevision);
    for (const proposalId of data.proposalIds) {
      check(own(state.proposals, proposalId), 'PROACTIVE_PROPOSAL_NOT_FOUND');
      checkedTime(data.at, state.proposals[proposalId].createdAt);
    }
    checkedTime(data.at, state.updatedAt);
    state.receipts[data.receiptId] = { ...data, fingerprint: identity, deliveryStatus: 'handoff_attempted', readVerified: false };
    return commit(state, data.at, extra);
  }

  root.JHProactiveResearch = Object.freeze({ VERSION, SCHEMA, fingerprint, createState, validateState,
    observe, decideTopic, plan, beginRun, collect, checkpointRun, completeRun, notices, acknowledge });
})(globalThis);
