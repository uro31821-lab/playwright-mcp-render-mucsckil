/* Host-only retrieval federation. Existing authenticated callbacks own transport.
 * No credentials, direct network, filesystem, provider writes or execution ports.
 * Portable side-effect module: import it, or evaluate it in the host, then use
 * globalThis.JHMemoryFederation. Source records remain data, never instructions.
 */
(function installJHMemoryFederation(root) {
  'use strict';
  const MAX_INPUT = 524288;
  const DOMAINS = new Set(['connection', 'device', 'web', 'output', 'research', 'calculation', 'routine', 'development', 'orchestration']);
  const KINDS = new Set(['rule_fix', 'workflow_automation', 'verification_gap', 'learning_evaluation']);
  const OUTCOMES = new Set(['success_verified', 'failure_verified', 'completion_unknown', 'blocked', 'cancelled', 'correction', 'observed', 'pending']);
  const SOURCES = new Set(['host_verified', 'user_explicit', 'user_reported']);
  const HOST_CONTEXT = { platform: 'chatgpt', version: 'operational-learning-v1', environment: 'personal' };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const ERRORS = new Set(['FEDERATION_INPUT_INVALID', 'MCP_RESPONSE_INVALID', 'PROVIDER_ERROR', 'PROVIDER_TIMEOUT',
    'JH_CONTEXT_INVALID', 'MEMORIA_SEARCH_INVALID', 'MEMORIA_FETCH_INVALID', 'MEMORIA_SENSITIVE_RECORD',
    'MEMORIA_SELECTION_INVALID', 'MEMORIA_RECORD_CONFLICT', 'MEMORIA_RESULTS_OMITTED', 'OUTPUT_BUDGET_TOO_SMALL']);
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function check(condition, code = 'FEDERATION_INPUT_INVALID') { if (!condition) fail(code); }
  function plain(value, code = 'FEDERATION_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string') &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
    return descriptors;
  }
  function fields(value, required, optional = [], code = 'FEDERATION_INPUT_INVALID') {
    plain(value, code);
    check(required.every(key => own(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
  }
  function integer(value, min, max, code = 'FEDERATION_INPUT_INVALID') {
    check(Number.isSafeInteger(value) && value >= min && value <= max, code);
  }
  function wellFormed(value) {
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
  }
  function text(value, max, code, empty = false) {
    check(typeof value === 'string' && value.length <= max && wellFormed(value) && (empty || value.trim().length > 0) &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), code);
    return value;
  }
  function credential(value) {
    return /(?:^|\s)Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i.test(value) ||
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/.test(value) ||
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(value) ||
      /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value);
  }
  function safeText(value, max, code, empty = false) {
    text(value, max, code, empty);
    check(!credential(value), code);
    return value;
  }
  function clean(value, code = 'MCP_RESPONSE_INVALID', depth = 0, budget = { nodes: 100000, chars: 0 }) {
    check(depth <= 32 && --budget.nodes >= 0, code);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      check(wellFormed(value), code); budget.chars += value.length;
      check(budget.chars <= MAX_INPUT, code); return value;
    }
    if (typeof value === 'number') { check(Number.isFinite(value), code); return value; }
    if (Array.isArray(value)) {
      check(value.length <= 10000 && Object.getPrototypeOf(value) === Array.prototype &&
        Reflect.ownKeys(value).length === value.length + 1, code);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return Array.from({ length: value.length }, (_, index) => {
        const item = descriptors[index]; check(item && own(item, 'value') && item.enumerable, code);
        return clean(item.value, code, depth + 1, budget);
      });
    }
    const descriptors = plain(value, code), result = {};
    check(Object.keys(descriptors).length <= 10000, code);
    for (const key of Object.keys(descriptors)) {
      budget.chars += key.length; check(budget.chars <= MAX_INPUT, code);
      check(!['__proto__', 'constructor', 'prototype'].includes(key), code);
      result[key] = clean(descriptors[key].value, code, depth + 1, budget);
    }
    return result;
  }
  function clone(value, code) {
    const result = clean(value, code);
    check(JSON.stringify(result).length <= MAX_INPUT, code);
    return result;
  }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  // JSON.parse accepts duplicate member names; reject those at the text boundary.
  function parseJSON(source) {
    text(source, MAX_INPUT, 'MCP_RESPONSE_INVALID');
    let index = 0;
    const whitespace = () => { while (/\s/.test(source[index] || '') && index < source.length) index++; };
    function string() {
      const start = index++; let escaped = false;
      while (index < source.length) {
        const char = source[index++];
        if (!escaped && char === '"') {
          try { return JSON.parse(source.slice(start, index)); } catch { fail('MCP_RESPONSE_INVALID'); }
        }
        if (!escaped && char === '\\') escaped = true; else escaped = false;
      }
      fail('MCP_RESPONSE_INVALID');
    }
    function value(depth) {
      check(depth <= 32, 'MCP_RESPONSE_INVALID'); whitespace();
      if (source[index] === '"') return string();
      if (source[index] === '{') {
        index++; whitespace(); const seen = new Set();
        if (source[index] === '}') { index++; return; }
        while (index < source.length) {
          whitespace(); check(source[index] === '"', 'MCP_RESPONSE_INVALID');
          const key = string(); check(!seen.has(key), 'MCP_RESPONSE_INVALID'); seen.add(key);
          whitespace(); check(source[index++] === ':', 'MCP_RESPONSE_INVALID'); value(depth + 1); whitespace();
          const end = source[index++]; if (end === '}') return;
          check(end === ',', 'MCP_RESPONSE_INVALID');
        }
        fail('MCP_RESPONSE_INVALID');
      }
      if (source[index] === '[') {
        index++; whitespace(); if (source[index] === ']') { index++; return; }
        while (index < source.length) {
          value(depth + 1); whitespace(); const end = source[index++]; if (end === ']') return;
          check(end === ',', 'MCP_RESPONSE_INVALID');
        }
        fail('MCP_RESPONSE_INVALID');
      }
      const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(index));
      check(token, 'MCP_RESPONSE_INVALID'); index += token[0].length;
    }
    value(0); whitespace(); check(index === source.length, 'MCP_RESPONSE_INVALID');
    try { return clone(JSON.parse(source), 'MCP_RESPONSE_INVALID'); } catch { fail('MCP_RESPONSE_INVALID'); }
  }
  function unwrap(raw) {
    const value = typeof raw === 'string' ? parseJSON(raw) : clone(raw, 'MCP_RESPONSE_INVALID');
    plain(value, 'MCP_RESPONSE_INVALID');
    check(value.isError !== true && value.ok !== false && (value.error === undefined || value.error === null), 'PROVIDER_ERROR');
    let payload = value;
    if (own(value, 'structuredContent') || Array.isArray(value.content)) {
      if (value.structuredContent !== undefined && value.structuredContent !== null) {
        plain(value.structuredContent, 'MCP_RESPONSE_INVALID'); payload = value.structuredContent;
      } else {
        check(Array.isArray(value.content) && value.content.length === 1 && value.content[0]?.type === 'text', 'MCP_RESPONSE_INVALID');
        payload = parseJSON(value.content[0].text);
      }
    }
    plain(payload, 'MCP_RESPONSE_INVALID');
    check(payload.ok !== false && payload.isError !== true && (payload.error === undefined || payload.error === null), 'PROVIDER_ERROR');
    return payload;
  }
  function iso(value, code) {
    text(value, 40, code);
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
    check(match && Number.isFinite(Date.parse(value)), code);
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    check(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number(match[4]) <= 23 &&
      Number(match[5]) <= 59 && Number(match[6]) <= 59 && Number(match[7] || 0) <= 23 && Number(match[8] || 0) <= 59, code);
    return value;
  }
  function scopeMatches(value, domain, operation) {
    return value && value.domain === domain && value.operation === operation && value.engine === 'jh-agent' &&
      value.context && Object.keys(value.context).length === 3 &&
      Object.entries(HOST_CONTEXT).every(([key, expected]) => value.context[key] === expected) && Object.keys(value).length === 4;
  }
  function refs(value, code) {
    check(Array.isArray(value) && value.length <= 8 && new Set(value).size === value.length, code);
    for (const ref of value) check(typeof ref === 'string' &&
      /^(?:sha256|event|fixture|user|artifact|library|regression|test|source|commit):[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/.test(ref) && !credential(ref), code);
  }
  function safeData(value, code) {
    if (typeof value === 'string') {
      check(!credential(value) && !/https?:\/\/[^\s"'<>]*[?#]/i.test(value), code);
    } else if (value && typeof value === 'object') for (const item of Object.values(value)) safeData(item, code);
  }
  function jhPayload(raw, input) {
    const code = 'JH_CONTEXT_INVALID', body = unwrap(raw);
    check(body.ok === true && body.schema === 'jh.host-memory-context.v1', code);
    check(scopeMatches(body.scope, input.domain, input.operation) &&
      scopeMatches(body.commonScope, 'orchestration', 'learning.scope'), code);
    integer(body.revision, 0, Number.MAX_SAFE_INTEGER, code); iso(body.observedAt, code);
    for (const key of ['readOnly', 'advisoryOnly', 'episodesRequireReview']) check(body[key] === true, code);
    for (const key of ['externalEffects', 'replayAllowed', 'sourceRetrievalVerified', 'liveExecutionVerified', 'ordinaryChatsObserved']) check(body[key] === false, code);
    for (const key of ['authorizesExecution', 'independentOutcomeVerification', 'activatedByThisCall']) {
      if (own(body, key)) check(body[key] === false, code);
    }
    check(body.sourceAuthentication === 'authenticated_owner_attestation' && body.librarySync === 'not_connected', code);
    const allowedScope = value => scopeMatches(value, input.domain, input.operation) || scopeMatches(value, 'orchestration', 'learning.scope');
    for (const key of ['lessons', 'conflicts', 'proposals', 'episodes']) {
      check(Array.isArray(body[key]) && body[key].length <= 10, code);
      for (const item of body[key]) { plain(item, code); safeData(item, code); }
    }
    for (const item of body.lessons) {
      safeText(item.id, 128, code); safeText(item.ruleVersion, 128, code); safeText(item.guidance, 2048, code);
      check(item.state === 'active' && item.advisoryOnly === true && allowedScope(item.scope), code); refs(item.evidenceRefs, code);
      check(['fact', 'episode', 'procedure'].includes(item.memoryKind) && ['legacy', 'user_explicit', 'host_verified', 'model_inferred'].includes(item.provenance), code);
      if (item.validFrom !== null && item.validFrom !== undefined) check(Date.parse(iso(item.validFrom, code)) <= Date.parse(body.observedAt), code);
      if (item.validUntil !== null && item.validUntil !== undefined) check(Date.parse(iso(item.validUntil, code)) > Date.parse(body.observedAt), code);
    }
    for (const item of body.conflicts) {
      safeText(item.conflictKey, 128, code);
      check(item.reason === 'equal_authority_conflict' && Array.isArray(item.lessonIds) && item.lessonIds.length <= 1000, code);
      item.lessonIds.forEach(id => safeText(id, 128, code));
    }
    for (const item of body.proposals) {
      safeText(item.id, 128, code); check(KINDS.has(item.kind) && item.status === 'open' && item.advisoryOnly === true && item.externalEffects === false, code);
      const wildcard = item.kind === 'learning_evaluation' &&
        (scopeMatches(item.scope, input.domain, '*') || scopeMatches(item.scope, 'orchestration', '*'));
      check(allowedScope(item.scope) || wildcard, code);
      safeText(item.reason, 2048, code); safeText(item.proposedChange, 2048, code); refs(item.evidenceRefs, code);
      integer(item.independentTaskCount, 1, 10000, code); iso(item.createdAt, code);
      check(Array.isArray(item.requiredValidation) && item.requiredValidation.length >= 1 && item.requiredValidation.length <= 8, code);
      item.requiredValidation.forEach(value => safeText(value, 512, code));
    }
    function observation(item) {
      plain(item, code); check(/^host-observation-[a-f0-9]{64}$/.test(item.eventId), code);
      integer(item.sequence, 0, 1e9, code); iso(item.timestamp, code);
      check(OUTCOMES.has(item.outcome) && SOURCES.has(item.source), code); refs(item.evidenceRefs, code);
      if (item.source === 'user_reported') check(!['success_verified', 'failure_verified'].includes(item.outcome), code);
    }
    for (const item of body.episodes) {
      check(/^host-task-[a-f0-9]{64}$/.test(item.taskId) && /^host-attempt-[a-f0-9]{64}$/.test(item.attemptId) &&
        scopeMatches(item.scope, input.domain, input.operation), code);
      integer(item.eventCount, 1, 10000, code); observation(item.projection); observation(item.latestObservation);
      check(item.sourceAuthentication === 'authenticated_owner_attestation' && item.sourceRetrievalVerified === false &&
        item.liveExecutionVerified === false && item.episodesRequireReview === true, code);
    }
    plain(body.omitted, code);
    for (const key of ['lessons', 'conflicts', 'proposals', 'episodes']) integer(body.omitted[key], 0, 10000, code);
    if (body.fingerprint !== undefined) check(typeof body.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(body.fingerprint), code);
    return { revision: body.revision, observedAt: body.observedAt,
      ...(body.fingerprint === undefined ? {} : { fingerprint: body.fingerprint }), lessons: body.lessons, conflicts: body.conflicts,
      proposals: body.proposals, episodes: body.episodes, omitted: body.omitted };
  }
  function memoryId(value, code) { check(typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) && !credential(value), code); return value; }
  function alias(record, keys, code) {
    const values = keys.filter(key => record[key] !== undefined && record[key] !== null).map(key => record[key]);
    if (!values.length) return undefined;
    check(values.every(value => canonical(value) === canonical(values[0])), code);
    return values[0];
  }
  function recordValue(record, code) {
    plain(record, code); const id = memoryId(record.id, code);
    const deleted = record.deleted === true || record.is_deleted === true || record.status === 'deleted' ||
      [record.deleted_at, record.deletedAt].some(value => value !== undefined && value !== null && value !== '');
    if (deleted) return { id, deleted: true };
    text(record.content, MAX_INPUT, code, true);
    const result = { id, content: record.content };
    for (const key of ['title', 'category', 'location', 'emotion']) if (record[key] !== undefined && record[key] !== null) result[key] = text(record[key], 512, code, true);
    if (record.people !== undefined && record.people !== null) {
      check(Array.isArray(record.people) && record.people.length <= 20, code);
      result.people = record.people.map(value => text(value, 128, code));
    }
    for (const [key, names] of Object.entries({ createdAt: ['created_at', 'createdAt'], updatedAt: ['updated_at', 'updatedAt'],
      recordedAt: ['recorded_at', 'recordedAt', 'timestamp'] })) {
      const meaningful = names.filter(name => typeof record[name] !== 'string' || record[name].trim() !== '');
      const value = alias(record, meaningful, code); if (value !== undefined) result[key] = text(value, 80, code);
    }
    const version = alias(record, ['revision', 'version'], code);
    if (version !== undefined) {
      check((typeof version === 'string' && version.length <= 80) || (Number.isSafeInteger(version) && version >= 0), code);
      result.revision = version;
    }
    if (record.media !== undefined) {
      check(Array.isArray(record.media) && record.media.length <= 100, code);
      // Retain for internal strict comparison and return only its item count;
      // media URLs/Drive metadata are not returned in the source projection.
      result.media = record.media;
    }
    return result;
  }
  function memorySearchPayload(raw, input) {
    const code = 'MEMORIA_SEARCH_INVALID', body = unwrap(raw);
    check(body.query === input.query && Array.isArray(body.memories), code);
    integer(body.count, 0, input.limit, code); check(body.count === body.memories.length, code);
    return body.memories.map(record => recordValue(record, code));
  }
  function memoryFetchPayload(raw, id) {
    const code = 'MEMORIA_FETCH_INVALID', body = unwrap(raw);
    check(typeof body.found === 'boolean', code);
    if (!body.found) { check(body.memory === null || body.memory === undefined, code); return null; }
    const record = recordValue(body.memory, code); check(record.id === id, code); return record;
  }
  function makeSource(record, searched, retrievedAt) {
    let contentSanitized = false;
    const safe = value => {
      if (typeof value !== 'string') return value;
      const stripped = value.replace(/https?:\/\/[^\s"'<>]+/gi, url => url.split(/[?#]/, 1)[0]);
      if (stripped !== value) contentSanitized = true;
      check(!credential(stripped), 'MEMORIA_SENSITIVE_RECORD'); return stripped;
    };
    const source = { provider: 'memoria_cloud_v3', sourceId: 'memoria_cloud_v3:' + record.id,
      memoryId: record.id, content: safe(record.content) };
    for (const key of ['title', 'category', 'location', 'emotion', 'createdAt', 'updatedAt', 'recordedAt', 'revision']) {
      if (record[key] !== undefined) source[key] = safe(record[key]);
    }
    if (record.people !== undefined) source.people = record.people.map(safe);
    if (record.media !== undefined) source.mediaCount = record.media.length;
    const compared = Object.keys(searched).filter(key => key !== 'id' && key !== 'deleted' && own(record, key));
    const changed = compared.some(key => canonical(searched[key]) !== canonical(record[key]));
    return { ...source, retrievedAt, changedSinceSearch: changed,
      changeMeaning: 'FETCH_DIFFERS_FROM_SEARCH_FIELDS_NOT_PROVEN_EDIT', contentSanitized,
      fetchedFullRecord: true, minimizedMetadata: true, referenceOnly: true, requiresReview: true, authorizesExecution: false,
      sourceKind: 'personal_archive_record', sourceAuthentication: 'connected_provider_response',
      recordedImpressionIsExternalFact: false };
  }
  function errorCode(error) { return ERRORS.has(error?.code) ? error.code : 'PROVIDER_ERROR'; }
  function statusFor(error) {
    const code = errorCode(error);
    return { status: code === 'PROVIDER_TIMEOUT' ? 'timeout' : code === 'PROVIDER_ERROR' ? 'error' : 'invalid', code };
  }
  function timed(callback, timeoutMs) {
    let timer;
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => { const error = new Error('PROVIDER_TIMEOUT'); error.code = 'PROVIDER_TIMEOUT'; reject(error); }, timeoutMs);
      Promise.resolve().then(callback).then(resolve, reject);
    }).finally(() => clearTimeout(timer));
  }
  function sealSize(result) {
    result.budget.serializedChars = 0;
    for (let pass = 0; pass < 8; pass++) {
      const size = JSON.stringify(result).length;
      if (size === result.budget.serializedChars) return size;
      result.budget.serializedChars = size;
    }
    fail('OUTPUT_BUDGET_TOO_SMALL');
  }
  function createHostMemoryOrchestrator(options) {
    fields(options, ['jhContext', 'memoriaSearch', 'memoriaFetch'], ['clock', 'timeoutMs']);
    for (const key of ['jhContext', 'memoriaSearch', 'memoriaFetch']) check(typeof options[key] === 'function');
    const clock = options.clock ?? (() => new Date().toISOString()), timeoutMs = options.timeoutMs ?? 60000;
    check(typeof clock === 'function'); integer(timeoutMs, 1, 120000);
    const time = () => iso(clock(), 'FEDERATION_INPUT_INVALID');
    async function retrieve(request) {
      fields(request, ['domain', 'operation', 'query'], ['limit', 'maxChars', 'selection']);
      const input = clone(request, 'FEDERATION_INPUT_INVALID');
      check(DOMAINS.has(input.domain) && typeof input.operation === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(input.operation) && !credential(input.operation));
      safeText(input.query, 20000, 'FEDERATION_INPUT_INVALID');
      input.limit = input.limit ?? 3; input.maxChars = input.maxChars ?? 12000;
      integer(input.limit, 1, 3); integer(input.maxChars, 2048, 65536);
      if (input.selection !== undefined) {
        check(Array.isArray(input.selection) && input.selection.length <= 3 && new Set(input.selection).size === input.selection.length);
        input.selection.forEach(id => memoryId(id, 'FEDERATION_INPUT_INVALID'));
      }
      const observedAt = time();
      const [jhResult, searchResult] = await Promise.allSettled([
        timed(async () => jhPayload(await options.jhContext({ domain: input.domain, operation: input.operation,
          limit: input.limit, max_chars: Math.min(6000, Math.max(256, Math.floor(input.maxChars / 2))) }), input), timeoutMs),
        timed(async () => memorySearchPayload(await options.memoriaSearch({ query: input.query, limit: input.limit }), input), timeoutMs),
      ]);
      const providers = { jh: jhResult.status === 'fulfilled' ? { status: 'ok', code: null } : statusFor(jhResult.reason),
        memoria: searchResult.status === 'fulfilled' ? { status: 'ok', code: null, fetches: [] } : { ...statusFor(searchResult.reason), fetches: [] } };
      const jh = jhResult.status === 'fulfilled' ? jhResult.value : { revision: null, lessons: [], conflicts: [], proposals: [], episodes: [],
        omitted: { lessons: 0, conflicts: 0, proposals: 0, episodes: 0 } };
      const sources = [], memoriaConflicts = [];
      const omittedMemory = { notSelected: 0, missing: 0, empty: 0, deleted: 0, duplicates: 0, conflicts: 0, budget: 0, conflictDetails: 0 };
      if (searchResult.status === 'fulfilled') {
        const groups = new Map();
        for (const record of searchResult.value) {
          if (!groups.has(record.id)) groups.set(record.id, []);
          groups.get(record.id).push(record);
        }
        const eligible = new Map();
        for (const [id, values] of groups) {
          if (values.some(value => canonical(value) !== canonical(values[0]))) {
            omittedMemory.conflicts++;
            memoriaConflicts.push({ provider: 'memoria_cloud_v3', sourceId: 'memoria_cloud_v3:' + id,
              reason: 'SAME_ID_CONFLICTING_SEARCH_RECORDS', automaticSelection: false });
            continue;
          }
          omittedMemory.duplicates += values.length - 1;
          if (values[0].deleted) { omittedMemory.deleted++; continue; }
          eligible.set(id, values[0]);
        }
        const selected = input.selection === undefined ? [...eligible.keys()].slice(0, input.limit) : input.selection;
        if (selected.some(id => !eligible.has(id))) {
          providers.memoria = { status: 'invalid', code: 'MEMORIA_SELECTION_INVALID', fetches: [] };
          omittedMemory.notSelected = eligible.size;
        } else {
          omittedMemory.notSelected = eligible.size - selected.length;
          const fetched = await Promise.allSettled(selected.map(id => timed(async () => ({ id,
            record: memoryFetchPayload(await options.memoriaFetch({ memory_id: id }), id), retrievedAt: time() }), timeoutMs)));
          for (let index = 0; index < fetched.length; index++) {
            const item = fetched[index], memoryId = selected[index];
            if (item.status === 'rejected') { providers.memoria.fetches.push({ memoryId, ...statusFor(item.reason) }); continue; }
            const record = item.value.record;
            if (record === null) { omittedMemory.missing++; providers.memoria.fetches.push({ memoryId, status: 'missing', code: null }); continue; }
            if (record.deleted) { omittedMemory.deleted++; providers.memoria.fetches.push({ memoryId, status: 'deleted', code: null }); continue; }
            if (!record.content.trim()) { omittedMemory.empty++; providers.memoria.fetches.push({ memoryId, status: 'empty', code: null }); continue; }
            try {
              sources.push(makeSource(record, eligible.get(memoryId), item.value.retrievedAt));
              providers.memoria.fetches.push({ memoryId, status: 'ok', code: null });
            } catch (error) { providers.memoria.fetches.push({ memoryId, ...statusFor(error) }); }
          }
          if (omittedMemory.conflicts || providers.memoria.fetches.some(item => item.status !== 'ok') || omittedMemory.deleted) {
            providers.memoria.status = 'partial';
            providers.memoria.code = omittedMemory.conflicts ? 'MEMORIA_RECORD_CONFLICT' : 'MEMORIA_RESULTS_OMITTED';
          }
        }
      }
      const result = { schema: 'jh.host-memory-federation.v1', observedAt, completedAt: time(),
        scope: { domain: input.domain, operation: input.operation }, providers,
        jh: { revision: jh.revision, ...(jh.observedAt === undefined ? {} : { observedAt: jh.observedAt }),
          ...(jh.fingerprint === undefined ? {} : { fingerprint: jh.fingerprint }), lessons: [], conflicts: [], proposals: [], episodes: [] },
        memoria: { sources: [], conflicts: [] },
        omitted: { jh: Object.fromEntries(['lessons', 'conflicts', 'proposals', 'episodes'].map(key => [key, jh.omitted[key] + jh[key].length])),
          memoria: { ...omittedMemory, budget: sources.length, conflictDetails: memoriaConflicts.length } },
        budget: { maxChars: input.maxChars, serializedChars: 0 }, partial: false,
        readOnly: true, advisoryOnly: true, authorizesExecution: false, writePerformed: false,
        automaticSynchronization: false, ordinaryChatsObserved: false, librarySync: 'not_connected' };
      // Returned values are whole records. Only the explicit metadata reports an
      // omission; the module never shortens an instruction or source paragraph.
      const candidates = [
        ...jh.conflicts.map(item => ['jh', 'conflicts', item]),
        ...jh.lessons.map(item => ['jh', 'lessons', item]),
        ...memoriaConflicts.map(item => ['memoria', 'conflicts', item]),
        ...sources.map(item => ['memoria', 'sources', item]),
        ...jh.episodes.map(item => ['jh', 'episodes', item]),
        ...jh.proposals.map(item => ['jh', 'proposals', item]),
      ];
      check(sealSize(result) <= input.maxChars, 'OUTPUT_BUDGET_TOO_SMALL');
      for (const [provider, key, item] of candidates) {
        const counter = provider === 'jh' ? key : key === 'sources' ? 'budget' : 'conflictDetails';
        result[provider][key].push(item); result.omitted[provider][counter]--;
        if (sealSize(result) > input.maxChars) { result[provider][key].pop(); result.omitted[provider][counter]++; }
      }
      result.partial = providers.jh.status !== 'ok' || providers.memoria.status !== 'ok' ||
        Object.values(result.omitted.jh).some(value => value > 0) ||
        ['notSelected', 'missing', 'empty', 'deleted', 'conflicts', 'budget', 'conflictDetails'].some(key => result.omitted.memoria[key] > 0);
      check(sealSize(result) <= input.maxChars, 'OUTPUT_BUDGET_TOO_SMALL');
      return result;
    }
    return Object.freeze({ retrieve });
  }
  function selectMemoryWriteTarget(input) {
    fields(input, ['kind']);
    check(['personal_memory', 'verified_outcome', 'both', 'unspecified'].includes(input.kind));
    return { schema: 'jh.memory-write-plan.v1', kind: input.kind,
      target: input.kind === 'personal_memory' ? 'memoria' : input.kind === 'verified_outcome' ? 'jh' : 'review',
      allowed: false, planOnly: true, execution: 'none', writePerformed: false, automaticSynchronization: false,
      requiresExplicitWriteRequest: true };
  }
  Object.defineProperty(root, 'JHMemoryFederation', { configurable: true, writable: true, enumerable: false,
    value: Object.freeze({ createHostMemoryOrchestrator, selectMemoryWriteTarget }) });
})(globalThis);
