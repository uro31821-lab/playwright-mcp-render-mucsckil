# JH Evidence Search — Perplexity Standard Search API

**Scope:** JH server-side OAuth MCP **source-only release candidate**. It is not wired into the current production tool catalog. No Android, Playwright, Gemini, Sonar, Agent API, scheduled searches, or user-visible Perplexity interface.

## Behavior
1. The user explicitly asks for 근거 / 증거 / 논문 / 자료 / 출처 / 원문 링크 / 팩트체크.
2. GPT calls **jh_evidence_search** with the current latest user message verbatim as user_request and a short de-identified search query.
3. JH enforces an explicit-evidence-request check and sends one POST to **https://api.perplexity.ai/search** (standard Search, not Fast or Agent). A request may contain **1–5 independent queries**. Ranked results are de-duplicated by exact URL.
4. JH returns original source URLs, titles, date metadata and UNVERIFIED source excerpts to GPT; GPT verifies original sources where feasible, presents clickable links and labels unsupported inferences.
5. Ordinary summaries and idea questions do not call Perplexity. No public API route, phone action or automatic retry is introduced.

> The tool's check of the user_request string provides an additional guard but is not cryptographic proof of the origin of that string. Retrieved snippets are not themselves independently verified facts.

## Deployment fence — explicit follow-up release required

The 2026-11-05 current JH Secure56/JH168 integration workflows protect the generated runtime and deployment composition. This candidate deliberately leaves **all existing deployed server files byte-identical** and stores the reversible, fail-closed optional composer under `owner-setup/evidence`. This PR therefore DOES NOT expose the MCP tool, even if the environment keys are present. A separate, operator-reviewed release must add and validate the composer against the exact live runtime, receive protected-path authorization, and confirm a working MCP catalog before enabling external traffic. Do not bypass the protected CI by suppressing checks. Never claim live availability based on source-only tests.

## Render configuration — only AFTER approved release wiring, no credentials yet
- **PERPLEXITY_API_KEY:** private Render secret. Never commit, log or paste it into a chat.
- **JH_EVIDENCE_SEARCH_ENABLED=1:** enables the tool only if the secret also exists.

Default: OFF; without both variables, the new tool does not appear in MCP tools/list. Keep the existing JH authorization, Secure56 Android tool catalog digest, protocol_version=1.0, APK, bridge, owner and browser unchanged.

Pricing: standard Search API costs $5 per 1,000 successful requests ($0.005 each); successful empty-result searches are billed. No additional token billing for the Perplexity Search endpoint. GPT usage costs, if any, are separate. Prepaid credits and disabled auto-top-up are recommended for spending control.

## Exact API request shape (verified against published API reference)

- Required: `query` (string or up to 5 strings).
- Optional: `max_results` (1–20; default 10), `country` (ISO 3166-1 alpha-2), `max_tokens`, `max_tokens_per_page`.
- Optional official filters: `search_domain_filter`, `search_language_filter`, `search_recency_filter`, `search_after_date_filter`, `search_before_date_filter`, `last_updated_after_filter`, `last_updated_before_filter`. Date strings use `MM/DD/YYYY`.
- `search_type` is intentionally **omitted** so the Search API defaults to normal web (not fast/people). There is **no `search_context_size`** parameter in the currently published `POST /search` reference.
- Structured response has `results[]`, `id`, optional `server_time`. Individual results carry `title`, `url`, `snippet`, optional `date`/`last_updated`. They are leads, **not** an LLM answer or independent proof.
- Provider 429 returns a sanitized error with `retry_after_seconds` (from HTTP Retry-After) and `automatic_retry:false` rather than retrying without a new explicit request.

## Example invocation (only in a trusted environment)

On a JH instance where `PERPLEXITY_API_KEY` has already been privately configured, a safe **single billable request** smoke test is:

    bash jh-server/owner-setup/evidence/smoke-search.sh

This script uses `curl --fail-with-body --show-error`, `jq -n --arg`, and `set -euo pipefail` and prints only the HTTP status and response shape. When the key is absent, it makes no request and prints setup instructions. **Never paste the key into a chat, issue, pull request, command history or Git commit.**

For direct programmatic use with the existing Node.js HTTP client, the project provides `searchPerplexityEvidence` (native `fetch`, no new dependency). The search tool is intentionally not yet in the deployed JH MCP catalog.

## Automated regression tests
Run from repository root:

    node --test jh-server/owner-setup/evidence/perplexity-search.test.mjs jh-server/owner-setup/evidence/perplexity-search-composition.test.mjs
    bash -n jh-server/owner-setup/evidence/smoke-search.sh

For the current Secure56 generated runtime, the CI job additionally runs `perplexity-search-current-host.test.mjs` using its existing JH npm dependencies and a fake Perplexity transport.

Tests use mock network, incur no API cost, and do not establish that Render or the live MCP catalog has been updated.

## Production verification checklist
1. Feature PR reviewed, CI passes; deployment SHA observed on the actual JH Render service.
2. MCP tools/list shows jh_evidence_search only with both environment switches.
3. One explicitly authorized search returns a clickable original source URL to GPT.
4. Normal article summary does NOT invoke Perplexity.
5. Failures (missing API key, HTTP 401/402/429, timeout) have safe, distinguishable results.

Official docs:
- https://docs.perplexity.ai/llms.txt
- https://docs.perplexity.ai/docs/search/quickstart
- https://docs.perplexity.ai/docs/search/best-practices
- https://docs.perplexity.ai/docs/search/filters/domain-filter
- https://docs.perplexity.ai/api-reference/search-post
- https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers
- https://docs.perplexity.ai/docs/getting-started/pricing

## Cost and privacy

Use only user-initiated, explicit evidence searches; ordinary reading, summarizing and generic discussion are not valid paid triggers. The local keyword guard is advisory, not proof of a user's message; the model must supply the latest verbatim request. Never include patient identifiers, personal emails, passwords, tokens, or other clinical sensitive material in queries. Request only de-identified public concepts. URL snippets from the provider are UNVERIFIED until GPT checks the full source. Neither the presence of a link nor a search excerpt proves a claim.
