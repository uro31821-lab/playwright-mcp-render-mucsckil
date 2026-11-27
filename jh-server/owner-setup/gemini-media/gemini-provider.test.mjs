import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiClient, GEMINI_MAX_VIDEO_BYTES, GEMINI_MAX_JSON_BYTES} from './gemini-provider.mjs';

const KEY = 'test-only-gemini-credential-000000000000';
const MODEL = 'gemini-3.5-flash-lite';
const request = {model: MODEL, input: [{type: 'text', text: 'summarize'}]};
const usage = {total_input_tokens: 7, total_cached_tokens: 0, total_output_tokens: 20,
  total_thought_tokens: 22, total_tool_use_tokens: 0, total_tokens: 49,
  input_tokens_by_modality: [{modality: 'text', tokens: 7}],
  output_tokens_by_modality: [{modality: 'text', tokens: 20}]};
const complete = (overrides = {}) => ({id: 'v1_test_123', status: 'completed', model: MODEL,
  steps: [{type: 'model_output', content: [{type: 'text', text: '요약 결과'}]}], usage, ...overrides});
const json = (value, options = {}) => new Response(JSON.stringify(value), {
  status: 200, headers: {'Content-Type': 'application/json'}, ...options});
const videoBytes = Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

test('one POST uses fixed endpoint, private header, stateless defaults and REST output only', async () => {
  const calls = [];
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({url, options});
    return json(complete({output_text: 'wrong SDK field', steps: [
      {type: 'user_input', content: [{type: 'text', text: 'private input'}]},
      {type: 'thought', content: [{type: 'text', text: 'hidden reasoning'}]},
      {type: 'model_output', content: [{type: 'thought', text: 'hidden content'}, {type: 'text', text: '요약 결과'}]},
    ]}));
  }});
  const r = await client.createInteraction(request);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(calls[0].options.headers['x-goog-api-key'], KEY);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.deepEqual(JSON.parse(calls[0].options.body), {...request, background: false, store: false});
  assert.equal(r.text, '요약 결과');
  assert.equal(r.state, 'completed');
  assert.equal(r.ok, true);
  assert.equal(r.dispatched, true);
  assert.equal(JSON.stringify(r).includes(KEY), false);
  assert.equal(request.store, undefined);
});

test('missing usage stays unknown; thought tokens stay separate from visible output tokens', async () => {
  let value = complete();
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => json(value)});
  const full = await client.createInteraction(request);
  assert.deepEqual(full.usage, usage);
  assert.equal(full.billingStatus, 'usage_reported');
  value = complete({usage: undefined});
  assert.equal((await client.createInteraction(request)).billingStatus, 'unknown');
  value = complete({usage: {total_input_tokens: 7, total_output_tokens: 20, total_thought_tokens: -1}});
  const partial = await client.createInteraction(request);
  assert.equal(partial.usage.total_thought_tokens, null);
  assert.equal(partial.billingStatus, 'unknown');
  value = complete({usage: {...usage, output_tokens_by_modality: [
    {modality: 'text', tokens: 20}, {modality: KEY, tokens: 50}, {modality: 'video', tokens: -1},
  ]}});
  const unknown = await client.createInteraction(request);
  assert.deepEqual(unknown.usage.output_tokens_by_modality, [
    {modality: 'text', tokens: 20}, {modality: 'unknown', tokens: 50}, {modality: 'video', tokens: null},
  ]);
  assert.equal(JSON.stringify(unknown).includes(KEY), false);
});

test('GET validates the opaque id, never submits a new interaction, and verifies returned id', async () => {
  const calls = [];
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({url, options}); return json(complete({status: 'in_progress', steps: [], usage: undefined}));
  }});
  for (const id of ['../files/secret', 'x?key=secret', '%2e%2e', 'https://evil.test', 'abc/def', '', KEY]) {
    assert.equal((await client.getInteraction(id)).code, 'INVALID_INTERACTION_ID');
  }
  assert.equal(calls.length, 0);
  const r = await client.getInteraction('v1_test_123');
  assert.equal(r.state, 'in_progress');
  assert.equal(r.ok, true);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].url.endsWith('/v1_test_123'), true);
  assert.equal((await client.getInteraction('other_id')).code, 'INVALID_PROVIDER_RESPONSE');
});

test('a failed status read preserves unknown state and the original interaction id', async () => {
  for (const status of [404, 429, 503]) {
    const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => new Response(KEY, {status})});
    const r = await client.getInteraction('v1_test_123');
    assert.equal(r.state, 'unknown');
    assert.equal(r.code, 'PROVIDER_UNAVAILABLE');
    assert.equal(r.interactionId, 'v1_test_123');
    assert.equal(r.billingStatus, 'unknown');
  }
});

test('configuration, model and incompatible background requests fail before dispatch', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(complete()); };
  assert.equal((await createGeminiClient({fetchImpl}).createInteraction(request)).code, 'API_KEY_REQUIRED');
  assert.equal((await createGeminiClient({apiKey: 'a\nb', fetchImpl}).createInteraction(request)).code, 'INVALID_CONFIGURATION');
  const client = createGeminiClient({apiKey: KEY, fetchImpl});
  for (const body of [null, {}, {...request, model: 'unpriced-model'}, {...request, background: true, store: false},
    {...request, input: KEY}]) {
    const r = await client.createInteraction(body);
    assert.equal(r.code, 'INVALID_REQUEST');
    assert.equal(r.billingStatus, 'not_dispatched');
  }
  assert.equal(calls, 0);
});

test('timeouts, network exceptions, redirects and 5xx never replay POST or reveal upstream errors', async () => {
  for (const status of [302, 408, 429, 500, 503]) {
    let calls = 0;
    const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => {
      calls++; return new Response(KEY + ' private image data', {status, headers: {Location: 'https://evil.test'}});
    }});
    const r = await client.createInteraction(request);
    assert.equal(r.code, 'UNKNOWN_SUBMISSION');
    assert.equal(r.dispatched, true);
    assert.equal(r.billingStatus, 'unknown');
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(r).includes(KEY), false);
  }
  let calls = 0;
  const throwing = createGeminiClient({apiKey: KEY, fetchImpl: async () => {calls++; throw new Error(KEY);}});
  assert.equal((await throwing.createInteraction(request)).code, 'UNKNOWN_SUBMISSION');
  assert.equal(calls, 1);
  const waiting = createGeminiClient({apiKey: KEY, timeoutMs: 15, fetchImpl: async () => new Promise(() => {})});
  assert.equal((await waiting.createInteraction(request)).code, 'UNKNOWN_SUBMISSION');
});

test('the deadline covers body streaming, not only arrival of HTTP headers', async () => {
  let cancelled = false;
  const client = createGeminiClient({apiKey: KEY, timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({
    start() {}, cancel() {cancelled = true;},
  }))});
  const r = await client.createInteraction(request);
  assert.equal(r.code, 'UNKNOWN_SUBMISSION');
  assert.equal(cancelled, true);
});

test('protocol errors and an oversized body remain unknown, never false completion or free billing', async () => {
  for (const response of [new Response('<html>error</html>'), json({status: 'completed'}),
    new Response('{}', {headers: {'Content-Length': String(GEMINI_MAX_JSON_BYTES + 1)}})]) {
    const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => response});
    const r = await client.createInteraction(request);
    assert.equal(r.code, 'UNKNOWN_SUBMISSION');
    assert.equal(r.ok, false);
    assert.equal(r.billingStatus, 'unknown');
  }
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => json(complete({model: 'gemini-omni-1.2-flash'}))});
  assert.equal((await client.createInteraction(request)).code, 'MODEL_MISMATCH');
});

test('requires_action, failed and empty results are not successful media completion', async () => {
  for (const status of ['requires_action', 'failed', 'cancelled']) {
    const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => json(complete({status, error: {message: KEY}}))});
    const r = await client.createInteraction(request);
    assert.equal(r.state, status);
    assert.equal(JSON.stringify(r).includes(KEY), false);
    if (status !== 'requires_action') assert.equal(r.ok, false);
  }
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => json(complete({steps: []}))});
  const r = await client.createInteraction(request);
  assert.equal(r.code, 'EMPTY_OUTPUT');
  assert.equal(r.ok, false);
  assert.equal(r.billingStatus, 'usage_reported');
});

test('video parsing accepts REST content and rejects credential-bearing or untrusted links', async () => {
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => json(complete({steps: [{type: 'model_output', content: [
    {type: 'text', text: `answer ${KEY}`},
    {type: 'video', mime_type: 'video/mp4', data: videoBytes.toString('base64')},
    {type: 'video', mime_type: 'video/mp4', uri: 'https://generativelanguage.googleapis.com/v1beta/files/safe'},
    {type: 'video', uri: `https://generativelanguage.googleapis.com/v1beta/files/x?key=${KEY}`},
    {type: 'video', uri: 'https://storage.googleapis.com/attacker/video.mp4'},
  ]}]}))});
  const r = await client.createInteraction(request);
  assert.equal(r.videos.length, 2);
  assert.equal(r.videos[1].uri, 'https://generativelanguage.googleapis.com/v1beta/files/safe?alt=media');
  assert.equal(r.text, 'answer [REDACTED]');
  assert.equal(JSON.stringify(r).includes(KEY), false);
});

test('inline video decoding is bounded, validates base64 and media bytes, and uses no network', async () => {
  let calls = 0;
  const client = createGeminiClient({fetchImpl: async () => {calls++; throw new Error('unexpected');}});
  const r = await client.downloadVideo({data: videoBytes.toString('base64'), mimeType: 'video/mp4'});
  assert.equal(r.ok, true);
  assert.deepEqual(r.bytes, videoBytes);
  assert.equal(r.dispatched, false);
  for (const data of ['', 'not base64!', 'a===', Buffer.from('<html>private</html>').toString('base64')]) {
    assert.equal((await client.downloadVideo({data})).ok, false);
  }
  assert.equal((await client.downloadVideo({data: 'AAAA', uri: 'https://evil.test'})).ok, false);
  assert.equal(calls, 0);
});

test('download blocks SSRF and credential exfiltration before any request', async () => {
  let calls = 0;
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => {calls++; return new Response(videoBytes);}});
  for (const uri of ['http://generativelanguage.googleapis.com/v1beta/files/x',
    'https://127.0.0.1/v1beta/files/x', 'https://[::1]/v1beta/files/x',
    'https://generativelanguage.googleapis.com.evil.test/v1beta/files/x',
    'https://generativelanguage.googleapis.com@evil.test/v1beta/files/x',
    'https://user:pass@generativelanguage.googleapis.com/v1beta/files/x',
    'https://generativelanguage.googleapis.com:444/v1beta/files/x',
    'https://generativelanguage.googleapis.com/v1beta/interactions/id',
    'https://generativelanguage.googleapis.com/v1beta/files/x?key=other',
    'https://generativelanguage.googleapis.com/v1beta/files/x#fragment',
    'https://generativelanguage.googleapis.com/v1beta/files/%2e%2e',
    'https://storage.googleapis.com/some-bucket/movie.mp4',
    'data:video/mp4;base64,AAAA']) {
    const r = await client.downloadVideo({uri});
    assert.equal(r.code, 'UNTRUSTED_VIDEO_URI', uri);
    assert.equal(r.dispatched, false);
  }
  assert.equal(calls, 0);
});

test('download sends key only to trusted file endpoint and refuses redirects, type mismatch and size overflow', async () => {
  const calls = [];
  let response = new Response(videoBytes, {headers: {'Content-Type': 'video/mp4'}});
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({url, options}); return response;
  }});
  const asset = {uri: 'https://generativelanguage.googleapis.com/v1beta/files/video_1:download?alt=media'};
  const r = await client.downloadVideo(asset);
  assert.equal(r.ok, true);
  assert.equal(calls[0].options.headers['x-goog-api-key'], KEY);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].url.includes(KEY), false);
  response = new Response('', {status: 302, headers: {Location: 'https://evil.test'}});
  assert.equal((await client.downloadVideo(asset)).code, 'VIDEO_DOWNLOAD_FAILED');
  response = new Response('private', {headers: {'Content-Type': 'text/html'}});
  assert.equal((await client.downloadVideo(asset)).code, 'VIDEO_TYPE_MISMATCH');
  response = new Response('<html>pretends to be a video</html>', {headers: {'Content-Type': 'video/mp4'}});
  assert.equal((await client.downloadVideo(asset)).code, 'INVALID_VIDEO_DATA');
  response = new Response(videoBytes, {headers: {'Content-Length': String(GEMINI_MAX_VIDEO_BYTES + 1)}});
  assert.equal((await client.downloadVideo(asset)).code, 'VIDEO_TOO_LARGE');
  assert.equal(calls.length, 5);
});

test('chunked downloads without Content-Length still enforce the shared 20 MiB maximum', async () => {
  assert.equal(GEMINI_MAX_VIDEO_BYTES, 20 * 1024 * 1024);
  const half = Buffer.alloc(GEMINI_MAX_VIDEO_BYTES / 2);
  const client = createGeminiClient({apiKey: KEY, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) {controller.enqueue(half); controller.enqueue(half); controller.enqueue(Uint8Array.of(1)); controller.close();},
  }), {headers: {'Content-Type': 'video/mp4'}})});
  const r = await client.downloadVideo({uri: 'https://generativelanguage.googleapis.com/v1beta/files/large'});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'VIDEO_TOO_LARGE');
  assert.equal(r.bytes, null);
});
