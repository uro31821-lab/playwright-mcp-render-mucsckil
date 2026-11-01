# JH Windows APK delivery regression and file contract

This directory carries the reviewed development toolkit packaging check and a historical FIX16 runner regression reference. It is not a current mobile app release. It does not change the Secure Bridge service or the Android application.

## Why this change exists

The original signer rejected pre-existing signed/aligned APK outputs, but its `finally` cleanup still removed them. The original CMD bootstrap could stop before PowerShell without saving a failure result, and a previous `RESULT.txt` could be mistaken for the current outcome. Successful historical installation evidence did not test these failure paths.

The hardened runner preserves pre-existing outputs, holds a same-folder execution lock, reports install attempts as 0 or 1, and binds results to a fresh run ID and an explicitly verified receipt path. Optional stage/diagnostic log errors do not suppress the result-save attempt. A fallback result directory is reported by its actual path; uncertainty after dispatch remains `UNKNOWN` and never triggers automatic replay.

## Packaging gate

`scripts/jh_integrity.py package` accepts `--windows-apk-profile ID`. Selecting a profile also requires the existing Windows static preflight. Before it creates a ZIP or sidecar, it compares the actual filtered packaging manifest with the required file paths, sizes and SHA-256 values in `references/windows-apk-profiles.json`.

The registry is fixed alongside the checker. Package contents, environment variables and CLI paths cannot self-declare a replacement approval registry. Unknown, candidate, blocked, malformed, missing or mismatched profiles fail closed. Ordinary source ZIP and general `--windows-release` behavior remains compatible. JH's APK delivery skill requires this additional profile option.

The original FIX16 profile is blocked. `JH-WINDOWS-APK-FIX16-HARDENED-1` pins the ten reviewed historical reference files. A future current-app delivery needs a separately reviewed profile for its actual inputs and target. Do not reuse this fixture as a current upgrade.

The emitted `delivery_contract` records profile, registry, checker and packaged-file hashes with a fingerprint. Its scope is `pinned_packaged_files` and its `runtime_status` is `not_run`; packaging does not prove execution on a PC or phone.

## Validation

The workflow `.github/workflows/jh-windows-delivery-contract.yml` runs:

- Python tests for static checks, package integrity, no-clobber behavior and required-file contracts.
- Windows PowerShell 5.1 parsing and function/alias collision checks of the exact bundled scripts.
- The pinned original cleanup defect on disposable synthetic files, proving the regression stimulus.
- Current-run result identity, primary/fallback writes, output preservation and locking checks.
- The exact CMD bootstrap with harmless compiled process stubs, including missing inputs and PowerShell, dispatch uncertainty, previous results, write failures, and paths containing spaces, Korean characters, `%` and `!`.

The Windows tests do not invoke Gradle, signing tools, private keys, ADB or a device. The original signer is used only with pre-existing synthetic output files that force an early rejection before toolchain or device work. Bootstrap fault injection changes one line in a disposable test copy and adds no production bypass flag. Every test uses a private temporary directory.

```bash
python3 -B -m unittest discover -s jh-dev-tools/windows-delivery/tests -p 'test_*.py' -v
```

```powershell
./jh-dev-tools/windows-delivery/tests/Test-LegacyRegression.ps1 -LegacyRoot ./jh-dev-tools/windows-delivery/fixtures/legacy
./jh-dev-tools/windows-delivery/tests/Test-RunSafety.ps1 -KitRoot ./jh-dev-tools/windows-delivery/fixtures/fix16
./jh-dev-tools/windows-delivery/tests/Test-JhBootstrap.ps1 -KitRoot ./jh-dev-tools/windows-delivery/fixtures/fix16
```

## Provenance and limits

Original ZIP: `libfile_f78291af6cf88191b302f7af6508b725`, SHA-256 `bbc95a80a900417ccb5e8a146a2d2476772e4b239666c87143865086b078a21d`.

The preserved original signer hash is `b3a00110bbf8363016265578fe2e2bd907f3cf3927d70214f7e6fe2921fa22a2`. `fixtures/legacy/` is evidence only. Existing Kotlin payloads, historical expected source/APK/certificate hashes, application identity and durable install-attempt guard remain part of the reference; this change does not update them to a newer mobile version.

Test results and source evidence can be recorded as one actual development task in JH common memory. Synthetic cases are not independent user failures or real install events and must not inflate automatic-learning thresholds.
