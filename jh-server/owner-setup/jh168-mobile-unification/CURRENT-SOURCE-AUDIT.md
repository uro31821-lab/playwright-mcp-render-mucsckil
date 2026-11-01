# Current source audit after the host-memory merge

This is a source/CI correction for PR120. It does not deploy a service, authorize
a phone action, resolve a historical UNKNOWN, or prove real-phone E2E behavior.

## Observed failure and reviewed transition

The five broad mobile PR workflows stopped in the compatibility test with
`MAIN_ADVANCED_REFRESH_SOURCE_AUDIT`: the remote base was
`8596f5ef299d27fa7064ee40a64a99030196774a`, while the test required the exact
older `bd81675725609e67ca7bb2f8dc45f101f0820d8b` commit ID.

The newer commit is the single reviewed PR119 host-memory change on that older
base. Its exact 16-file diff is now checked as the historical range
`bd816757… -> 8596f5ef…`, instead of requiring every later candidate to be that
same 16-file change. The original Stage42 test is retained unchanged for its
historical candidate-specific consumers.

The 13 direct execution dependencies and five extra mobile compatibility files
are byte-identical between these commits. The original deployment, payment,
server-integration, trusted-server and owner-enrollment trees are unchanged.
The existing learning core and package/lock files are unchanged. PR119 does
intentionally add host-memory API/controller code in operational-learning; the
new audit anchors those reviewed bytes at `8596f5ef…`, not at the older runtime.

The old `android-direct` path is absent in both snapshots. An empty pathspec
alone is not Android coverage. Existing tracked Kotlin fixtures are protected
explicitly; source checks do not replace APK or phone verification.

## Current source protection

`reviewed-source-audit.mjs` resolves the actual remote base and candidate once
to exact commit IDs, then checks all of the following:

1. The fixed reviewed snapshot is an ancestor of both base and candidate.
2. The actual base is an ancestor of the checked candidate (the PR merge checkout
   in CI), so an outdated candidate is not presented as the latest combination.
3. Protected paths in the **base Git tree** equal the reviewed snapshot.
4. The same paths in the **candidate Git tree** equal that snapshot.
5. The **working files** also equal it, with no untracked protected sources.

Raw Git differences detect content, additions, removals, renamed files, mode
changes and symlinks. Checking base independently prevents a candidate from
concealing an upstream protected change by reverting it in the merge result.
Missing refs and unrelated ancestry fail. The helper is read-only.

Protection includes the former Stage42 roots, the full existing mobile module,
the full existing operational-learning module, known Kotlin fixtures and pinned
dependency manifests. The only exclusions are the audit implementation/tests/
document and the already reviewed host-only federation files. Those federation
files and the plugin overlay must match the fixed published candidate
`c0190f6e9649bd5c5d13b9911c4933328808bbb2`; origin may contain either PR119's
original version or that exact federation version. Arbitrary changed federation
content is not admitted through the exclusions.

PR120 must use a history-preserving merge so the pinned `c0190f6e…` candidate
remains an ancestor fetched by future complete checkouts. Do not squash/rebase
this change and then delete its only source ref while retaining this commit pin.

The original seven compatibility checks are retained, including ORIGINAL/PR72
pins, exact host reversal, one mobile composition, the legacy mode-toggle
contract and the incomplete phone ledger. Additional checks retain the PR72
producer document and Stage42 learning-core, explicit opt-in, no-replay and
historical UNKNOWN boundaries. A movable branch ref is no longer used as a
claim about which source is actually deployed.

## Workflow change and verification

The Mobile13 diagnostic workflow keeps its historical
`f32cf6c7… -> bd816757…` protected-source comparison. It replaces the stale
remote-ref equality and the PR119-specific Stage42 candidate checks with the
current compatibility audit and real temporary-Git-repository regressions.
Its original generated-runtime, diagnosis, signing and security tests remain.

No workflow is skipped and no path filter is narrowed. Paths for the new audit
files are added to the diagnostic trigger. The five broad mobile workflows and
Stage39 already consume the compatibility test; their runtime checks remain.
The unrelated historical Stage28–38/42 release-candidate workflows are unchanged.

Regression fixtures exercise harmless descendant commits including a merged
base, changed protected base/candidate/working files, file shape/mode changes,
missing refs and unrelated histories. Final GitHub checks must run on the actual
updated PR head/merge combination before merging. Prior provider retrieval and
plugin-publication evidence is reusable only while their code stays byte-identical.

This changes the scope of the obsolete whole-candidate file-count assertion to
its exact historical commit range. It preserves the production-source boundary;
it does not claim that every old assertion is literally unchanged.
