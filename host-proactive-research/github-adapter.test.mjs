/** Synthetic GitHub tool fixtures only. No network calls or private scopes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './github-adapter.js';

const G = globalThis.JHProactiveGitHub;
const QUERY = 'synthetic checkpoint implementation';
const REPO = 'synthetic-owner/synthetic-project';
const OTHER = 'synthetic-owner/second-project';
const PIN = 'a'.repeat(40);
const URL = `https://github.com/${REPO}/blob/${PIN}/src/checkpoint.js`;
const OTHER_URL = `https://github.com/${OTHER}/blob/${PIN}/README.md`;
const NOW = '2026-11-02T12:34:56.789Z';
const searchReply = (url = URL) => ({ structuredContent: { results: [{
  url, path: 'src/checkpoint.js', display_url: url, display_title: 'Synthetic checkpoint source', text_matches: [],
}] } });
const fetchReply = (content = 'Synthetic source content.', url = URL) => ({
  structuredContent: { content, title: 'Synthetic checkpoint source', url, display_url: url,
    structuredContent: { title: 'Synthetic checkpoint source', content, display_url: url } },
});
const create = overrides => G.create({ search: async () => searchReply(), fetch: async () => fetchReply(),
  scopes: { [QUERY]: REPO }, now: () => NOW, ...overrides });
const rejectsCode = (callback, code) => assert.rejects(callback, error => error.code === code && error.message === code);

test('actual-shaped nested public source replies work in a portable realm without network or Node globals', async () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new globalThis.URL('./github-adapter.js', import.meta.url), 'utf8'), sandbox);
  const result = JSON.parse(await vm.runInContext(`(async () => {
    const calls = [];
    const adapter = JHProactiveGitHub.create({
      scopes:{'${QUERY}':'${REPO}'},now:()=>'${NOW}',
      search:async input=>{calls.push(input);return ${JSON.stringify(searchReply())};},
      fetch:async input=>{calls.push(input);return ${JSON.stringify(fetchReply())};}
    });
    const results = await adapter.search({query:'${QUERY}',limit:2});
    const source = await adapter.fetch({url:results[0].url});
    return JSON.stringify({results,source,calls,network:typeof fetch,node:typeof process,url:typeof URL});
  })()`, sandbox));
  assert.deepEqual(result.results, [{ url: URL, title: 'Synthetic checkpoint source' }]);
  assert.deepEqual(result.source, { url: URL, title: 'Synthetic checkpoint source', text: 'Synthetic source content.', retrievedAt: NOW, kind: 'source' });
  assert.deepEqual(result.calls, [{ query: QUERY, repository_name: REPO, topn: 2 }, { url: URL }]);
  assert.equal(result.network, 'undefined');
  assert.equal(result.node, 'undefined');
  assert.equal(result.url, 'undefined');
});

test('exact query scopes gate tool calls and multiple public repositories preserve bounds', async () => {
  const calls = [];
  const adapter = create({ scopes: { [QUERY]: [REPO, OTHER] }, search: async input => {
    calls.push(input);
    return searchReply(input.repository_name === REPO ? URL : OTHER_URL);
  } });
  await rejectsCode(() => adapter.search({ query: `${QUERY} unscoped`, limit: 2 }), 'PROACTIVE_GITHUB_SCOPE_MISSING');
  assert.equal(calls.length, 0);
  const results = await adapter.search({ query: QUERY, limit: 1 });
  assert.equal(results.length, 1);
  assert.deepEqual(calls.map(call => call.repository_name), [REPO, OTHER]);
  assert.ok(calls.every(call => call.query === QUERY && call.topn === 1));
  await rejectsCode(() => adapter.fetch({ url: URL.replace(REPO, 'unlisted-owner/private-project') }), 'PROACTIVE_GITHUB_SCOPE_MISSING');
});

test('malformed or failed searches throw sanitized errors while an explicit empty results array stays empty', async () => {
  for (const malformed of [{}, { structuredContent: {} }, { structuredContent: { results: 'not an array' } },
    { isError: true, structuredContent: { results: [] } }, { structuredContent: { results: [{ path: 'README.md', display_title: 'No URL' }] } }]) {
    const adapter = create({ search: async () => malformed });
    await rejectsCode(() => adapter.search({ query: QUERY, limit: 2 }), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
  }
  const circular = {}; circular.result = circular;
  await rejectsCode(() => create({ search: async () => circular }).search({ query: QUERY, limit: 2 }), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
  const failed = create({ search: async () => { throw new Error('Bearer synthetic-secret-must-not-leak'); } });
  await rejectsCode(() => failed.search({ query: QUERY, limit: 2 }), 'PROACTIVE_GITHUB_PROVIDER_ERROR');
  assert.deepEqual(await create({ search: async () => ({ result: { structuredContent: { results: [] } } }) }).search({ query: QUERY, limit: 2 }), []);
});

test('fetch requires actual returned URL equality at every wrapper and never constructs a URL from a path', async () => {
  const different = URL.replace('/src/checkpoint.js', '/src/other.js');
  await rejectsCode(() => create({ fetch: async () => fetchReply('Different source.', different) }).fetch({ url: URL }), 'PROACTIVE_GITHUB_URL_MISMATCH');
  const conflict = fetchReply();
  conflict.structuredContent.structuredContent.display_url = different;
  await rejectsCode(() => create({ fetch: async () => conflict }).fetch({ url: URL }), 'PROACTIVE_GITHUB_URL_MISMATCH');
  await rejectsCode(() => create({ fetch: async () => ({ structuredContent: { title: 'Missing URL', content: 'Synthetic text.', path: 'src/checkpoint.js' } }) }).fetch({ url: URL }), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
  const searchConflict = searchReply();
  searchConflict.structuredContent.results[0].display_url = different;
  await rejectsCode(() => create({ search: async () => searchConflict }).search({ query: QUERY, limit: 2 }), 'PROACTIVE_GITHUB_URL_MISMATCH');
});

test('only scoped GitHub blob URLs reach a fetch callback', async () => {
  let fetched = 0;
  const adapter = create({ fetch: async () => { fetched++; return fetchReply(); } });
  const invalid = [
    URL.replace('https:', 'http:'), URL.replace('github.com', 'github.com.evil.example'),
    URL.replace('github.com', 'user:secret@github.com'), URL.replace('/blob/', '/tree/'),
    URL.replace('/blob/', '/raw/'), `${URL}?access_token=synthetic-secret`,
    URL.replace('/src/checkpoint.js', '/../private'), 'https://127.0.0.1/private',
  ];
  for (const url of invalid) await rejectsCode(() => adapter.fetch({ url }), 'PROACTIVE_GITHUB_URL_INVALID');
  assert.equal(fetched, 0);
});

test('large source text is an exact bounded Unicode-safe prefix, clearly marked as excerpt, timestamped after retrieval', async () => {
  let fetched = false;
  let clocks = 0;
  const original = 'A'.repeat(15999) + '😀' + 'B'.repeat(100);
  const adapter = create({ fetch: async () => { fetched = true; return fetchReply(original); }, now: () => {
    assert.equal(fetched, true); clocks++; return NOW;
  } });
  const source = await adapter.fetch({ url: URL });
  assert.equal(source.text, original.slice(0, 15999));
  assert.ok(source.text.length <= 16000);
  assert.match(source.title, /\(excerpt\)$/);
  assert.equal(source.retrievedAt, NOW);
  assert.equal(source.kind, 'source');
  assert.equal(clocks, 1);
});

test('missing content, malformed wrappers, invalid clocks, and fetch provider errors cannot become evidence', async () => {
  for (const content of ['', '   ', null, [], { text: 'Not a source string.' }]) {
    await rejectsCode(() => create({ fetch: async () => fetchReply(content) }).fetch({ url: URL }), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
  }
  let tooDeep = { content: 'Synthetic content.', title: 'Synthetic source', url: URL };
  for (let depth = 0; depth < 8; depth++) tooDeep = { result: tooDeep };
  await rejectsCode(() => create({ fetch: async () => tooDeep }).fetch({ url: URL }), 'PROACTIVE_GITHUB_RESPONSE_INVALID');
  await rejectsCode(() => create({ now: () => '2026-02-30T00:00:00.000Z' }).fetch({ url: URL }), 'PROACTIVE_GITHUB_TIME_INVALID');
  await rejectsCode(() => create({ fetch: async () => { throw new Error('synthetic credentials in provider error'); } }).fetch({ url: URL }), 'PROACTIVE_GITHUB_PROVIDER_ERROR');
});
