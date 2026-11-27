/**
 * Gemini transport only. The caller owns authorization, cost reservations,
 * durable job state and the request-id ledger. This module never retries a POST.
 * Official contracts checked 2026-11-27:
 * https://aistudio.google.com/api-reference/interactions-api/create-interaction
 * https://aistudio.google.com/docs/video-understanding
 * https://aistudio.google.com/docs/omni
 *
 * Analysis body example:
 * {model:'gemini-3.5-flash-lite', input:[
 *   {type:'video',uri:'https://www.youtube.com/watch?v=VIDEO_ID',resolution:'low',
 *    processing:{type:'static',fps:1,start_offset:'0s',end_offset:'600s'}},
 *   {type:'text',text:'Summarize the selected interval in Korean.'}],
 *   generation_config:{max_output_tokens:2048},store:false,background:false}
 * Generation body example:
 * {model:'gemini-omni-1.2-flash', input:[
 *   {type:'image',mime_type:'image/jpeg',data:'RAW_BASE64'},
 *   {type:'text',text:'USER_APPROVED_PROMPT'}],
 *   response_format:{type:'video',duration:'8s',resolution:'720p',aspect_ratio:'16:9'},
 *   store:false,background:false}
 * REST output is steps[].model_output.content; SDK output_video/output_text
 * conveniences are deliberately not treated as the REST contract.
 */

const API_ORIGIN = 'https://generativelanguage.googleapis.com';
const INTERACTIONS_PATH = '/v1beta/interactions';
const MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-omni-1.2-flash']);
const STATES = new Set(['completed', 'in_progress', 'requires_action', 'requires_continuation', 'failed', 'cancelled']);
const MODALITIES = new Set(['text', 'image', 'video', 'audio', 'document']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);
export const GEMINI_MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const GEMINI_MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_CHARS = 2 * 1024 * 1024;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function baseResult(overrides = {}) {
  return {
    ok: false, code: 'NOT_DISPATCHED', state: 'not_dispatched',
    interactionId: null, model: null, text: '', videos: [], usage: null,
    billingStatus: 'not_dispatched', dispatched: false, ...overrides,
  };
}

function usageOf(value) {
  if (!record(value)) return null;
  const usage = {};
  for (const field of ['total_input_tokens', 'total_cached_tokens', 'total_output_tokens',
    'total_thought_tokens', 'total_tool_use_tokens', 'total_tokens']) usage[field] = tokenCount(value[field]);
  for (const field of ['input_tokens_by_modality', 'output_tokens_by_modality']) {
    usage[field] = Array.isArray(value[field]) ? value[field]
      .map(item => ({modality: record(item) && MODALITIES.has(item.modality) ? item.modality : 'unknown',
        tokens: record(item) ? tokenCount(item.tokens) : null})) : [];
  }
  return usage;
}

function hasBillableUsage(usage) {
  return usage !== null && ['total_input_tokens', 'total_output_tokens', 'total_thought_tokens']
    .every(field => usage[field] !== null);
}

/** Credentials are sent only to the Gemini files endpoint, never to arbitrary
 * Google-owned buckets, googleusercontent hosts, redirect targets or query URLs. */
function fileDownloadUrl(uri) {
  if (typeof uri !== 'string' || uri.length > 2048 || /[\u0000-\u0020\\]/.test(uri)) return null;
  let url;
  try { url = new URL(uri); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'generativelanguage.googleapis.com' ||
      url.username || url.password || url.port || url.hash ||
      !/^\/v1(?:beta)?\/files\/[A-Za-z0-9_-]{1,256}(?::download)?$/.test(url.pathname)) return null;
  for (const [name, value] of url.searchParams) if (name !== 'alt' || value !== 'media') return null;
  if (url.searchParams.getAll('alt').length > 1) return null;
  url.searchParams.set('alt', 'media');
  return url.href;
}

function redact(value, key) {
  return key && value.includes(key) ? value.split(key).join('[REDACTED]') : value;
}

function normalizeInteraction(payload, key, method, expectedModel, expectedId) {
  const ambiguous = () => baseResult({code: method === 'POST' ? 'UNKNOWN_SUBMISSION' : 'INVALID_PROVIDER_RESPONSE',
    state: 'unknown', billingStatus: 'unknown', dispatched: true});
  if (!record(payload) || typeof payload.id !== 'string' || !ID_PATTERN.test(payload.id) ||
      payload.id.includes(key) || !STATES.has(payload.status)) return ambiguous();
  if (expectedId && payload.id !== expectedId) return ambiguous();
  const model = typeof payload.model === 'string' && MODEL_PATTERN.test(payload.model) &&
    !payload.model.includes(key) ? payload.model : null;
  const usage = usageOf(payload.usage);
  const common = {interactionId: payload.id, model, usage, dispatched: true,
    billingStatus: hasBillableUsage(usage) ? 'usage_reported' : 'unknown'};
  if (expectedModel && model !== expectedModel) return baseResult({...common,
    code: 'MODEL_MISMATCH', state: 'unknown', billingStatus: 'unknown'});
  const text = [], videos = [];
  for (const step of Array.isArray(payload.steps) ? payload.steps : []) {
    if (!record(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const content of step.content) {
      if (!record(content)) continue;
      if (content.type === 'text' && typeof content.text === 'string') {
        text.push(redact(content.text, key));
      } else if (content.type === 'video') {
        const mimeType = typeof content.mime_type === 'string' ? content.mime_type : 'video/mp4';
        if (!VIDEO_MIMES.has(mimeType)) continue;
        if (typeof content.data === 'string' && content.data.length > 0 && !content.data.includes(key) &&
            content.data.length <= Math.ceil(GEMINI_MAX_VIDEO_BYTES / 3) * 4) {
          videos.push({data: content.data, mimeType});
        } else if (typeof content.uri === 'string' && !content.uri.includes(key)) {
          const uri = fileDownloadUrl(content.uri);
          if (uri) videos.push({uri, mimeType});
        }
      }
    }
  }
  const joined = text.join('\n');
  if (joined.length > MAX_TEXT_CHARS) return baseResult({...common,
    code: 'OUTPUT_TOO_LARGE', state: 'unknown', billingStatus: 'unknown'});
  const state = payload.status;
  const ok = !['failed', 'cancelled'].includes(state);
  const code = state === 'completed' ? (joined || videos.length ? 'COMPLETED' : 'EMPTY_OUTPUT')
    : state.toUpperCase();
  return baseResult({...common, ok: ok && code !== 'EMPTY_OUTPUT', code, state, text: joined, videos});
}

function cancelBody(response) {
  try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* No payload/error logging. */ }
}

async function readBounded(response, limit, signal) {
  const length = response.headers?.get?.('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > limit) {
    cancelBody(response); throw new Error('RESPONSE_TOO_LARGE');
  }
  if (!response.body?.getReader) throw new Error('INVALID_RESPONSE_STREAM');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  signal.addEventListener('abort', cancel, {once: true});
  try {
    for (;;) {
      if (signal.aborted) throw new Error('DEADLINE_EXCEEDED');
      const {done, value} = await reader.read();
      if (signal.aborted) throw new Error('DEADLINE_EXCEEDED');
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('INVALID_RESPONSE_STREAM');
      size += value.byteLength;
      if (size > limit) { cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
      if (chunks.length >= 8192) { cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener('abort', cancel);
    try { reader.releaseLock(); } catch {}
  }
}

async function deadline(timeoutMs, operation) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('DEADLINE_EXCEEDED'));
      controller.abort();
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}

function isVideoBytes(bytes, mimeType) {
  if (mimeType === 'video/mp4') return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  return mimeType === 'video/webm' && bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 &&
    bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function createGeminiClient({apiKey, fetchImpl = globalThis.fetch, timeoutMs = 120_000} = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const configError = !key ? 'API_KEY_REQUIRED' : key.length > 4096 || /[\u0000-\u0020\u007f]/.test(key) ||
    typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000
      ? 'INVALID_CONFIGURATION' : null;

  async function request(method, path, body, expectedId) {
    if (configError) return baseResult({code: configError});
    let bodyText;
    if (method === 'POST') {
      if (!record(body) || !MODELS.has(body.model) || !('input' in body)) return baseResult({code: 'INVALID_REQUEST'});
      const normalizedBody = {...body, background: body.background ?? false, store: body.store ?? false};
      if (typeof normalizedBody.background !== 'boolean' || typeof normalizedBody.store !== 'boolean' ||
          (normalizedBody.background && !normalizedBody.store)) return baseResult({code: 'INVALID_REQUEST'});
      try { bodyText = JSON.stringify(normalizedBody); } catch { return baseResult({code: 'INVALID_REQUEST'}); }
      if (bodyText.includes(key)) return baseResult({code: 'INVALID_REQUEST'});
      if (Buffer.byteLength(bodyText) > MAX_REQUEST_BYTES) return baseResult({code: 'REQUEST_TOO_LARGE'});
    }
    let dispatched = false;
    try {
      return await deadline(timeoutMs, async signal => {
        dispatched = true;
        const response = await fetchImpl(API_ORIGIN + path, {
          method, headers: {'x-goog-api-key': key, 'Content-Type': 'application/json'},
          ...(bodyText === undefined ? {} : {body: bodyText}), redirect: 'manual', signal,
        });
        if (!response || !Number.isInteger(response.status)) throw new Error('INVALID_RESPONSE');
        if (response.redirected || response.status < 200 || response.status >= 300) {
          cancelBody(response);
          // Failure to READ a job is not evidence that the underlying job failed.
          if (method === 'GET') return baseResult({dispatched: true, billingStatus: 'unknown',
            interactionId: expectedId, state: 'unknown', code: [401, 403].includes(response.status)
              ? 'PROVIDER_AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE'});
          const ambiguous = method === 'POST' && (response.redirected || response.status < 400 ||
            response.status >= 500 || [408, 409, 425, 429].includes(response.status));
          return baseResult({dispatched: true, billingStatus: 'unknown', state: ambiguous ? 'unknown' : 'failed',
            code: ambiguous ? 'UNKNOWN_SUBMISSION' : [401, 403].includes(response.status)
              ? 'PROVIDER_AUTH_REQUIRED' : 'PROVIDER_REJECTED'});
        }
        const bytes = await readBounded(response, GEMINI_MAX_JSON_BYTES, signal);
        let payload;
        try { payload = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('INVALID_RESPONSE'); }
        return normalizeInteraction(payload, key, method, body?.model, expectedId);
      });
    } catch {
      return baseResult({dispatched, billingStatus: dispatched ? 'unknown' : 'not_dispatched',
        interactionId: method === 'GET' ? expectedId : null,
        state: dispatched ? 'unknown' : 'not_dispatched',
        code: dispatched && method === 'POST' ? 'UNKNOWN_SUBMISSION' : 'PROVIDER_UNAVAILABLE'});
    }
  }

  async function downloadVideo(asset) {
    const result = (overrides = {}) => ({ok: false, code: 'INVALID_ASSET', mimeType: null,
      bytes: null, dispatched: false, ...overrides});
    if (!record(asset)) return result();
    const mimeType = asset.mimeType ?? asset.mime_type ?? 'video/mp4';
    if (!VIDEO_MIMES.has(mimeType)) return result({code: 'UNSUPPORTED_VIDEO_TYPE'});
    const hasData = typeof asset.data === 'string', hasUri = typeof asset.uri === 'string';
    if (hasData === hasUri) return result();
    if (hasData) {
      if (!asset.data.length || asset.data.length > Math.ceil(GEMINI_MAX_VIDEO_BYTES / 3) * 4)
        return result({code: asset.data.length ? 'VIDEO_TOO_LARGE' : 'INVALID_ASSET'});
      const paddingAt = asset.data.indexOf('=');
      if (asset.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(asset.data) ||
          (paddingAt !== -1 && !['=', '=='].includes(asset.data.slice(paddingAt))))
        return result({code: 'INVALID_VIDEO_DATA'});
      const bytes = Buffer.from(asset.data, 'base64');
      if (bytes.length > GEMINI_MAX_VIDEO_BYTES) return result({code: 'VIDEO_TOO_LARGE'});
      if (!isVideoBytes(bytes, mimeType)) return result({code: 'INVALID_VIDEO_DATA'});
      return result({ok: true, code: 'DOWNLOADED', bytes, mimeType});
    }
    const uri = fileDownloadUrl(asset.uri);
    if (!uri) return result({code: 'UNTRUSTED_VIDEO_URI'});
    if (configError) return result({code: configError});
    let dispatched = false;
    try {
      return await deadline(timeoutMs, async signal => {
        dispatched = true;
        const response = await fetchImpl(uri, {method: 'GET', headers: {'x-goog-api-key': key}, redirect: 'manual', signal});
        if (!response || response.redirected || response.status < 200 || response.status >= 300) {
          if (response) cancelBody(response);
          return result({code: 'VIDEO_DOWNLOAD_FAILED', dispatched});
        }
        const contentType = response.headers?.get?.('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (contentType && contentType !== mimeType && contentType !== 'application/octet-stream') {
          cancelBody(response); return result({code: 'VIDEO_TYPE_MISMATCH', dispatched});
        }
        const bytes = await readBounded(response, GEMINI_MAX_VIDEO_BYTES, signal);
        if (!isVideoBytes(bytes, mimeType)) return result({code: 'INVALID_VIDEO_DATA', dispatched});
        return result({ok: true, code: 'DOWNLOADED', bytes, mimeType, dispatched});
      });
    } catch (error) {
      return result({code: error?.message === 'RESPONSE_TOO_LARGE' ? 'VIDEO_TOO_LARGE' : 'VIDEO_DOWNLOAD_FAILED', dispatched});
    }
  }

  return Object.freeze({
    createInteraction: body => request('POST', INTERACTIONS_PATH, body),
    getInteraction: id => typeof id !== 'string' || !ID_PATTERN.test(id) || (key && id.includes(key))
      ? Promise.resolve(baseResult({code: 'INVALID_INTERACTION_ID'}))
      : request('GET', `${INTERACTIONS_PATH}/${encodeURIComponent(id)}`, undefined, id),
    downloadVideo,
  });
}
