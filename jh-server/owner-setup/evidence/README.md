# JH Evidence Search — Perplexity Standard Search API

**Scope:** JH server-side OAuth MCP tool only. No Android, Playwright, Gemini, Sonar, Agent API, scheduled searches, or user-visible Perplexity interface.

## Behavior
1. The user explicitly asks for 근거 / 증거 / 논문 / 자료 / 출처 / 원문 링크 / 팩트체크.
2. GPT calls **jh_evidence_search** with the current latest user message verbatim as user_request and a short de-identified search query.
3. JH enforces an explicit-evidence-request check and sends one POST to **https://api.perplexity.ai/search** (standard Search, not Fast or Agent).
4. JH returns original source URLs, titles, date metadata and UNVERIFIED source excerpts to GPT; GPT verifies original sources where feasible, presents clickable links and labels unsupported inferences.
5. Ordinary summaries and idea questions do not call Perplexity. No public API route, phone action or automatic retry is introduced.

> The tool's check of the user_request string provides an additional guard but is not cryptographic proof of the origin of that string. Retrieved snippets are not themselves independently verified facts.

## Render configuration — only after approved PR and controlled deployment
- **PERPLEXITY_API_KEY:** private Render secret. Never commit, log or paste it into a chat.
- **JH_EVIDENCE_SEARCH_ENABLED=1:** enables the tool only if the secret also exists.

Default: OFF; without both variables, the new tool does not appear in MCP tools/list. Keep the existing JH authorization, Secure56 Android tool catalog digest, protocol_version=1.0, APK, bridge, owner and browser unchanged.

Pricing: standard Search API costs $5 per 1,000 successful requests ($0.005 each); successful empty-result searches are billed. No additional token billing for the Perplexity Search endpoint. GPT usage costs, if any, are separate. Prepaid credits and disabled auto-top-up are recommended for spending control.

## Automated regression tests
Run from repository root:

    node --test jh-server/owner-setup/evidence/perplexity-search.test.mjs jh-server/owner-setup/deployment/jh-perplexity-search-composition.test.mjs

Tests use mock network, incur no API cost, and do not establish that Render or the live MCP catalog has been updated.

## Production verification checklist
1. Feature PR reviewed, CI passes; deployment SHA observed on the actual JH Render service.
2. MCP tools/list shows jh_evidence_search only with both environment switches.
3. One explicitly authorized search returns a clickable original source URL to GPT.
4. Normal article summary does NOT invoke Perplexity.
5. Failures (missing API key, HTTP 401/402/429, timeout) have safe, distinguishable results.

Official docs:
- https://docs.perplexity.ai/docs/search/overview
- https://docs.perplexity.ai/docs/getting-started/pricing
