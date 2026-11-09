# 이비서 0.5.9 FIX13 / v184 — Melon title-only retry

## v183 실기기 결과
- build / original-certificate signing / update install / versionCode 183 readback PASS.
- YouTube Music 현재 곡 `NEON`, artist=`A2O 및 A2O LITE` 확인.
- native EQ engineConfirmed PASS.
- 그러나 자동 장르는 `vocals`, `genreEvidence=vocal_clarity_fallback`, `genreVerified=false`, 새 weak cache hit로 남음.

## FIX13
- Melon JSON 검색은 기존 `title + artist`를 먼저 사용.
- 정확 후보가 없으면 `title only`를 1회 추가 검색.
- 후보 수용은 기존 normalized exact title + artist token score >=90을 그대로 유지.
- Melon JSON 요청에 Referer 추가.
- cache schema 8s/8w -> 9s/9w로 올려 v183의 새 weak fallback을 즉시 무효화.
- no lyrics fetch / no audio capture / no player transport / no uninstall / no data reset.

## 목표 E2E
`NEON -> melon_song_genre -> genre-pop -> engineConfirmed=true -> native continuity readback`
