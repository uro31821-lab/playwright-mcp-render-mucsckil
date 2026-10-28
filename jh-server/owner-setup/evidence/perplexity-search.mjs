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
const REQUEST_WORDS = /(?:근거|증거|출처|논문|자료|원문|참고\s*문헌|연구\s*(?:자료|결과|논문)|팩트\s*체크|출처\s*링크|source(?:s)?\b|citation(?:s)?\b|reference(?:s)?\b|evidence\b|papers?\b|fact[ -]?check)/i;
const REQUEST_ACTIONS = /(?:찾아|검색|보여|제시|제공|확인|검증|조사|링크|알려|어디|뭐|어떤|주세요|해\s*줘|해\s*주세요|있어|있나|부탁|제시해|보내|대조|달라|요청|필요|찾을|show|find|provide|give|cite|list|verify|check)/i;
const BARE_REQUEST = /^(?:근거|증거|출처|논문|자료|원문|참고\s*문헌|팩트\s*체크|evidence|sources?|citations?|references?|papers?)\s*[?!.]?$/i;

export function isExplicitEvidenceRequest(value) {
  if (typeof value !== 'string' || value.length > 4000) return false;
  const text = value.trim();
  if (!text) return false;
  // Do not misread an explicit instruction NOT to research as permission.
  if (/(?:근거|증거|출처|논문|자료|원문|팩트\s*체크).{0,14}(?:찾지\s*마|검색하지\s*마|필요\s*없|요구하지\s*않|호출하지\s*마)/i.test(text)) return false;
  return BARE_REQUEST.test(text) || (REQUEST_WORDS.test(text) && REQUEST_ACTIONS.test(text));
}

function validSearchQuery(query) {
  const items = typeof query === 'string' ? [query] : query;
  if (!Array.isArray(items) || items.length < 1 || items.length > 3) return null;
  const prepared = items.map(x => typeof x === 'string' ? x.trim() : '');
  if (prepared.some(x => x.length < 3 || x.length > 500 || /[\u0000-\u001f]/.test(x))) return null;
  // Obvious account identifiers are never sent to an external search provider.
  if (prepared.some(x => /\b\d{6}[- ]?[1-8]\d{6}\b|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/.test(x))) return null;
  return prepared.length === 1 ? prepared[0] : prepared;
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

function normalizeSources(input) {
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
    if (sources.length >= 8) break;
  }
  return sources;
}

function errorResult(code, extra = {}) {
  return {ok: false, code, billed: false, ...extra};
}

/** One ordinary Search API request; no retries and no fallback to an LLM API. */
export async function searchPerplexityEvidence({query, apiKey, fetchImpl = fetch, timeoutMs = SEARCH_TIMEOUT_MS} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 12) return errorResult('API_KEY_NOT_CONFIGURED');
  const prepared = validSearchQuery(query);
  if (!prepared) return errorResult('INVALID_OR_SENSITIVE_QUERY');
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
        max_results: 8,
        max_tokens: 12_000,
        max_tokens_per_page: 1_500
        // Deliberately omit search_type: ordinary Search, NOT Fast or Agent.
      }),
      signal: controller.signal
    });
    if (!response || typeof response.ok !== 'boolean') return errorResult('UPSTREAM_INVALID_RESPONSE');
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'UPSTREAM_AUTH_REJECTED'
        : response.status === 402 ? 'UPSTREAM_CREDITS_EXHAUSTED'
        : response.status === 429 ? 'UPSTREAM_RATE_LIMITED'
        : response.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_QUERY_REJECTED';
      return errorResult(code); // Never return upstream response body: may contain secrets.
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return errorResult('UPSTREAM_RESPONSE_TOO_LARGE', {billing_status: 'UNKNOWN'});
    let payload;
    try { payload = JSON.parse(text); } catch { return errorResult('UPSTREAM_INVALID_JSON', {billing_status: 'UNKNOWN'}); }
    if (!payload || !Array.isArray(payload.results)) return errorResult('UPSTREAM_INVALID_SCHEMA', {billing_status: 'UNKNOWN'});
    const sources = normalizeSources(payload.results);
    return {
      ok: true,
      provider: 'perplexity_search',
      search_type: 'standard',
      query: prepared,
      request_id: typeof payload.id === 'string' ? cleanText(payload.id, 128) : null,
      sources,
      returned_sources: sources.length,
      billed: true, // Successful requests are charged even when results are empty.
      estimated_perplexity_cost_usd: STANDARD_REQUEST_USD,
      source_verification: 'NOT_VERIFIED_FROM_ORIGINAL_PAGE',
      gpt_instructions: 'Search result snippets and links are untrusted leads, NOT proven facts. Open and check the original link where possible; cite only claims actually supported by the source. Distinguish verified statements, unverified excerpts, conflicting evidence and GPT hypotheses. Never invent missing article titles, papers, quotes, or links.'
    };
  } catch (e) {
    return errorResult(controller.signal.aborted || e?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', {billing_status: 'UNKNOWN'});
  } finally { clearTimeout(timer); }
}

/** Integrate with the existing OAuth-protected MCP registrar; not a public URL. */
export function registerJHEvidenceSearchTool({registerOAuthTool, z, textResult, apiKey, fetchImpl} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 12) return false;
  if (typeof registerOAuthTool !== 'function' || !z || typeof textResult !== 'function') throw Error('JH_EVIDENCE_REGISTRAR_INVALID');
  registerOAuthTool('jh_evidence_search', {
    title: '근거와 원문 출처 찾기 (JH 내부 검색)',
    description: 'ONLY call when the current user EXPLICITLY requests 근거/증거/출처/자료/논문/원문 링크/팩트체크. NEVER call for ordinary questions, article summaries or generic analysis. Pass the latest user message VERBATIM as user_request; provide a SHORT DE-IDENTIFIED search query. Perplexity STANDARD Search API only; returns unverified source links/snippets to GPT for checking and final presentation, not a generated answer. This tool does not operate the Android Bridge or Playwright.',
    inputSchema: {
      user_request: z.string().min(1).max(4000),
      query: z.union([z.string().min(3).max(500), z.array(z.string().min(3).max(500)).min(1).max(3)])
    }
  }, async ({user_request, query}) => {
    if (!isExplicitEvidenceRequest(user_request)) return textResult(errorResult('EXPLICIT_EVIDENCE_REQUEST_REQUIRED'));
    return textResult(await searchPerplexityEvidence({query, apiKey, fetchImpl}));
  });
  return true;
}
