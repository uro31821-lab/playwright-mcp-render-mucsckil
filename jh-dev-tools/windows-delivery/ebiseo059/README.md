# 이비서 0.5.9 — 메타데이터 자동 음악 프로필 FIX2

현재 정상 동작하는 Android AudioEffect 세션 EQ와 영구 기기 신뢰를 유지하면서, YouTube Music이 장르를 비워 두는 경우 공개 음악 메타데이터로 자동 프리셋을 선택한다.

## 동작
- `이비서 시작` = EQ 활성 + AUTO. 재생/정지/seek 조작 없음.
- player genre → local cache → MusicBrainz → MusicBrainz 결과가 없을 때만 optional Last.fm.
- 외부 조회 필드: 제목·가수만. 오디오 파형 캡처·녹음·업로드 없음.
- 장르 불명 보컬은 `vocals`, 명확한 연주곡은 `instruments`.
- art-song / jeongga / korean-folk / pansori / chanson / opera-vocal / choral / classical-orchestra / chamber / solo-piano / solo-strings / acoustic-instrument.
- `지금 곡/현재 곡/이 노래 뭐야`는 실재 현재곡을 읽고, 곡 의미·가사 해석은 응비서로 인계.

## FIX1 Windows 실패와 FIX2
사용자 Windows Gradle에서 FIX1은 `ExternalMusicMetadataResolver.java:174`의 `new JSONObject(body)`가 Android의 checked `JSONException`을 처리하지 않아 `:app:compileReleaseJavaWithJavac`에서 실패했다.

FIX2:
- `JSONException`을 잡아 `IOException("INVALID_JSON", cause)`로 변환.
- 실제 코드 순서를 계약과 맞춰 MusicBrainz 기본 → 결과 없을 때 optional Last.fm으로 정렬.
- Android처럼 `JSONException`을 checked exception으로 둔 별도 javac stub 검사 PASS.
- RUN.cmd ASCII+CRLF, PowerShell 5.1 UTF-8 BOM+CRLF 유지.

## 검증
- 자동 프로필 정책 15 assertions PASS.
- 한국어 파서 3 assertions PASS.
- checked-JSONException javac compile PASS.
- source manifest 468 files.
- one-click ZIP 501 entries, package-manifest hash readback PASS.
- FIX2 ZIP SHA-256: `73cb794b911cc3439b3b4ef94422a3fc1753838c3d67292e9ca78e9975a502e4`
- source-manifest SHA-256: `058a5b08b28714230261fc28043686ab9bfdb4f6e8572fb7da984c4f54e48d61`

## 미실행
FIX2 Windows Gradle release build, 기존 원본 인증서 서명, versionCode 173 update install, MusicBrainz 자동분류·곡 변경·응비서 인계 실기기 E2E는 아직 미실행이다.

## 안전 경계
자동 명령 재실행, 앱 삭제, 데이터 초기화, 새 서명키, 서버 변경/Render 배포 없음.