# 이비서 0.5.9 — 메타데이터 자동 음악 프로필

현재 정상 동작하는 Android AudioEffect 세션 EQ와 영구 기기 신뢰를 유지하면서, YouTube Music이 장르를 비워 두는 경우에도 공개 음악 메타데이터로 자동 프리셋을 선택한다.

## 동작
- `이비서 시작`은 EQ를 활성화하고 AUTO 모드로 전환한다. 재생·정지·seek는 조작하지 않는다.
- 플레이어 장르 → 로컬 캐시 → MusicBrainz 기본 조회 → 선택적 Last.fm 태그 순으로 보강한다.
- 외부 조회에는 제목·가수만 보낸다. 오디오 파형 캡처·녹음·업로드는 없다.
- 불확실한 보컬곡은 `flat`이 아니라 `vocals`(보컬 선명), 명확한 연주곡은 `instruments`로 적용한다.
- 예술가곡, 정가, 민요, 판소리, 샹송, 오페라/아리아, 합창, 관현악, 실내악, 피아노 독주, 현악 독주, 어쿠스틱 악기 프리셋을 추가한다.
- 같은 곡 결과는 최대 256개, 180일 로컬 캐시한다.
- `지금 곡/현재 곡/이 노래 뭐야`는 실제 현재곡을 읽고, 곡 의미·가사 해석은 같은 제목/가수를 응비서로 인계한다. 장문 가사는 재현하지 않는다.

## 검증
- 자동 프로필/보컬 fallback 순수 정책 15 assertions PASS
- 한국어 현재곡/희귀장르 파서 3 assertions PASS
- ExternalMusicMetadataResolver OkHttp 경계 컴파일 PASS
- CooperatingAudioSessionSource + resolver Android stub 경계 컴파일 PASS
- Android source manifest 468 files
- One-click ZIP 498 entries, 전체 해시 readback PASS
- ZIP SHA-256: `e1732a1a6aae140ff7ab7d71371661e4a2530973f29dcd9597e9c6f2ba0b5edb`

## 안전 경계
자동 명령 재실행, 앱 삭제, 데이터 초기화, 새 서명키, 서버 변경/Render 배포 없음. Last.fm은 API 키가 이미 설정된 경우만 보조하며 MusicBrainz 기본 경로는 키가 필요 없다.

## 미실행
Windows Gradle release 빌드, 기존 원본 인증서 서명, versionCode 173 update install, 실제 MusicBrainz 자동분류·곡 변경·응비서 인계 E2E는 아직 미실행이다.