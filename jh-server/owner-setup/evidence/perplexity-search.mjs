/**
 * JH evidence lookup — Perplexity STANDARD Search API only.
 *
 * Server-side MCP tool: no Android Bridge, browser, Agent API, generated answer,
 * automatic research or scheduled searches. The user's verbatim evidence request
 * is used locally to gate a lookup; only a short, de-identified search query is
 * sent to Perplexity. Returned snippets are UNVERIFIED source material for GPT.
 */
const SEARCH_ENDPOINT = 'https://api.perplexity.ai/search';
const STANDARD_REQUEST_USD = 0.005; // Published $5 / 1,000 successful requests.
const SEARCH_TIMEOUT_MS = 18_000;
const MAX_RESPONSE_CHARS = 1_000_000;
// Search is opt-in: merely mentioning "논문" or "근거" in a summary is NOT intent.
const EVIDENCE_WORD = '(?:근거|증거|출처|논문|자료|원문|참고\\s*문헌|인용\\s*출처|source(?:s)?|citation(?:s)?|reference(?:s)?|evidence|papers?)';
const EVIDENCE_ACTION = '(?:찾아|검색|보여|제시|제공|확인|검증|대조|링크|인용|달라|있어|있나|어디서|show|find|provide|give|cite|verify|check)';
const EVIDENCE_INTENT_NEAR = new RegExp(EVIDENCE_WORD + '.{0,32}?' + EVIDENCE_ACTION + '|' + EVIDENCE_ACTION + '.{0,28}?' + EVIDENCE_WORD, 'i');
const BARE_REQUEST = /^(?:근거|증거|출처|논문|자료|원문|참고\s*문헌|팩트\s*체크|evidence|sources?|citations?|references?|papers?)(?:는|가|은|만|좀|요)?\s*[?!.]?$/i;
// Short elliptical follow-ups refer to the immediately preceding explanation.
// "관련 자료는?" must be explicit opt-in, but ordinary mention of "자료" is NOT.
const CONTEXTUAL_BARE_REQUEST = /^(?:(?:관련(?:된|한)?|그(?:에\s*대한)?|이에\s*대한|이\s*주장의|방금\s*말한|앞서\s*말한)\s+)(?:근거|증거|출처|논문|자료|원문|참고\s*문헌)(?:는|가|은|만|좀|요|도|들)?\s*[?!.]?$/i;
const NO_EXTERNAL_RESEARCH = /(?:검색|조사|근거\s*조사|출처\s*검색|perplexity\s*호출|퍼플렉시티\s*호출).{0,15}(?:하지\s*마|말아|말고|필요\s*없|금지)|(?:근거|증거|출처|논문|자료|원문).{0,16}(?:찾지\s*마|요구하지\s*않|필요\s*없)/i;

export function isExplicitEvidenceRequest(value) {
  if (typeof value !== 'string' || value.length > 4000) return false;
  const text = value.trim();
  if (!text || NO_EXTERNAL_RESEARCH.test(text)) return false;
  if (/source\s*code|소스\s*코드/i.test(text) && !/(?:출처|근거|증거|논문|팩트\s*체크)/i.test(text)) return false;
  // A single-word follow-up like "근거?" also expresses an explicit request.
  if (BARE_REQUEST.test(text) || CONTEXTUAL_BARE_REQUEST.test(text)) return true;
  if (/(?:팩트\s*체크|fact[ -]?check)(?:해\s*줘|해\s*주세요|해\s*봐|부탁|요청|해주세요)/i.test(text)) return true;
  if (/(?:근거|출처|증거)\s*(?:는|가|은)?\s*(?:뭐야|어디야|어디서)/i.test(text)) return true;
  // Require a search/verification verb CLOSE to the evidence object.
  return EVIDENCE_INTENT_NEAR.test(text);
}

function validSearchQuery(query) {
  const items = typeof query === 'string' ? [query] : query;
  if (!Array.isArray(items) || items.length < 1 || items.length > 5) return null;
  const prepared = items.map(x => typeof x === 'string' ? x.trim() : '');
  if (prepared.some(x => x.length < 3 || x.length > 500 || /[\u0000-\u001f]/.test(x))) return null;
  // Obvious account identifiers are never sent to an external search provider.
  if (prepared.some(x => /\b\d{6}[- ]?[1-8]\d{6}\b|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:sk-proj-|pplx-)[A-Za-z0-9_-]{12,}|(?:환자명|주민등록번호|차트번호)\s*[:=]\s*\S{2,}/i.test(x))) return null;
  return prepared.length === 1 ? prepared[0] : prepared;
}


const RECENCY_VALUES = new Set(['hour', 'day', 'week', 'month', 'year']);
const DATE_FILTERS = ['search_after_date_filter', 'search_before_date_filter',
  'last_updated_after_filter', 'last_updated_before_filter'];
const LANG_FILTER = /^[a-z]{2}$/i;
const DOMAIN_FILTER = /^-?(?:(?:\.[a-z]{2,})|(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}))(?:\/[a-z0-9._~!function sourceUrl(value) {'()*+,;=:@%/?-]*)?$/i;

function validSearchOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  const max_results = options.max_results ?? 10;
  const max_tokens = options.max_tokens ?? 12_000;
  const max_tokens_per_page = options.max_tokens_per_page ?? 1_500;
  if (!Number.isInteger(max_results) || max_results < 1 || max_results > 20) return null;
  if (![max_tokens, max_tokens_per_page].every(v => Number.isInteger(v) && v >= 1 && v <= 1_000_000)) return null;
  const params = {max_results, max_tokens, max_tokens_per_page};
  if (options.country !== undefined) {
    if (typeof options.country !== 'string' || !/^[a-z]{2}$/i.test(options.country)) return null;
    params.country = options.country.toUpperCase();
  }
  if (options.search_domain_filter !== undefined) {
    const domains = options.search_domain_filter;
    if (!Array.isArray(domains) || domains.length < 1 || domains.length > 20 ||
        domains.some(x => typeof x !== 'string' || x.length > 253 || !DOMAIN_FILTER.test(x))) return null;
    if (domains.some(x => x.startsWith('-')) && domains.some(x => !x.startsWith('-'))) return null;
    params.search_domain_filter = domains;
  }
  if (options.search_language_filter !== undefined) {
    const languages = options.search_language_filter;
    if (!Array.isArray(languages) || languages.length < 1 || languages.length > 20 ||
        languages.some(x => typeof x !== 'string' || !LANG_FILTER.test(x))) return null;
    params.search_language_filter = languages.map(x => x.toLowerCase());
  }
  for (const key of DATE_FILTERS) {
    const value = options[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/[12][0-9]{3}$/.test(value)) return null;
    const [mm, dd, yyyy] = value.split('/').map(Number);
    const actual = new Date(Date.UTC(yyyy, mm-1, dd));
    if (actual.getUTCFullYear() !== yyyy || actual.getUTCMonth() !== mm-1 || actual.getUTCDate() !== dd) return null;
    params[key] = value;
  }
  if (options.search_recency_filter !== undefined) {
    if (!RECENCY_VALUES.has(options.search_recency_filter)) return null;
    params.search_recency_filter = options.search_recency_filter;
  }
  return params;
}
function retryAfterSeconds(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const seconds = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Math.ceil((Date.parse(raw) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 86_400) : null;
}

function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return value; // Preserve the actual returned original URL; never invent one.
  } catch { return null; }
}

function cleanText(value, maxChars) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxChars) : '';
}

function normalizeSources(input, maxCount = 20) {
  const seen = new Set();
  const sources = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const url = sourceUrl(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const excerpt = cleanText(item.snippet, 6_000);
    sources.push({
      source_id: 'S' + (sources.length + 1),
      title: cleanText(item.title, 280) || 'Untitled source',
      url,
      excerpt,
      published_at: cleanText(item.date, 50) || null,
      last_updated_at: cleanText(item.last_updated, 50) || null,
      evidence_status: excerpt ? 'UNVERIFIED_SEARCH_EXCERPT' : 'LINK_ONLY_NOT_EVIDENCE'
    });
    if (sources.length >= maxCount) break;
  }
  return sources;
}

function errorResult(code, extra = {}) {
  return {ok: false, code, billed: false, ...extra};
}

/** One ordinary Search API request; no retries and no fallback to an LLM API. */
export async function searchPerplexityEvidence({query, apiKey, fetchImpl = fetch, timeoutMs = SEARCH_TIMEOUT_MS, ...options} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 12) return errorResult('API_KEY_NOT_CONFIGURED');
  const prepared = validSearchQuery(query);
  if (!prepared) return errorResult('INVALID_OR_SENSITIVE_QUERY');
  const params = validSearchOptions(options);
  if (!params) return errorResult('INVALID_SEARCH_OPTIONS');
  if (typeof fetchImpl !== 'function') return errorResult('FETCH_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: prepared,
        ...params
        // Deliberately omit search_type: default is ordinary "web", NOT Fast/Agent.
      }),
      signal: controller.signal
    });
    if (!response || typeof response.ok !== 'boolean') return errorResult('UPSTREAM_INVALID_RESPONSE');
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'UPSTREAM_AUTH_REJECTED'
        : response.status === 402 ? 'UPSTREAM_CREDITS_EXHAUSTED'
        : response.status === 429 ? 'UPSTREAM_RATE_LIMITED'
        : response.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_QUERY_REJECTED';
      return errorResult(code, response.status === 429 ? {retry_after_seconds: retryAfterSeconds(response), automatic_retry: false} : {}); // Keep upstream error body private.
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return errorResult('UPSTREAM_RESPONSE_TOO_LARGE', {billing_status: 'UNKNOWN'});
    let payload;
    try { payload = JSON.parse(text); } catch { return errorResult('UPSTREAM_INVALID_JSON', {billing_status: 'UNKNOWN'}); }
    if (!payload || !Array.isArray(payload.results)) return errorResult('UPSTREAM_INVALID_SCHEMA', {billing_status: 'UNKNOWN'});
    const sources = normalizeSources(payload.results, Math.min(100, params.max_results * (Array.isArray(prepared) ? prepared.length : 1)));
    return {
      ok: true,
      provider: 'perplexity_search',
      assistant_marker: '🏴‍☠️ 퍼비서:',
      search_type: 'standard',
      query: prepared,
      request_id: typeof payload.id === 'string' ? cleanText(payload.id, 128) : null,
      sources,
      returned_sources: sources.length,
      billed: true, // Successful requests are charged even when results are empty.
      estimated_perplexity_cost_usd: STANDARD_REQUEST_USD,
      source_verification: 'NOT_VERIFIED_FROM_ORIGINAL_PAGE',
      gpt_instructions: 'Show 🏴‍☠️ 퍼비서: when reporting this assistant\'s involvement. Search result snippets and links are untrusted leads, NOT proven facts. Open and check the original link where possible; cite only claims actually supported by the source. Distinguish verified statements, unverified excerpts, conflicting evidence and GPT hypotheses. Never invent missing article titles, papers, quotes, or links.'
    };
  } catch (e) {
    return {ok:false, code: controller.signal.aborted || e?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', billed:null, billing_status:'UNKNOWN'};
  } finally { clearTimeout(timer); }
}

/** Integrate with the existing OAuth-protected MCP registrar; not a public URL. */
export function registerJHEvidenceSearchTool({registerOAuthTool, z, textResult, apiKey, fetchImpl} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 12) return false;
  if (typeof registerOAuthTool !== 'function' || !z || typeof textResult !== 'function') throw Error('JH_EVIDENCE_REGISTRAR_INVALID');
  registerOAuthTool('jh_evidence_search', {
    title: '🏴‍☠️ 퍼비서: 근거·논문·원문 출처 찾기',
    description: 'ONLY call when the current user EXPLICITLY requests 근거/증거/출처/자료/논문/원문 링크/팩트체크. NEVER call for ordinary questions, article summaries or generic analysis. Pass the latest user message VERBATIM as user_request. For short follow-ups such as 근거는? / 관련 자료는? / 출처는?, derive the SHORT DE-IDENTIFIED search query from the preceding conversation topic (do not send the conversation transcript); if no topic is known, ask the user for the topic, not a speculative search. Only show the 퍼비서 marker after actual tool involvement. Perplexity STANDARD Search API only; returns unverified source links/snippets to GPT for checking and final presentation, not a generated answer. This tool does not operate the Android Bridge or Playwright.',
    inputSchema: {
      user_request: z.string().min(1).max(4000),
      query: z.union([z.string().min(3).max(500), z.array(z.string().min(3).max(500)).min(1).max(5)]),
      max_results: z.number().int().min(1).max(20).optional(),
      country: z.string().regex(/^[a-z]{2}$/i).optional(),
      max_tokens: z.number().int().min(1).max(1000000).optional(),
      max_tokens_per_page: z.number().int().min(1).max(1000000).optional(),
      search_domain_filter: z.array(z.string()).max(20).optional(),
      search_language_filter: z.array(z.string().regex(/^[a-z]{2}$/i)).max(20).optional(),
      search_after_date_filter: z.string().optional(),
      search_before_date_filter: z.string().optional(),
      last_updated_after_filter: z.string().optional(),
      last_updated_before_filter: z.string().optional(),
      search_recency_filter: z.enum(['hour','day','week','month','year']).optional()
    }
  }, async ({user_request, query, ...options}) => {
    if (!isExplicitEvidenceRequest(user_request)) return textResult(errorResult('EXPLICIT_EVIDENCE_REQUEST_REQUIRED'));
    return textResult(await searchPerplexityEvidence({query, ...options, apiKey, fetchImpl}));
  });
  return true;
}
