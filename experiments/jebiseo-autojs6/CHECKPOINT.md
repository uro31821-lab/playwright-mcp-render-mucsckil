# Independent experiment checkpoint

Date: 2026-11-07 (Asia/Seoul)

Current preparation: **0.3.4**, a Windows download/extract/run package for the independent accessibility/menu test. Its parent is v0.3.3 source `9ab8eaa68184e2dcedb6c5a1723004c3bba3fb98`. Development continues in draft PR [#173](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/173), branch `experiment/jebiseo-autojs6-20261106`.

## Latest actual phone observation and correction scope

The v0.3.3 user phone and PC screenshots show `SPLIT_PROBE_OK`, exact Gemini editor identification, preserved Korean, and `PHONE_RESULT_RECEIVED`. Private result persistence fails at `DIR_FLAGS / java.lang.NoSuchFieldException`. The editor's empty state is not confirmed. Selection/menu/handoff/submit were not run.

Version 0.3.4 removes the unsupported `OsConstants.O_DIRECTORY` dependency. The old code's failure was reproduced with the same pinned Rhino after removing that invented field from the mock. The repair uses public `O_RDONLY`, validates the opened descriptor with `fstat` / `st_mode` / `S_ISDIR`, then fsyncs and always closes it. First failure and durable journal blocking remain. CI additionally checks actual installed Android SDK public signatures, separately from the mock Android Os execution. Bounded editor hint-state booleans are diagnostic only; no field text, selection logic or effect gates are changed.

Actual v0.3.4 phone behavior remains NOT_RUN. The v0.3.3 read-only success does not establish private durability or later action modes. Current CI counts, exact candidate bytes and independent review belong to the delivered reports and PR after verification.

## Windows preparation update

The user requested one extracted folder and one launcher instead of manual AutoJs6 script import. `windows/prepare-assets.py` assembles the original signed AutoJs6 v6.8.0 APK, official Windows platform-tools, the script and launcher. `windows/audit-apk.py` audits the actual downloaded APK signature and identity in CI. A separate Windows job runs PowerShell 5.1 and real CMD with harmless mock boundaries, and checks the exact candidate hashes and bundled adb startup. The final delivery gate must pin reviewed bytes after CI; this source commit alone does not establish release or phone success.

USB execution uses a bounded launch-request with one mode, a stable journal ID and the reviewed embedded profile. The phone exports only the allowlisted report to the public test folder. The PC reads only a report matching its current launch ID and mode. Android permission grants and split-screen arrangement remain user actions. The user's earlier reports establish installed runtime/script and partial read-only execution; no actual menu click, Gemini transmission or JH integration has passed.

The historical offline results below and `verification.json` are v0.2.0 evidence preserved unchanged. Each later delivery has separate current CI and independent-review receipts.

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
- Actual Gemini UI host, exact editor ID and visible Gemini title, or the separately observed titleless editor with fresh identity/uniqueness/occlusion checks; existing drafts and active responses block a new handoff.
- Atomic local journal and exclusive process lock, with durable handoff/submit intent before consequential clicks.
- Read-only probe, selection, **More-only/menu observation**, handoff and full-submit modes. No automatic recovery/replay after unknown execution.
- Phone launcher uses a thread-safe cancellation flag and recycles its key observer when finished.
- Bounded actual selection-toolbar labels appear in probe diagnostics. Unknown observed labels do not become click targets. Editable fields and source/draft text are excluded.
- More-only mode stops after observing the unique owned Gemini menu, before any Gemini handoff. Nonempty Gemini drafts are preserved.
- Korean result report, explicit clipboard export, and a recent-result viewer. Viewing saved results needs no accessibility permission or screen read. Unresolved prior attempt metadata remains exportable from the blocked result.
- Read-only probe permits ten seconds to prepare a manually opened menu. Key-cancellation instructions reflect whether the observer actually registered.
- User entry guide is `PHONE_TEST_KO.md`; the executable remains one JavaScript file.

## Verification status

Historical v0.2.0 local offline results: **91 passed / 0 failed / 0 skipped / 0 cancelled**, Node `v24.22.1`. Its commands, input hashes and executable hash remain in `verification.json`. Node tests use synthetic Android-shaped objects and are not evidence of real-phone execution. Current 0.3.4 CI evidence and counts belong to the delivered receipt and draft PR #173.

| Gate | State |
| --- | --- |
| JavaScript syntax and offline module contracts | See `verification.json` |
| Cross-module controller + Android adapter fixture | See `verification.json` |
| One-file bundle generated and syntax checked | See `verification.json` |
| Actual AutoJs6/Rhino execution | v0.3.3 read-only observed; current v0.3.4 NOT_RUN |
| Accessibility screen read / actual selection menu | v0.3.3 read observed / menu NOT_RUN |
| Actual split-screen Gemini handoff and submit | NOT_RUN |
| Existing JH integration / signed receipt flow | NOT_IMPLEMENTED |
| Production merge / deployment | NOT_PERFORMED |

## Next action

Extract the new 0.3.4 ZIP, run `실행.cmd` and choose mode 1 only. Reuse the same installed official APK. Read the bottom summary for screen reading, private storage and bounded editor hint diagnostics. Selection/menu/handoff/submit remain separate later tests; modes 2–5 do not resume a prior mode. A probe or fixture pass is not full-flow success.

If blocked, use the first stage/code and minimal redacted metadata to adjust only the affected profile/implementation. A missing or uncertain menu handoff/submit result must be reviewed before another write attempt; read-only probe does not clear that record. Do not turn Node test counts into a phone success claim.

After phone acceptance, connect the verified method to the existing JH request/approval/cancellation/receipt contract, rerun the required combined regression scope, and only then prepare an actual merge. The local journal is not a signed JH execution receipt.
