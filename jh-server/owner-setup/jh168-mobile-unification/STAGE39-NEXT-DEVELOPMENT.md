# JH168 Stage39 — proceed without resolving 29 historical unknown actions
2026-11-01 KST | SOURCE-ONLY integration candidate (NOT deployed)

## User's latest decision and invariant
Continue development now; do not wait for historical `OUTCOME_UNKNOWN=29` to become zero. Preserve all 29 original rows, journal HMAC keys/namespace, original duplicate-blocking, signed Secure56 phone-local approvals and no automatic replay. "Skip the investigation" **does not mean** SQL UPDATE, deletion, automatic replay, zeroing the count, changing the original durable policy, or falsely claiming business success.

## Candidate composition
Compose only the DISJOINT changed files from exact heads:
- PR #72 Mobile13 9 alias + 4 entrypoint PHONE_RIGHT, `c6142bd21ea299a4464124356e9da34b58001900`.
- PR #108 Stage28–37 *source-only* owner receipt and crash-safe code, `c8102ea992af3093b7611fe5495896740299e772`.
- PR #109 Stage38 original Computer Use result read-only receipt, `6d53d8fb2c7c01eac5988925432d19ac410d37b5`.
- Keep **PR #110 separately quarantined**. It modifies the GLOBAL durable policy and fails the original protected-policy CI. Mobile13 exact-mode host policy is independently scoped; do not promote global BACK modification through this candidate.

Base is `jh-fix3-secure-server` SHA `2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`. All three PRs are Draft and unmerged. Composition is a new Draft branch, not a merge/release of their original branches. Current Render Live `4c71890021fc299838e6a8ce45ccf5f64712f354` is different.

## Required checks
1. Synthetic real-original DurableManualCircuitFence journal: exactly 29 pre-existing unknown entries remain, original duplicate is rejected, a different new action does not require their clearance, zero old actions are replayed; all records remain stored.
2. Generated Stage25 + Stage26 runtime: all 9 aliases and 4 entrypoints, original Secure56 tool registration, native Android Computer Use, Stage38 exact original job receipt, no alias cloud Playwright.
3. Dynamic synthetic transport + real HMAC/journal/owner admission and fail-closed conditions: PR72 `mobile13-integrated-contract.test.mjs` (21 fixture cases; no live phone actions).
4. Existing security, stage29-37 source-only owner readback and browser-retirement blockers. DO NOT infer phone E2E from source tests.
5. No SQLite schema migration, process restart, 29-status mutation, Render release, APK rebuild or device action in this branch.

## New real-device observation outside this source candidate
Latest Primary catalog now exposes `context_id`, `request_id`, `phase` for PHONE_RIGHT aliases. Existing live device `life_web_snapshot` read RIGHT Chrome Mobile 13 fixture, window 3324, and a fresh itemRef (WEB02 narrow read PASS). A new, safe `life_web_click` on a fixture link returned `OWNER_ADMISSION_BLOCKED` before dispatch: no real click, no rerun. The subsequent read-only `life_web_wait` rejected an invalid/discarded command binding. Exact reason for command invalidation is unproven; investigate original command/site discard and admission evidence, not bypass by native click. New process-local `cer_` result and scoped mobile BACK are not active on current Live until an exact approved release.

## Separate production constraints
The earlier owner-volume check reportedly observed 29 original uncertain/466 received and ~0.93 GiB free; observations have a timestamp and do NOT establish current live disk or absence of in-flight jobs. Existing Stage31 migration still correctly fails closed if unknown >0. That restriction is NOT needed to compile, source-validate, or stage Mobile13/receipt changes. A future controlled release must preserve existing owner rows and verify precise selected runtime, backup and in-flight work. Do not use the user override to bypass phone approvals, owner file locks or data-loss protections.
