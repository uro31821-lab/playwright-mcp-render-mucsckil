# 이비서 0.5.9 FIX4 / v175 — Global Mix runtime resync

## v174 실기기 blocker
- build/sign/update install/versionCode=174 PASS.
- PLAYING에서 `routePath=GLOBAL_OUTPUT_MIX`, `audioSessionId=0`, `processingRouteAvailable=true`, `globalMixFallbackActive=true`, `profileApplied=true`, `mappedGenrePreset=vocals`까지 확인.
- 그러나 runtime coordinator는 `sourceVerified=false`, `CONTENT_UNVERIFIED`, native `OWNED_EFFECTS_RELEASED`, `engineConfirmed=false`.
- `itemVerified=false` 자체는 blocker가 아니며 core는 sessionOnly/sessionWithGenre로 item id 없이도 PENDING 적용 가능.

## FIX4
- provider의 현재 verified route를 runtime이 callback miss 시 직접 재동기화하는 `currentPlaybackForRuntime()` 추가.
- provider가 이미 계산한 standard/global-mix admission을 그대로 재사용하며 새 route를 만들거나 gate를 우회하지 않음.
- MediaSession 변화와 15초 continuity 검사에서 `trustedOverride=false`일 때만 1회 pull.
- source sequence를 AtomicLong으로 변경해 callback/pull 경합에서도 단조 증가.
- 표준 nonzero session은 항상 우선.
- global mix는 기존 단일 로컬 YouTube Music/no other media session gate 유지, spatial width=0.
- native Equalizer control/enabled/band readback이 확인돼야 ENGINE_CONFIRMED.

## 로컬 검증
- core global-mix harness 7 assertions PASS
- runtime resync source contract 9 assertions PASS
- PowerShell 단일 UTF-8 BOM + CRLF PASS (FIX3의 double-BOM 경고 제거)
- source manifest 471 files
- source-manifest SHA-256 `5b3cc58afd3ed2fa6f8306fdf68a2970f1ac3474a80c5ceb29ad522b3d2621b2`
- one-click ZIP 517 entries, package manifest 516 files, hash mismatch 0
- ZIP SHA-256 `53b5f24c4addf36b6fb39b40acef6de2ac4409c47fd6fd92f2346cc60c1fdac0`

## 미실행
- Windows full Gradle v175 build
- original certificate signing
- update install/versionCode=175 readback
- phone global-mix engine E2E

## 안전 경계
no audio capture, no player transport, no automatic command replay, no uninstall/data reset/new signing key/server deploy.