JH WINDOWS APK RUNNER SAFETY REFERENCE | FIX16-HARDENED-1

SCOPE
This is a regression reference derived from the historical FIX16 source.
It is not a current JH mobile release and must not be offered as an upgrade.
The Kotlin payload, app identity, certificate pin and historical build inputs
are deliberately unchanged. Do not run this reference against a current phone.

REVIEWED CHANGES
- The CMD bootstrap checks required files and Windows PowerShell before work.
- A run ID and one folder lock bind execution and results to the current run.
- Existing RESULT.txt and existing signed/aligned APK files are preserved.
- Cleanup is restricted to output files created by this run.
- Install-attempt count is 0 or 1 even if signing/install/verification fails.
- Auxiliary log errors cannot suppress the primary result-save attempt.
- RESULT.txt may be saved in a new fallback directory; use the printed path.
- A prior successful RESULT.txt is never reused as this run's success.

PACKAGING CONTRACT
The trusted JH toolkit registry pins all required reference file bytes.
Use jh_integrity.py package with the registered --windows-apk-profile ID.
A missing, changed, candidate, blocked or unknown profile stops packaging.
Ordinary Windows static checks are additional checks, not profile approval.

VERIFICATION SCOPE
The repository CI parses bundled scripts in Windows PowerShell 5.1 and uses
synthetic local files and harmless process stubs for failure-path tests.
These tests do not build, sign, install, query a phone or access private keys.
The original cleanup defect is reproduced only on disposable synthetic files.
Historical successful installation evidence applies only to its original run.
Current PC build/sign/install and current device state remain NOT_RUN.

RUNTIME POLICY FOR A FUTURE MATCHING RELEASE
Use a complete extracted ZIP. Run its entrypoint only once.
Reuse a proven matching build; keep the PC's original signing certificate.
Keep the installed app and attempt at most one guarded update.
Check the actual installation and write the current run's RESULT.txt.
After an attempted or uncertain installation, do not automatically replay.
Existing external toolchain, source, cache and private keys are not bundled.

Canonical development source:
uro31821-lab/playwright-mcp-render-mucsckil
jh-dev-tools/windows-delivery/
