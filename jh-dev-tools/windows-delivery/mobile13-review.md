# Mobile13 verified APK updater review

This delivery advances the already verified Mobile13 Android candidate through
local signing and one data-preserving app update. It does not rebuild Android,
change the server, dispatch a phone UI command or resolve an old unknown job.

## Exact inputs and target

- Unsigned APK: `40b8f766692a1e44e8e02fc9ed0de47a1ba172e12c0cf634852ec647cc9905d3`, 48,835,763 bytes.
- Android source fingerprint: `e586b6ec4f5d4316196220cee269ae364351791ebd759e80eb93f8cc4598154d`.
- Existing Android build evidence: 103 suites / 1,183 tests, zero failures or skipped tests. Build is reused.
- Package `com.koreanlifehub.bridge`, versionCode 168, versionName `jh168-gemini-right-v2-release`.
- Original certificate: `7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b`.
- Approved prior installed APK: `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359`.
- Historical installation receipt: `libfile_235ed43881b88191b39567953d6a3622`, 2026-11-01T04:23:57.8259404Z. It verifies that prior APK and certificate, not this new candidate.
- Coordinated server candidate remains `c6142bd21ea299a4464124356e9da34b58001900`.

The private APK and Android source are not committed to this repository. The
private delivery includes the exact APK above. Public tests use inert ZIP files,
a fake public-certificate byte string and harmless in-process tool responses.

## Reviewed execution contract

`실행.cmd` is the single user entry point. It invokes `data/Update-Mobile13.ps1`
from its own location and validates a report bound to the fresh run ID. A stored
report is an outcome to read, not an installation success by itself.

The updater checks full extracted inputs, PowerShell syntax and alias/automatic
variable conflicts, encodings, bounded paths, manifest and APK hashes. It reuses
existing SDK signing tools and JDK17. The original keystore stays on the PC;
private keys and command arguments are not copied or logged.

Before signing or updating, it requires one authorized Samsung device and pulls
the existing app APK. The original certificate and pinned prior APK must match.
Both fresh and reused signed candidates are verified for signature, package,
version and every original ZIP entry. Only added signing metadata is permitted.

A same-folder lock and an external candidate-wide lock prevent competing runs.
A candidate/device-specific CreateNew record is flushed before the only
`adb install -r` call. An unresolved prior record cannot authorize re-signing or
another installation. Each rerun reads installed bytes before deciding whether
the completed update can be reused. No uninstall, data clear or UI operation is
present. Actual post-install APK bytes, certificate and version determine the
result, including when the installer command response is inconclusive.

Previous reports move into a unique history path under the live kit lock before
a fresh primary report is created. Signed and partial outputs are preserved.
The unchanged reviewed safety helper supplies fallback saving and current-run
identity validation. Failure of optional logging does not suppress that attempt.

## Review findings and fixes

1. Independent source review found signing could be dispatched while its result
   status still said NOT_RUN. Dispatch now sets UNKNOWN; only complete signature,
   payload and receipt verification establishes NEW_PASS.
2. Actual Windows CI first found a missing compression-assembly load in the
   synthetic ZIP fixture. Explicit assembly loads fixed the fixture without
   changing production code or assertions.
3. Actual Windows repeat execution verified reuse with zero new installation,
   but its primary result replacement used fallback. Moving the prior report
   into the unique history path lets the next result be freshly created. The
   exact internal File.Replace failure cause was not established.
4. A test-case Name parameter shadowed a loop's path name through PowerShell's
   dynamic, case-insensitive scope. The fixture parameter is now CaseLabel;
   Korean, spaces, percent and exclamation path tests remain unchanged.

## Validation evidence

The exact final production updater SHA-256 is
`114e61c42333bfaab1250e49cb7659f249e8d19d59a4229e8a20994344b3e79e`.
The CMD SHA-256 is
`1b3cbf69a08d9f91b7ef116c185ed68effa556398dfb8a8e8bb6e3833130cb60`.
The unchanged helper SHA-256 is
`9ebb716ab9cdb54f47e46c785c11412c4d8ae9c20d2f011376d4e721ca8aae0f`.

Final Windows CI [41299200489](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/41299200489),
job `124826426269`, attempt 1, succeeded on the actual checkout
`cba70ceb28c54ff1147ab43b143ed7c52ea2eef3`. Windows PowerShell Desktop
`5.1.20348.5756` passed all **21 synthetic cases, zero failed**, and emitted the
exact updater, CMD and helper hashes above. Completion was 2026-11-01T10:50:42Z.
The unchanged original production-input byte checks also passed.

Earlier runs 41298691712 and 41298808193 stopped after seven initial passing cases; run
41298980799 passed sixteen cases before the path fixture failed. None is a
21-case completion result.

The existing packaging checker passed all 38 Python regression tests locally.
Its script bytes remain identical to the current toolkit. The separate profile
registration pins the reviewed entry point, scripts, instructions, manifest and
private APK; it does not change any checker or historical profile.

Actual user-PC signing, app installation, server application and phone 13-route
E2E remain NOT_RUN until their respective real results are returned. Windows
synthetic checks do not supply the original private key or prove phone effects.
