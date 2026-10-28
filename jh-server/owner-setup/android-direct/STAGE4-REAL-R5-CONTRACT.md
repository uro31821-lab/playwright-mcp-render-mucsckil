# JH167 R5 실소스 계약 대조 (2026-10-28)

**확인된 원본:** 기존 라이브러리 `JH167-R5-ONECLICK.zip` 실제 ZIP 바이트 확보.
- Outer archive SHA256: `1fc44152397d22a0674921f6b48e447f63e0595593452f055d174dbee81ad5e7`
- Nested `SOURCE-CORE.zip` SHA256: `b28adc8bf9feeaf1e60651272c7106be71dab91e22e85d017814696e6d412dc6`
- ZIP CRC 검사 모두 정상. Android 원본 구조 `JH/android/source/app/src/main/java/com/koreanlifehub/bridge/` 및 `BridgeService.kt`, `AndroidAgent.kt`, `AndroidComputerUseTransport.kt`, `OrchestratorAndroidComputerUseAdapter.kt` 실제 확인.

## 이전 단계 코드를 반드시 수정한 이유

1. **승인 토큰 오해 교정**: 실제 `AndroidComputerUseTransport.prepare`는 `code=READY`, `leaseToken`, `requiresFreshApproval`를 반환하며, `actionApprovalGrantToken`을 직접 발급하지 않는다. `AndroidComputerUseActionApprovalRuntime`의 **별도 사용자 현장 승인 요청/상태 확인**에서만 `grantToken`이 나온다.
2. 정상 저위험 `READY`, `requiresFreshApproval=false`, 유효한 임대가 있을 때는 추가 승인 토큰 없이 기존 JH 호스트의 인증·저널 아래에서 단 한 번 실행할 수 있다. `APPROVAL_REQUIRED`이거나 승인 확인이 필요한 동작은 현재 **차단**, 기존 Android 현장 승인 흐름을 통합하기 전에는 실행하지 않는다.
3. **좌표계 오류 교정**: `AndroidComputerUseRuntime.mapPoint`는 작업창 전체 `workBounds`의 위치와 **작업창 크기를 기준으로 제공된 viewport**를 이용해 최종 Android 전체 화면 좌표로 매핑한다. 폴더블에서 GPT 오른쪽을 누르지 않도록, 서버에 입력된 **전체 화면 기준 좌표는 서명된 왼쪽 작업창** 범위를 검사한 뒤 `x - workBounds.left`, `y - workBounds.top`의 **창 로컬 좌표**로 바꾸고 `viewportWidth/Height`를 작업창 크기로 제공해야 한다.
4. 새 화면, 새로운 명령/서명 세션, 접힘/분할선 이동 중 구 좌표·토큰 재사용 금지.
5. ZIP은 R5 원본이며 10/28 Gemini 후속 변경이 이미 적용된 최신 설치본과 동일하다고 **주장하지 않는다**. 최신 원본과 최종 합칠 때 변경 파일의 SHA로 충돌 검사 필수.

## 이 단계 상태
- GitHub에는 **수정 함수와 합성 테스트만**. 실제 전체 R5 소스 ZIP 및 서명 키를 GitHub 공개 저장소에 업로드하지 않았다.
- 저위험 실제 JH 프로토콜에 맞는 **라우터 코드 교정**을 가상 화면으로 검증.
- APK 실기기 설치, 현장 승인, 실제 화면 조작, 최종 Playwright 제거는 미실시.
