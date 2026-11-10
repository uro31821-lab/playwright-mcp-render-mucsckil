# JH Glass Bridge — Stage 11 durable device trust / original source recovery

Verified: 2026-11-11 KST. **Source candidate and CI tests only; NOT deployed or installed.**

## Goal
Avoid repeated device enrollment on every JH server restart. Keep **one user-approved enrollment, then explicit per-photo user command** rather than auto-clicking Android screen-sharing prompts. No routine screen capture.

## Newly implemented
- `encrypted-device-store.mjs` — AES-256-GCM encrypted, authenticated, local-disk persistence for a verified owner's P-256 **PUBLIC** key and approved device digest/expiry. An independent 32-byte configuration key is REQUIRED, not generated or stored in the repository. Never saves photos, private keys, tokens, OAuth credentials or payloads. File mode 0600 on POSIX, atomic replacement, bounded size/owner count, pinned JH server identity, tamper/wrong-key/wrong-server rejection.
- `approved-device-session.mjs` — optionally loads registered keys through `deviceTrustStore` at startup; persists accepted initial registration before claiming success; persists revocation; rejects future commands if persistence mutates fail.
- `encrypted-device-store.test.mjs` — actual temporary-disk tests for save/load, restart with no second initial approval, durable revoke, tamper/wrong-key/wrong-server block, invalid input, expired state, permission mode, unverified OAuth and disk failure.

## Exact hosted CI evidence
- GitHub Actions [run 42844334373](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42844334373)
- Tested JH commit: `bdde30dc8fc820a52b1f135fd7aff743cae5517d`
- Job ID: `129927636570`
- Node tests: **154/154 passed, 0 failed**, `NO_PRODUCTION_WIRING_CONFIRMED`.
- Prior Android Stage 10 `7/7` patch tests + Kotlin BUILD SUCCESSFUL were previously verified and source not modified in this stage; do NOT repeat Android compilation needlessly.

## Original JH Android source discovery
- The user's file library metadata lists `E184P2(1).zip`, size **2,725,328 bytes**, plus `E184P2.zip`, and a newer `Kabiseo_E184_v0252_MenuAndStyle_REVIEW_ONLY.zip` review candidate.
- Attempt to copy `E184P2(1).zip` into the analysis environment and to read its contents returned: `This Project file does not have an authorized raw-byte materialization path.`
- Therefore **contents, package identity, source provenance, version and signer of that ZIP remain UNVERIFIED**; do not infer source identity from its filename or mix this review candidate with installed code.
- Related indexed manifests suggest older JH archives have `android-source/app/src/main/... ` structure; this is NOT evidence for the currently listed E184P2 ZIP's actual bytes.
- This is an accessibility blocker, not proof the file is missing. Do NOT use Google Drive to transfer it or attempt to circumvent file access controls.

## Crucial remaining release gates
1. **Require an actual trusted, verified JH Secure56 phone-local initial owner/device approval**. Source tests currently use simulated callback. Scope-only OAuth and LIFE_HUB_TOKEN must NOT enable photo-owner privileges.
2. Actual JH Android source is needed to connect existing phone approval UI. Source ZIP must be directly attached in current conversation or otherwise furnished by an authorized supported source. Confirm ZIP integrity and Java/Kotlin/Android source, current package and signing key before edits. No Android app uninstall or signature change.
3. Complete and verify HTTPS upload limits/real JPEG decoder, signed image digest, chat-bound MCP image response, proper privacy gates (no patient-identifying data), and zero-added-API-cost implementation.
4. Current encrypted store is **single-process** and requires an existing private disk + separately provisioned secret key; multi-instance lock/key rotation, revoke-persist-write-failure emergency procedure (disable photo feature + invalidate trust), backup/recovery must be finished before deployment.
5. GitHub public development repo contains only development source; never upload original private Android ZIP, medical photos or tokens to public repository. Work with a secure local copy or minimal reviewed patches.

## Next one action
If completing JH native integration: attach the existing `E184P2(1).zip` *directly to this conversation* (no new download or Drive). First only inspect ZIP and hashes, then produce a minimal isolated native approval patch. Alternatively, continue source-only hardening of the separate CameraAccess app; operating server/phone remains unchanged.

## Reuse
Earlier Meta DAT/CameraAccess SDK, debug APK, real glasses live preview and screenshot capture checks are already completed. No repeated screenshots or per-photo approval requests. No OpenAI API calls were performed for this stage.
