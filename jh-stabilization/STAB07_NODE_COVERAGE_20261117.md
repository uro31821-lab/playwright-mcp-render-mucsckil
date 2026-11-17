# STAB-07/08 Node source coverage recovery — 2026-11-17

## Scope and baseline
Current plugin v1.34.126 remains deployed; no new release. The complete owned archive became available in the new workspace. Original archive SHA-256: bfbb40cafdced6d329b9d83c239f4dd67cf68b2321273035e56328722f81676f. This supersedes only the previous archive-access blocker.

## Actual execution and fixes
- Discovered 101 Node test files. Reused 5 unchanged files (69 previously passing cases) per the user's instruction; ran the remaining 96 with Node v24.22.1 and the required local plugin/hub path variables.
- Baseline: 1,274 tests; 1,264 PASS, 10 FAIL, zero skipped/cancelled.
- Five failures were STAB-03 test fixtures passing an empty catalog to the real feature validator. Four were old suggestion tests treating mandatory video attachment as an unexpected collaborator. One fixed the obsolete 19-prompt assumption; the approved release has 22 prompts and 120 keywords.
- Candidate changes only three test files. Production routing, response validation, manifests, skills, bindings and user rules remain byte-identical.
- Added two positive controls to prevent vacuous negative-test passes. Final affected coverage: 17/17 by 16 already-passing cases plus the final corrected blocked-result control. An initial invalid blocked-control section/badge pairing failed once and its log remains preserved.
- Complete Node file coverage is accounted for using reused and new evidence. This is not a single rerun, an authenticated host E2E result, or all-language regression coverage. Python suites were not run.

## Evidence and release boundary
Private source checkpoint retains the full original archive, three-file overlay, patch, hashes, selection inventory, and original/final TAP logs. Private plugin source is not copied into this public repository.
The installed archive still contains the old test fixtures; these test corrections are an undeployed development candidate.

## Unresolved acceptance
NO_GO remains. No newly exposed authenticated host route/feature_result/route.check_response/visible_delivery readback tool was found. Do not repeat the prior browser-context failure or scoped learning searches.
Historical S1 reference-vs-current-subject FAIL remains unresolved by a real user retest. Scene-grounding guard remains unconnected. S1 starts only when the user explicitly starts camera testing in the current conversation.
PR #196 stays Draft/unmerged. Android JH214, original signing, Secure56, aiming/shutter, Render, Tasks and private taste ledger unchanged. No external action or deployment.
