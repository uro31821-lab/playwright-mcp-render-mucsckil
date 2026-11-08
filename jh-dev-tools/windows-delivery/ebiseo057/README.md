# 이비서 0.5.7 — 무기한 기기 신뢰·해제 복구

## 목적

- 휴대폰 신뢰 등록은 사용자가 직접 해제할 때까지 유지한다.
- Secure56 통신 세션은 30분으로 유지하고 등록된 기기키로 자동 갱신한다.
- 이미 `CANCEL_PENDING`에 들어간 해제는 취소 요청을 반복하지 않고, 서명된 상태 조회로 서버 정리를 재개한다.
- 과거 결과 불명확 작업은 삭제·재실행하지 않고 격리 증거로 보존한다.

## Android 후보

- applicationId: `com.koreanlifehub.bridge`
- versionCode: `171`
- versionName: `jh171-stage77-location-once-native-select-fix3-keepalive-fix1-ebiseo057-permanent-trust`
- 원클릭 파일: `JH_Ebiseo_0.5.7_PermanentTrust_OneClick.zip`
- SHA-256: `2278cdc32813ef4cde521dd6c847b896cd381aa86bf55d31d9c77ae00b50445d`

원클릭 후보는 전체 Android 소스 463개를 고정하고, 기존 원본 인증서만 허용하며, 사용자 `Y` 뒤 단 한 번의 `adb install -r` 업데이트만 허용한다. 앱 삭제·데이터 초기화·새 서명키 생성·명령 자동 재실행·Render 배포는 수행하지 않는다.

## 검증

- 서버 집중 회귀: 29 tests / 29 pass / 0 fail
- 영구 신뢰 400일 경과 REGISTERED
- Secure56 session max: 30분 유지
- 첫 취소 정리 응답 유실 후 signed status로 완료
- 불명확 결과 75건: 보존·격리, 자동 재실행 0
- Kotlin 핵심 컴파일: PASS
- Kotlin 테스트 소스 컴파일: PASS
- 영구 신뢰 정책 하네스: PASS
- 전체 Windows Gradle 빌드·원본키 서명·휴대폰 설치·실기기 신뢰 등록·EQ E2E: NOT_RUN

## 설치 뒤 실제 순서

1. JH 신뢰 설정에서 `해제 상태 다시 확인`을 한 번 실행한다.
2. 서버 해제 완료 뒤 `이 휴대폰 영구 신뢰 등록`을 누르고 Google 본인확인을 한 번 수행한다.
3. Secure56 자동 재연결을 확인한다.
4. YouTube Music 재생 중 이비서 상태를 조회하여 `ACTIVE`, `applicationVerified=true`, `engineConfirmed=true`를 확인한다.
