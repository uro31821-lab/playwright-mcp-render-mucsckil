# Mobile13 command diagnostics: source review candidate

## Problem and scope

The installed Mobile13 app can report its version and local discard markers,
but the deployed server does not expose a non-mutating observation of its
selected device's current command, transient jobs, workflows and focus lease.
Starting a command to discover that state would discard other work. Existing
`active56()` and the signed-poll status observer can also purge expired state.

This candidate adds a deliberately read-only observation to the existing
authenticated `life_status` response. It does not create a command, establish
admission, replay an action, settle an unknown receipt or issue a phone job.
The existing input schema stays unchanged. The existing server's selected
device is the scope; no caller-supplied device selector is added.

Here, read-only describes the diagnostic handler's command, job, workflow,
focus, session and owner/journal state. The unchanged authenticated MCP
wrapper still updates call timestamps/counters and records its ordinary
operational-learning event. This candidate does not bypass that wrapper or
claim that an entire MCP request causes zero telemetry writes. The diagnostic
itself calls no owner/journal database method and performs no state cleanup.

The reviewed base and observed LIVE at source review are exactly
`f32cf6c7d615245d2f8307ae467dcfc0450dc359`. Historical PR72 source evidence
(`c6142bd21ea299a4464124356e9da34b58001900`) and the pre-mobile protected
runtime (`2c310f8b4a76d40604416e7dd4cb4976fdd1fc85`) remain pinned.
Source tests reject any later MAIN until it is separately reviewed.

## Activation boundary

The new selector is OFF unless
`JH_MOBILE13_COMMAND_DIAGNOSTICS=EXPLICIT_OWNER_DEVICE_READ_ONLY_V1`.
It requires the existing Stage25 operator authority and the explicit
`JH_MOBILE_WEB_13_MODE=EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1` mobile scope.
An invalid flag or an unauthorized operator fails closed.
The original status implementation is byte-preserved when the flag is OFF.
The new generated patch is exactly reversible and included in the existing
runtime attestation. Missing, duplicated or drifted source anchors reject
generation rather than applying a partial patch.

This change is a source candidate. Creating or checking this candidate does
not activate the production flag, merge a branch, deploy Render, rebuild an
APK or run a phone UI validation session.

## Observation contract

- Return an observation timestamp and process generation so a restart cannot
  be mistaken for proof that old durable work completed.
- Inspect only the selected device's owner/session binding. Command values
  are comparison digests, never reusable raw command tokens.
  Their purpose is comparison between observations for the same owner/device;
  an old command token alone cannot identify or recover the current command.
- Separate current transient jobs, unfinished workflows and pending discard
  observations from durable owner/SQLite state. Missing access to durable
  state is `unknown`, never an inferred zero or an idle/admission guarantee.
- Report unavailable, expired, unbound, prior-session or incomplete observations
  honestly. A bounded scan must not label unscanned rows absent.
- Stage44 focus uses a pure `peek`. Reading an expired lease does not purge
  it, renew its TTL, advance its epoch or release its command. If Stage44 is
  disabled, its focus state is unknown/unavailable.
- Return no job bodies, prompts, URLs, reusable session or approval tokens,
  unrelated-device identifiers, or another device's command/workflow state.

In the opt-in status path, `signedPollVerified: false` with
`NOT_REVALIDATED_READ_ONLY` means that the observation intentionally did not
rerun the potentially mutating live trust-validation path. It is **not a
failed phone signature result**. A separate cached poll observation may
describe an earlier verified poll and its freshness, but it is not upgraded
to current live trust verification. UI and phone-action verification remain
separate and are not inferred from cached status or a successful source test.

The response is advisory. It is neither an atomic idle reservation nor
permission to call BEGIN. The original unknown job, durable journal and
concurrent command fences retain their existing meaning after this change.

## Review and regression scope

The exact candidate delta is eight files: the diagnostic implementation and
tests, the Stage25 opt-in wiring, the Stage44 pure peek, this review note, one
new review workflow, and the two existing exact source-provenance tests.
Every protected deployment, signing, approval, owner, SQLite, trust and
operational-learning source stays byte-identical to reviewed MAIN.
The original Stage44 enforcement patch, Stage41/40 patches, Mobile13 route
patch and mobile action-policy patch also stay byte-identical.

The focused workflow runs the new generated-status tests and existing
Stage44, Stage41, Stage40, Stage25, exact source-provenance, mobile 9+4 runtime,
integrated policy, real generated fixture HTTP and durable computer-policy
tests. It uses the original dependency manifests and no phone transport.
Existing review workflows are preserved and continue to run independently.
Passing source/CI tests is not a claim that the 13 real-phone routes passed.
