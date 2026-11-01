# JH168 Stage27 Windows installer contracts

This directory contains the reviewed installer source and harmless Windows
PowerShell 5.1 contract tests for the Stage27 update package. The signed APK and
signing credentials are deliberately not stored in this source directory.
The complete release archive supplies the separately verified, hash-pinned APK.

The installer validates the candidate package, version, certificate and bytes,
requires one ready device, and verifies the installed Stage26 baseline before
performing one update. An already installed exact Stage27 candidate is reused.
A durable attempt receipt is created before dispatch, and an uncertain attempt
cannot be replayed by extracting another copy of the archive. Existing result
files are preserved, and the current result is tied to its run identifier.

`Test-Stage27Installer.ps1` loads only production function definitions and
substitutes every external executable call with deterministic synthetic
fixtures. `Test-Stage27Bootstrap.ps1` exercises the real CMD wrapper against
incomplete or synthetic folders. Neither test installs an APK, uses a signing
key, connects to a device, or changes a server.

Run the two tests on Windows PowerShell 5.1 with `-KitRoot` pointing at the
`installer` directory. Passing these contracts does not establish installation
or Chrome completion behavior on the owner's phone; those require the owner's
separate runtime result.
