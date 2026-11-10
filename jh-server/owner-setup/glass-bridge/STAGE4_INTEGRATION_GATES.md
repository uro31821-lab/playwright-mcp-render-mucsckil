# JH Glass Bridge — Stage 4 integration gates (development branch only)

**2026-11-10 / status: source prototype, no live deployment.**

## Source facts from running JH server

Current `jh-server/server.mjs` under branch `jh-fix3-secure-server`:
- Lines 33–44: `mcpCallerAuthorized56` admits a valid OAuth bearer **or** an `LIFE_HUB_TOKEN` fallback, but it returns a boolean, not a verified owner identity.
- Lines 68–72: `oauthAccessAuthorized56` checks expiry and scope only.
- Lines 87–91: `oauthTokenResponse56` stores expiry and scope only in access and refresh maps.
- Lines 767–789: GET and POST `/oauth/authorize` accept a ChatGPT client/redirect and PKCE request but do **not** authenticate a specific human owner. An ordinary web form submit is NOT a phone-local owner approval.
- Lines 796–811: authorization code and refresh token exchange create new access/refresh entries without a stable subject.
- Lines 820–848: MCP auth gate does not pass a stable owner subject to individual tool handlers.

**Consequences:** Do NOT trust an arbitrary POSTed `ownerId`, a `LIFE_HUB_TOKEN` fallback, a browser click, a device ID alone, or a ChatGPT OAuth token whose issuer did not verify the owner. Do not connect the photo endpoint to production until a user-bound owner approval exists.

## Stage 4 source artifacts

- `owner-oauth-gate.mjs` / `owner-oauth-gate.test.mjs`: standalone grant-binder. Requires trusted Secure56 phone-local approval-verifier, pinned server digest, exact allowed OAuth resource, separate HMAC key, expiry, one-use attestation; binds authorization request digest to verified owner; carries subject across token refresh.
- `glass-local-http.integration.test.mjs`: **localhost-only** Node HTTP trial of the existing photo ingress, mailbox, authenticated session, and new grant. Test security callbacks and image decoder are stubs; do not confuse them with a shipped verification mechanism.
- Existing `photo-ingress.mjs`, `photo-session.mjs`, `verified-owner.mjs` remain isolated and unmounted.

## Safely wiring to JH (planned, NOT DONE)

1. Introduce a signed, one-shot **GLASS_OAUTH_OWNER_BIND_V1** approval job in existing Secure56 phone-local approval framework. Bind a canonical OAuth request digest, pinned JH server digest, verified owner binding, device/session digest, issuance and expiry, and one-time ID. The owner must actually approve on phone. Existing screen-sharing permission or general browser OAuth submit does **not** substitute for this.
2. In `/oauth/authorize` POST, first verify that approval receipt cryptographically and check nonce/replay, then bind the OAuth code record using `owner-oauth-gate`. If this fails, issue **no image-capable owner grant**; existing non-image OAuth functionality must not be accidentally upgraded.
3. In `/oauth/token`, transfer the verified subject only from a bound code record into `oauthAccess56` and `oauthRefresh56`. On refresh, preserve the same subject from the authenticated existing refresh record, disallow replay, and revoke the old refresh. Legacy scope-only access must have **no photo rights**.
4. Extend MCP handler auth to pass a verified authorization *record* to the photo tool. The same `LIFE_HUB_TOKEN` fallback must not grant photo access. Do not trust MCP tool args for owner identity. Use the existing `verified-owner.mjs` deny-by-default contract.
5. Mount `/jh-glass/v1/photo` under a separately reviewed HTTPS ingress with trusted proxy assertion, bounded streaming, no URL tokens, rate limiting, real safe JPEG decoding, local consent, minimal retention, sensitive-photo stop, no request-body logging. Current `photo-ingress.mjs` expects injectable gates but does **not** implement them.
6. Create restricted MCP `begin_pairing`, `consume_photo`, `status` actions; return only an ephemeral image to the requesting ChatGPT workflow. DO NOT claim to automatically insert into an arbitrary existing ChatGPT conversation.
7. Create CameraAccess Android explicit `JH 전송` control; preserve upstream Share, re-encode photo without metadata, avoid embedding long-lived secrets, require consent before transmission.
8. Run build/CI/security gates; only after explicit deployment and phone install approval, perform live device E2E. No automatic deployment.

## Zero-extra-cost rule

- This Stage 4 branch makes zero OpenAI API calls and adds no paid dependencies.
- No Google Drive and no new ZIP delivery attempts.
- If a later GPT API path is enabled, it must have **server-enforced** quota/stop rules; billing screens/auto-recharge off alone are not a mathematical zero-spend guarantee.
- Preferred first evaluation: authorized MCP image returned to the ongoing ChatGPT question; avoid separately metered API calls unless independently approved.

## QA

Node.js v22 local test run in isolated Stage 3 + Stage 4 QA directory:
`node --test *.test.mjs` → 53 / 53 passed.
Breakdown: Stage 3 ingress+session+owner 28; Stage 4 OAuth owner grant 19; Stage 4 localhost HTTP integration 6. The old Stage 2 mailbox suite was not rerun in the same command, and the Stage 3 local verified-owner text differs from the GitHub production candidate by non-functional formatting. **GitHub Actions, live Render tests, real Secure56 owner grant, Android build, live photograph transfer remain NOT_RUN.**
