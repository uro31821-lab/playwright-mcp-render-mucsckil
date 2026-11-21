# JH228 카비서 — AI 크기 조절을 유한한 줌인/줌아웃으로 대체 (개발 후보)

## 최종 사용자 기준
- 사용자가 앞으로/뒤로 움직일 수 없고 **화면 속 피사체 크기만** 바꾸려면 GPT는 줌 변경을 먼저 검토한다.
- 위·아래·좌·우·사선·회전 및 **원근·배경거리·시점 변화**는 실제 촬영자가 카메라를 움직여야 하며 줌만으로 대체하지 않는다.
- 기본 상대 크기: 조금 크게 1.15배, 더 크게 1.25배, 조금 작게 0.85배, 더 작게 0.75배.
- 현 CameraX 지원배율과 최대 2배 품질 상한을 넘거나 최소 줌 아래로는 **거짓 적용 없이 이동 안내**.
- 사용자가 직접 바꾼 줌이 최우선. AUTO 대기/촬영·저장 중에는 자동 재설정 금지.

## 실제 앱 소스 후보
사용자가 올린 `JH228_KABISEO_V2_BUILD_ONLY_ROUTE_GUARD_PATCH_20261121.zip`의 **638개 Android 원본**을 기준으로:
- `MainActivity.kt`에 기존 Secure56 `life_android_camera_goal_v1` AP​PLY 경로의 **zoom-only goal** 승인/명령 원장/CameraX setZoomRatio 호출/독립 STATUS readback만 추가함.
- `BridgeService.kt`에서 이전에 사용자가 제외한 ChatGPT → 오른쪽 카비서 JPEG 자동 다운로드를 명시적으로 차단.
- `V2SubjectSizeZoomPolicy.java` 신규로 배율 제한/원근 변경·수동 override·AUTO busy·stale status 판단.
- **원본 638→639 파일, 변경 2개 + 신규 1개**. 카메라 AUTO/프리즈/셔터/저장, 화면 격자·수평계 코드 원본 보존.
- **별도 API/서버 확장/자동 이미지 생성 업로드/원격 AUTO 없음.**

이 PR은 Android source ZIP을 자동 설치하지 않는다. 전체 소스와 `SOURCE_LOCK.json` 포함 다운로드 패키지 `JH228_KABISEO_ZOOM_ONLY_NO_IMAGE_BUILD_20261122.zip`은 작업 대화에 첨부되어 있으며, 현재 운영 JH227에 적용되지 않았다.

## 실제 확인된 검사 vs 미완료
- 로컬 Java 정책: 8,000개 다양한 정량 난수 케이스 + 경계/예외, 실제 `javac` 컴파일; Node 호스트 플래너 13/13 PASS. **독립 프로세스 100회씩 PASS**.
- Android 소스 639개 SHA lock, 원본 변경 경계 35/35 검사 PASS. ZIP 내용 658개/sha 모두 확인.
- **미실행**: Android Gradle 전체 빌드/실기기 설치·서명/사용자 AUTO 촬영/Render LIVE 배포.
- 실제 현재 JH227에는 새 zoom-only protocol이 없으며, **운영 Secure56 호스트의 새 goal wire 허용/STATUS에 대한 실기기 readback도 미검증**. 서버가 이를 이해한다고 가정하지 않는다.
- 다운로드한 것은 JH228 **빌드 전용 후보**. 설치·자동수정·API 호출 아님.

## 프로토콜
`JH_CAMERA_V2_ZOOM_ONLY_V1`은 숫자·서명된 현재 작업/세션/오른쪽 창/지원 zoom metadata를 요구하고, photo/JPEG/URL/lease를 허용하지 않는다. `apply`의 pending은 성공이 아니며 `status.zoomOnlyStatus=APPLIED_VERIFIED`가 실제 CameraX ratio로 재조회될 때만 성공. 명령 재발급/자동 재시도 금지.

## 격리
이 PR은 사용자 취소한 이미지 자동전송 PR #202 또는 별개 왼쪽 GPT 프롬프트 PR #203을 병합하지 않으며 **Draft 상태**로 유지한다. 기존 JH Secure Live 플러그인, JH227 설치본, Render LIVE 커밋, 원본 인증서/이미지 원장은 변경하지 않는다.
## 2026-11-22 경계값 수정 및 빌드 보류 (코드 기준 확정)

- **실제 수정 대상**: 이 브랜치의 `V2SubjectSizeZoomPolicy.java`와 `ZoomOnlyPolicySmoke.java`, `camera-zoom-only-intent.mjs` 및 해당 테스트. 기존 JH227 앱과 운영 서비스는 변경하지 않았다.
- 원래 Java 정책은 2배 품질 한계에 0.0001을 더한 값까지 적용할 수 있었다. 실제 예: 현재 1.60004×, 25% 확대 → 목표 2.00005×를 `APPLY` 허용. 이제 목표 배율이 하드웨어/2배 경계를 **조금이라도 넘으면** `MOVE_REQUIRED`로 차단한다. 이미 2배보다 높게 수동 변경한 상태에서 새 목표가 품질 범위 이내인 **축소**는 허용하며 확대 방향 반전은 거부한다.
- 원래 Signed STATUS 검증 이후에도 Secure56 세션 ID와 현재 thread/source ID가 빈 상태인 계약을 명시적으로 차단한다. 이는 호스트 단계 **추가 입력 검증**이며 실제 서명 증명이 완료됐다는 뜻은 아니다.
- 독립 로컬 JDK21 컴파일/회귀: 경계·보안 검증 + 배율 12,000개 무작위 결정적 케이스를 포함한 **35,661개 단언 × 100 독립 프로세스 PASS**. 상용 Android 카메라 실험 아님.
- GitHub PR #204 Draft 최종 보안·Node·Java·금지기능 검사 및 Node/Java 100회 반복: [Actions PASS](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/44921939233).
- GitHub PR #203은 겹치는 두 Android 줌 정책 파일을 삭제해 **왼쪽 GPT 이미지 안내만** 남겼다. [PR #203 Actions PASS](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/44922077417). 사용자가 제외한 이미지 파일 자동 전송은 두 후보 어디에서도 재개하지 않는다.
- **매우 중요: 기존 대화 ZIP의 Android 639개 완전 소스 자체에는 이 GitHub 최신 수정이 자동 반영되지 않는다.** 이 PR이 보관하는 Java 정책·호스트 검증 코드를 639개 소스의 별도 검증 사본과 대조해 병합하고, 바뀐 SHA 잠금을 다시 계산한 뒤 Windows에서 `assembleRelease`/lint **build-only**를 실행해야 한다. 오래된 639개 잠금 PASS를 신규 패치의 PASS로 재사용 금지.
- 전체 Android 639개 소스의 실제 ZIP은 현재 개발 실행 환경에서 원본 바이트를 열지 못했다. 따라서 **신규 Gradle 빌드, 신규 APK 서명·설치, 기기 readback, 자동 줌 E2E, AUTO·저장 E2E는 모두 미완료**. 예전 JH228 설치 시도에 결과 불확실 기록이 있으므로 먼저 *읽기 전용* 앱 버전·서명·상태를 확인하고 불확실하면 자동 재설치 금지.
- 완료 기준: (1) 새 639개 소스 병합과 Gradle/Lint PASS → (2) 현재 앱 읽기 전용 상태 확인 → (3) 사용자 승인하에 원본 인증서 유지한 업데이트 여부 결정 → (4) CameraX 실제 상태 재조회와 수동 줌/AUTO/한 장 저장의 실기기 확인. 코드 단위시험과 디바이스 성공은 구별한다.
