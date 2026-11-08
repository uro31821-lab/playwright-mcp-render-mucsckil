# 이비서 0.5.8 Android v172 — 만료 신뢰 정리

## 실제 v171 실패

versionCode 171 설치는 성공했지만 `서버 해제 상태 확인·계속`을 눌렀을 때 상태 조회만 수행하고 실제 취소 정리를 이어 보내지 않았다. 서버는 활성 기기 없이 `NO_ACTIVE_DEVICE`였고 Google 영구 신뢰 등록은 비활성 상태로 남았다.

## v172 변경

`OwnerEnrollmentController.reconcileCancellation()`을 다음의 한 번짜리 사용자 조작으로 수정했다.

1. signed status를 먼저 한 번 조회한다.
2. 이미 `ENROLLMENT_CANCELED complete=true`이면 cancel을 다시 보내지 않고 로컬 키·저널 해제를 끝낸다.
3. `TRUST_EXPIRED`, `TRUST_REVOKED`, `TRUST_REGISTERED`, `CANCELLATION_PENDING` 등 서버가 기존 등록 또는 정리 상태를 확인한 경우에만 같은 클릭 안에서 signed cancel을 정확히 한 번 보낸다.
4. status 조회가 실패하거나 바인딩되지 않은 응답이면 cancel로 내려가지 않는다.
5. 타이머, worker, 백그라운드 재시도, Google 자동 로그인, 앱 삭제, 데이터 초기화, 새 서명키 생성은 없다.

버튼 문구는 `서버 해제 상태 확인·계속`으로 명확히 했다.

## 서버 선행 수정

PR #182 / merge `2361170e230cbc7ba7103159a67711dde8b5a3b3`가 운영 배포 `dep-dbo6t1vf3r2c73abefp0`로 live 상태다. 오래전에 만료된 유한 신뢰도 기존 휴대폰 키의 서명으로 status/cancel을 수행할 수 있지만 신뢰 갱신, 세션 발급, Android 명령 승인 또는 작업 재실행은 허용하지 않는다.

## 검증

- Kotlin 1.9.24 실제 핵심 소스 컴파일 통과
- 이미 완료된 서버 정리: status 1회, cancel 0회, 로컬 해제 통과
- 만료 신뢰: status 1회 후 cancel 정확히 1회, 로컬 해제 통과
- status 응답 실패: cancel 0회, `REVOKE_PENDING`과 기기키 보존 통과
- 전체 Android source manifest: 463 files, SHA-256 `25a51dbf56b61b3768276c8a63ce1be4dd5451fbb5711b43a86a4d3b41200e2f`
- one-click ZIP SHA-256 `865f239b3135bcf20f12e9d5291413c0b2e5bf52b1ef7d7d4089649508469332`

## 아직 미실행

Windows Gradle 전체 빌드, 원본 인증서 서명, versionCode 172 휴대폰 업데이트, 실제 만료 신뢰 정리, 영구 신뢰 재등록, Secure56 연결, YouTube Music EQ E2E는 아직 실행하지 않았다. 실제 완료는 휴대폰 readback 후에만 판단한다.
