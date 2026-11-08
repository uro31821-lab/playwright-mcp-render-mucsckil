# 이비서 0.5.7 — 신뢰 해제 상태 우선 복구

## 실제 증상

사용자가 휴대폰에서 신뢰 해제를 승인한 뒤 다음 상태에 머물렀다.

- 휴대폰은 신뢰 재연결을 먼저 차단함
- 서버 등록·활성 세션·대기 작업 정리의 최종 영수증은 확인되지 않음
- 화면은 모든 실패를 `요청이 완전히 확인되지 않았습니다`로 합쳐 표시함
- Google 신뢰 등록 버튼은 계속 비활성화됨
- 같은 버튼을 다시 누르면 이전 cancel의 결과를 먼저 읽지 않고 cancel을 다시 보낼 수 있었음

현재 서버에서 휴대폰은 등록 기록만 남아 있고 활성/선택 기기가 없으며, Secure56 명령은 `active_trusted_secure56_device_required`로 거절됐다. 이 관찰만으로 서버 미도달·시간초과·응답 유실 중 하나를 단정하지 않는다.

## 수정

1. 첫 해제는 기존처럼 로컬 재연결을 차단한 뒤 cancel을 한 번만 전송한다.
2. 이미 `REVOKE_PENDING`인 상태에서 사용자가 명시적으로 다시 누르면 무조건 signed status를 먼저 조회한다.
3. status가 `ENROLLMENT_CANCELED`와 `complete=true`이면 cancel을 다시 보내지 않고 로컬 해제를 마친다.
4. status가 아직 pending임을 확인한 경우에만 같은 한 번의 사용자 클릭 안에서 cancel continuation을 최대 한 번 보낸다.
5. status 조회가 실패하면 cancel을 재전송하지 않는다.
6. 타이머·백그라운드·자동 재시도·Google 재로그인·새 등록·앱 삭제·데이터 초기화는 없다.
7. UI 버튼은 `서버 해제 상태 확인·계속`으로 바뀌며, 다음 진단을 구분해 표시한다.
   - `OWNER_SERVER_CANCELLATION_PENDING`
   - `OWNER_SERVER_TIMEOUT`
   - `OWNER_SERVER_UNREACHABLE`
   - `OWNER_SERVER_HTTP_REJECTED`
   - `OWNER_RECOVERY_KEY_UNAVAILABLE`
   - `OWNER_SECURE_UNLOCK_REQUIRED`
   - `OWNER_LOCAL_BLOCKED_PENDING_REFERENCE_REQUIRED`

## 보존 범위

- 이비서 0.5.6의 표준 양수 오디오 세션 ID 기반 EQ 연결 수정은 그대로 보존한다.
- versionCode 171 / versionName `jh171-stage77-location-once-native-select-fix3-keepalive-fix1-ebiseo057`
- 서버 코드는 변경하지 않으며 Render 배포도 필요하지 않다.

## 검증

- 변경된 Controller/Wire를 실제 Kotlin/JVM으로 실행한 집중 계약: 3/3 PASS
  - cancel 응답 유실 뒤 status만 조회하고 cancel 재전송 없음
  - `CANCELLATION_PENDING` 뒤 status → cancel continuation 정확히 1회
  - status 실패 시 cancel 재전송 0회
- XML 구문 및 45개 문자열 참조 확인
- 전체 Android 소스 manifest 463/463 고정
- 검토 사본 바이트 일치
- Windows 전달 스크립트: `adb install -r` 1회, uninstall/data reset/new key/Render deploy 없음

## 아직 미실행

현재 Linux 검토 환경에서는 Windows 전체 Gradle 테스트·release 빌드, 원본 인증서 서명, 휴대폰 versionCode 171 업데이트, 실제 서버 해제 완료, Google 재등록, 이비서 음향 E2E를 실행하지 않았다. 설치와 실기기 readback 전에는 완료로 보고하지 않는다.
