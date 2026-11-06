# Independent experiment checkpoint

Date: 2026-11-06 (Asia/Seoul)

Current preparation: **0.2.0**, independently test the accessibility/menu stages on the phone. Development continues in draft PR [#173](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/173), branch `experiment/jebiseo-autojs6-20261106`, from experiment commit `11496c31ecf35fb9514922c5741b8ea23f057a0a`.

## User goal and scope

Develop and test only the native split-screen text handoff independently, then consider JH integration after real-phone feasibility is established. Required sequence includes the previously omitted selection-toolbar More step: selection → More → Gemini menu → matching draft → one submit → observed submission.

The repository baseline is `uro31821-lab/playwright-mcp-render-mucsckil`, `jh-fix3-secure-server` at `845c5dfd9925a9f40950f3a873b4e58bfada9990`. The existing candidate PR #145 (`4708b3b9054b600ba9b3380cffc5f35334d85169`) was read as a reference. It was not merged, deployed, or overwritten.

## Isolation

- All feature code lives in `experiments/jebiseo-autojs6/`.
- A separate workflow checks this experiment. Existing workflows and production entry points are unchanged.
- The executable is `dist/jebiseo-independent-test.js`, generated from the local modules and example profile.
- No server/browser/API substitute, new Gemini account, APK installation, phone command, or JH approval is created by the experiment.

## Implementation

- Synchronous state controller with bounded waits and actual state readback after each action.
- Android accessibility adapter reads all interactive windows and rechecks identity/geometry immediately before each action.
- Exact selection via accessibility or explicitly calibrated gestures; no guessed text-handle coordinates.
- Framework selection-toolbar More detection and separate popup/menu lookup.
- Actual Gemini UI host, exact editor ID and visible Gemini title; existing drafts and active responses block a new handoff.
- Atomic local journal and exclusive process lock, with durable handoff/submit intent before consequential clicks.
- Read-only probe, selection, **More-only/menu observation**, handoff and full-submit modes. No automatic recovery/replay after unknown execution.
- Phone launcher uses a thread-safe cancellation flag and recycles its key observer when finished.
- Bounded actual selection-toolbar labels appear in probe diagnostics. Unknown observed labels do not become click targets. Editable fields and source/draft text are excluded.
- More-only mode stops after observing the unique owned Gemini menu, before any Gemini handoff. Nonempty Gemini drafts are preserved.
- Korean result report, explicit clipboard export, and a recent-result viewer. Viewing saved results needs no accessibility permission or screen read. Unresolved prior attempt metadata remains exportable from the blocked result.
- Read-only probe permits ten seconds to prepare a manually opened menu. Key-cancellation instructions reflect whether the observer actually registered.
- User entry guide is `PHONE_TEST_KO.md`; the executable remains one JavaScript file.

## Verification status

Final local offline results: **91 passed / 0 failed / 0 skipped / 0 cancelled**, Node `v24.22.1`. The commands, input hashes and executable hash are recorded in `verification.json`. Node tests use synthetic Android-shaped objects and are not evidence of real-phone execution. This record covers local verification; remote candidate CI evidence is attached to draft PR #173 separately.

| Gate | State |
| --- | --- |
| JavaScript syntax and offline module contracts | See `verification.json` |
| Cross-module controller + Android adapter fixture | See `verification.json` |
| One-file bundle generated and syntax checked | See `verification.json` |
| Actual AutoJs6/Rhino execution | NOT_RUN |
| Accessibility permission / actual selection menu on user's phone | NOT_RUN |
| Actual split-screen Gemini handoff and submit | NOT_RUN |
| Existing JH integration / signed receipt flow | NOT_IMPLEMENTED |
| Production merge / deployment | NOT_PERFORMED |

## Next action

Run the one-file script in AutoJs6 on the user's actual split screen, starting with read-only probe. The installed runtime, source text node, exact selection offsets, framework menu ownership, Gemini surface and send control must be observed. A probe or fixture pass is not full-flow success.

If blocked, use the first stage/code and minimal redacted metadata to adjust only the affected profile/implementation. A missing or uncertain menu handoff/submit result must be reviewed before another write attempt; read-only probe does not clear that record. Do not turn Node test counts into a phone success claim.

After phone acceptance, connect the verified method to the existing JH request/approval/cancellation/receipt contract, rerun the required combined regression scope, and only then prepare an actual merge. The local journal is not a signed JH execution receipt.
