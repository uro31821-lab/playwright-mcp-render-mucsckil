/*
 * Portable adapter for the connected read-only GitHub search and fetch tools.
 * The host declares public owner/repository scopes for exact reviewed queries.
 * No imports, transport, credentials, storage, schedules, or device actions.
 * R.collect enforces that fetches were selected from its search results; this
 * adapter also validates repository scope and exact returned blob URL identity.
 */
(function installJHProactiveGitHub(root) {
  'use strict';

  const VERSION = '1.0.0';
  const MAX_WRAPPERS = 6;
  const MAX_TEXT = 16000;
  const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function check(value, code = 'PROACTIVE_GITHUB_INPUT_INVALID') {
    if (!value) fail(code);
  }
  function plain(value, code = 'PROACTIVE_GITHUB_INPUT_INVALID') {
    check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    check(Reflect.ownKeys(value).every(key => typeof key === 'string' && !RESERVED.has(key)) &&
      Object.values(descriptors).every(item => own(item, 'value') && item.enumerable), code);
  }
  function fields(value, required, optional = []) {
    plain(value);
    check(required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
  }
  function string(value, max, code = 'PROACTIVE_GITHUB_INPUT_INVALID') {
    check(typeof value === 'string' && value.length > 0 && value.length <= max &&
      value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), code);
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index);
        check(next >= 0xdc00 && next <= 0xdfff, code);
      } else check(unit < 0xdc00 || unit > 0xdfff, code);
    }
    return value;
  }
  function reviewedQuery(value) {
    string(value, 180);
    check(!/\bBearer\s+\S+|(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|secret|authorization)\s*[:=]\s*\S+/i.test(value) &&
      !/(?:https?|ftp|file|data):|www\.|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i.test(value) &&
      !/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/.test(value));
    return value;
  }
  function repository(value, code = 'PROACTIVE_GITHUB_INPUT_INVALID') {
    string(value, 200, code);
    check(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(value) &&
      !['.', '..'].includes(value.split('/')[1]), code);
    return value;
  }
  function blobURL(value, allowed, code = 'PROACTIVE_GITHUB_URL_INVALID') {
    string(value, 2048, code);
    check(!/[\s\\?#]/.test(value), code);
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(value);
    check(match, code);
    const name = repository(`${match[1]}/${match[2]}`, code);
    check(allowed.has(name.toLowerCase()), 'PROACTIVE_GITHUB_SCOPE_MISSING');
    for (const segment of [match[3], ...match[4].split('/')]) {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch { fail(code); }
      check(decoded.length > 0 && decoded !== '.' && decoded !== '..' &&
        !/[\u0000-\u0020\u007f\\/]/.test(decoded), code);
    }
    return value;
  }

  // Real tool replies can carry two nested structuredContent objects, with
  // outer content blocks and a deepest string content field. Never parse text
  // blocks as a successful result or manufacture a URL from a repository path.
  function unwrap(value) {
    const chain = [];
    const seen = new Set();
    for (let depth = 0; depth <= MAX_WRAPPERS; depth++) {
      plain(value, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
      check(!seen.has(value), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
      seen.add(value);
      check(value.isError !== true && value.ok !== false && value.success !== false &&
        (!own(value, 'error') || value.error === null || value.error === undefined), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
      chain.push(value);
      const nextKeys = ['structuredContent', 'result'].filter(key => own(value, key));
      check(nextKeys.length <= 1, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
      if (nextKeys.length === 0) return { value, chain };
      check(depth < MAX_WRAPPERS, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
      value = value[nextKeys[0]];
    }
    fail('PROACTIVE_GITHUB_RESPONSE_INVALID');
  }
  function returnedURL(chain, allowed, expected) {
    let selected;
    for (const value of chain) {
      for (const key of ['display_url', 'url']) {
        if (!own(value, key)) continue;
        const url = blobURL(value[key], allowed);
        if (selected !== undefined) check(selected === url, 'PROACTIVE_GITHUB_URL_MISMATCH');
        if (expected !== undefined) check(expected === url, 'PROACTIVE_GITHUB_URL_MISMATCH');
        selected = url;
      }
    }
    check(selected !== undefined, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
    return selected;
  }
  function title(value, truncated = false) {
    string(value, 4000, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
    const suffix = truncated ? ' (excerpt)' : '';
    let prefix = value.slice(0, 240 - suffix.length);
    const last = prefix.charCodeAt(prefix.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
    return prefix + suffix;
  }
  async function invoke(callback, input) {
    try { return await callback(input); }
    catch { fail('PROACTIVE_GITHUB_PROVIDER_ERROR'); }
  }
  function timestamp(now) {
    let value;
    try { value = now(); } catch { fail('PROACTIVE_GITHUB_TIME_INVALID'); }
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), 'PROACTIVE_GITHUB_TIME_INVALID');
    let canonical;
    try { canonical = new Date(value).toISOString(); } catch { fail('PROACTIVE_GITHUB_TIME_INVALID'); }
    check(canonical === value, 'PROACTIVE_GITHUB_TIME_INVALID');
    return value;
  }

  function create(options) {
    fields(options, ['search', 'fetch', 'scopes'], ['now']);
    check(typeof options.search === 'function' && typeof options.fetch === 'function' &&
      (options.now === undefined || typeof options.now === 'function'));
    plain(options.scopes);
    const entries = Object.entries(options.scopes);
    check(entries.length > 0 && entries.length <= 100);
    const scopes = new Map();
    const allRepositories = new Set();
    for (const [query, raw] of entries) {
      reviewedQuery(query);
      const names = typeof raw === 'string' ? [raw] : raw;
      check(Array.isArray(names) && names.length > 0 && names.length <= 8);
      const values = names.map(name => repository(name));
      check(new Set(values.map(name => name.toLowerCase())).size === values.length);
      scopes.set(query, values.slice());
      values.forEach(name => allRepositories.add(name.toLowerCase()));
    }
    const searchTool = options.search;
    const fetchTool = options.fetch;
    const now = options.now || (() => new Date().toISOString());

    return Object.freeze({
      async search(input) {
        fields(input, ['query', 'limit']);
        const query = reviewedQuery(input.query);
        check(Number.isSafeInteger(input.limit) && input.limit >= 1 && input.limit <= 6);
        check(scopes.has(query), 'PROACTIVE_GITHUB_SCOPE_MISSING');
        const batches = await Promise.all(scopes.get(query).map(async name => {
          const result = unwrap(await invoke(searchTool, { query, repository_name: name, topn: input.limit })).value;
          check(Array.isArray(result.results) && result.results.length <= 100, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
          const allowed = new Set([name.toLowerCase()]);
          return result.results.map(item => {
            plain(item, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
            const url = returnedURL([item], allowed);
            const label = own(item, 'display_title') ? item.display_title : own(item, 'title') ? item.title : item.path;
            return { url, title: title(label) };
          });
        }));
        const merged = new Map();
        for (const item of batches.flat()) {
          if (merged.has(item.url)) check(merged.get(item.url).title === item.title, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
          else merged.set(item.url, item);
        }
        return [...merged.values()].slice(0, input.limit);
      },
      async fetch(input) {
        fields(input, ['url']);
        const requested = blobURL(input.url, allRepositories);
        const reply = unwrap(await invoke(fetchTool, { url: requested }));
        const url = returnedURL(reply.chain, allRepositories, requested);
        check(typeof reply.value.content === 'string', 'PROACTIVE_GITHUB_RESPONSE_INVALID');
        const truncated = reply.value.content.length > MAX_TEXT;
        let text = reply.value.content.slice(0, MAX_TEXT);
        const last = text.charCodeAt(text.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);
        string(text, MAX_TEXT, 'PROACTIVE_GITHUB_RESPONSE_INVALID');
        let label;
        for (const value of reply.chain) {
          if (own(value, 'title')) label = value.title;
          else if (own(value, 'display_title')) label = value.display_title;
        }
        return { url, title: title(label, truncated), text, retrievedAt: timestamp(now), kind: 'source' };
      },
    });
  }

  root.JHProactiveGitHub = Object.freeze({ VERSION, create });
})(globalThis);
