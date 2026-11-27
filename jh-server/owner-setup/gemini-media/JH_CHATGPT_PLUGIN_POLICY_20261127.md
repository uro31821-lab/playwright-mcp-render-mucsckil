# JH Secure Live — Gemini skill replacement contract (2026-11-27)
Status: SOURCE POLICY / NOT A RELEASE RECEIPT

## Why
The user explicitly revoked the **old blanket Gemini API ban** created after a failed
integration. The older rule in published JH skill `jh-yeongbiseo` must not
continue blocking the **separately authorized new Gemini implementation**.
The older 1.34.70 removal record documents an earlier plugin capability,
not the state of the 2026-11-27 server module. The server module and its
published ChatGPT tool catalog are independent release surfaces.

## Exact routing
- **영비서:** When the user currently requests actual visual/audio understanding of
  a public YouTube video's explicitly bounded interval, allow
  `jh_gemini_media_preview` and, after verified credit, a matching one-shot
  `jh_gemini_media_submit`. Keep existing ordinary Naver/YouTube search,
  no-extra-cost PlayMCP subtitle analysis, sources and evidence boundaries.
- **편비서:** When the user currently requests a single short video created from
  supplied text/photo, allow Gemini preview and the guarded one-shot generation
  route. Keep native ChatGPT image editing for still-image requests.
- **Old November 12 general ban:** Superseded **only** for those two new
  capabilities and only with credit/intent/approval gates. The older ban remains
  relevant for other unknown paid tools and automatic use.
- **Instagram/Threads/SNS:** Do not restore deleted integrations or
  auto-generated Reels/SNS publishing. No automatic rerun, video variations,
  app/phone action or secret disclosure.

## Five MCP tools and trust chain
`jh_gemini_media_preview` = local non-billed quote.
`jh_gemini_media_submit` = PAID boundary, only after this request's
specific media execution intent and verified credits.
`jh_gemini_media_status` = local budget/request status (the operator
credit marker is NOT Google billing readback).
`jh_gemini_media_cancel` = local no-replay fence (not promised refund).
`jh_gemini_media_result` = inspect already-produced result.

The JH app's declared MCP connection is
`https://jh-secure-bridge-fix4.onrender.com/mcp?catalog=103`.
Do not claim ChatGPT can invoke new tools merely because the owner
server lists them. App tool discovery and OAuth are separate acceptance gates.

## Billing
Google AI Pro $10/mo credits can be eligible for Gemini API
(https://developers.google.com/profile/help/benefits).
They are not a guaranteed automatic charge hard-cap.
The locally configured $10/month and $2/request budget guard is not a
Cloud Billing cap. Until an actual independent verification is recorded,
`JH_GEMINI_VERIFIED_CREDIT_USD=0` and empty authorization marker must
continue blocking any provider POST. No user query about programming,
continuing work or testing connection authorizes a paid sample.

## Release checklist
1. Obtain current `plugins_6ac116dadd588191ba4712ffe090534b`
   source and expected release ID. Keep scope USER/private and all App
   connections, defaultPrompt strings/order, metadata and unrelated skills.
2. Modify the **published** `jh-yeongbiseo/SKILL.md` legacy blanket
   prohibition into a scoped supersession and add the new
   `jh-gemini-media-integration` skill; update `jh-pyeonbiseo` only if
   necessary for current media generation routing.
3. Publish with Plugin Creator with a proper complete package and exact
   release ID guard; read back the published skill files and release ID.
   Source-only docs here are not publication proof.
4. Verify actual ChatGPT app sees the five MCP tools, status/preview without
   provider POST, and old JH tools remain callable.
5. Never set credit approval flags or call submit as a release smoke test.
