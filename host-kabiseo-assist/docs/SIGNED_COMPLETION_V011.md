# 카비서 v0.11 — signed-completion compatibility candidate

## Concrete blocker found
The existing Secure56 completion handler verifies the current session, device, body digest, deadline, MAC and one-use nonce before storing the result. It then deletes `secureMac`, `secureNonce` and `securePayloadDigest` from the queued job. The v0.10 camera producer demanded `secureMac` again when summarizing a complete job, so genuine accepted completions could be rejected as `job_binding_unverified`. Prior mock tests did not model the original cleanup.

## Minimal correction
Observe the actual signed queued object synchronously before waiting. Bind its request ID, task, command, device, session, type, tool, action, effect, target and signed expiration. Only the same queue object's accepted result may later be summarized. An unsigned/pre-completed/substituted job remains rejected; uncertain submissions remain consumed. Signing material is not copied or persisted. The producer is NOT a signature verifier and cannot turn arbitrary caller JSON into authenticated completion evidence. Its host adapter still reads the original trusted `jobs` store.

No original signer, completion handler, OAuth guard, capability negotiation, production startup, phone permissions or camera code is changed. The function is still review-only/default OFF. No new package or install hook is added.

## Verification method and limits
The new builtin-only integration suite pins the original public server Git blob `2c4fc54d0c2789b8c02e825c3946b9777e14a694`, extracts its signing helpers and complete HTTP branch byte-for-byte, and runs the latter on an ephemeral `127.0.0.1` listener. A checkout of the prior producer at `75c265188e1823537d224457d3ddf490bdf6e3d8` is used to reproduce the old false rejection. Synthetic session keys/queue bindings are used; no user credential or physical device is contacted.

The suite covers valid cleanup, bad MAC, body-digest tampering, replayed nonce, wrong session, job-object substitution, unsigned submission, request-ID mutation and profile-required behavior. It is NOT full MCP/owner enrollment/capability negotiation/generated-operator/Android or physical-camera E2E. The original runtime composition and 37 prior producer/patch tests remain separate gates. CI results must be read before marking this candidate tested.

Local container and Python health checks still returned ClientError on this continuation. Full JH Gradle/APK/sign/install and automatic zoom/reset remain NOT_RUN. Existing dependency warnings and security review hold for release are not cleared by these tests.
