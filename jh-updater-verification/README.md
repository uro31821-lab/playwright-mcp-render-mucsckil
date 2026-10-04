# One-pass updater verification

This isolated branch tests a generic Windows PowerShell 5.1 local updater. No Android app source, APK, user device, user report, credential, private signing key, or production deployment is included.

Native argument handling is tested using a synthetic local executable. Android device and signing tool interactions are mocked; these tests do not certify physical device installation.
