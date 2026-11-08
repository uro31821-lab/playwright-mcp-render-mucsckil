# 이비서 0.5.9 FIX3 / v174 — 표준 세션 우선 + Global Output Mix fallback

v173/FIX2는 Windows build/sign/update install/versionCode=173 readback까지 통과했다. 실제 휴대폰에서 현재 곡 감지, AUTO, 장르 불명→vocals 선택은 확인됐지만 YouTube Music이 표준 ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION을 보내지 않아 WAITING_FOR_STANDARD_OPEN, engineConfirmed=false가 지속됐다. 일시정지/재생, 최근앱 종료, 강제중지 후 재실행 뒤에도 동일했다.

FIX3:
- 표준 nonzero AudioEffect OPEN/CLOSE가 있으면 기존 COOPERATING 경로를 항상 우선.
- 표준 세션이 없을 때만 YouTube Music media session=1, playing=1, local playback, 다른 media session 없음, controller generation 일치, LOCAL_PLAYING 조건에서 GLOBAL_OUTPUT_MIX session 0 fallback.
- 다른 media session/재생 상태/세대가 바뀌면 fallback route를 무효화하고 module-owned effect release.
- global mix는 전체 output mix 범위이므로 공간효과 width=0, stereo EQ만.
- native Equalizer(0,0)의 control/enabled/band readback이 실제 확인될 때만 ENGINE_CONFIRMED.
- metadata-auto, MusicBrainz→optional Last.fm, vocals fallback, 가곡·민요·샹송·클래식 프로필, 현재곡→응비서 인계 유지.

로컬 검증:
- core regression 13 assertions PASS
- global mix core 10 assertions PASS
- fallback gate 7 assertions PASS
- CooperatingAudioSessionSource Android-stub compile PASS
- VerifiedAndroidEffects Android-stub compile PASS
- source manifest 471 files
- one-click ZIP 512 entries / full hash readback PASS
- ZIP SHA-256 99a5e03e1fc0a106ef26b4bfd2aa41fd974b2a6dab04de5658d071e9cc18cf29

미실행:
- Windows Gradle v174 build
- original certificate signing
- update install/versionCode=174 readback
- phone global-mix/native E2E

안전 경계: no uninstall/data reset/new signing key/server deploy/audio capture/player transport/automatic replay.