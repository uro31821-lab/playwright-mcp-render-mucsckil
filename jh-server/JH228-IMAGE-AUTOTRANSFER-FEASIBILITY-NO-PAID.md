# JH228 — 자동 예시사진 전달 기술 검증 및 무과금 경계 (2026-11-21)

## 사용자 확정 경험
`현재 참고사진 1장 + 분위기`만 입력 → ChatGPT 자체 이미지 생성 → 왼쪽 GPT 예시사진과 아주 쉬운 3줄 → 같은 파일을 오른쪽 카비서에 자동 전달 → 사용자가 직접 AUTO. 외부 유료 이미지 API, 오른쪽 GPT 수동입력·복사/붙여넣기, 원격 AUTO는 금지한다.

## 실제 Android 소스에서 확인한 동작
JH228 후보 `CameraV2ExampleDownloader.kt`는 인증된 GOAL APPLY 시 서버의 `GET /device/camera-v2-example`에서 일회용 JPEG를 다운로드하여 SHA256·크기·디코딩을 검사하고 private cache로 옮긴다. `BridgeService.kt`는 다운로더가 성공한 뒤 `CameraGoalSecureDispatch.handle`을 호출한다. `com.jh.photomaster.MainActivity`는 `V2_REFERENCE_APPLIED` 및 `V2_CAMERA_UI_STATUS`를 반환한다. Android 소스는 2026-11-21 미서명 빌드 확인된 **이전 참고본**이다. 이것은 LIVE 설치/동작을 증명하지 않는다.

## 공식적으로 문서화된 ChatGPT 파일 출구
- ChatGPT Images Help: `Copy`, `Save`, `Share`로 이미지를 사용자 기기/다른 앱으로 보낼 수 있다. 이 기능은 **사용자 UI 조작**을 전제로 하므로 사용자의 자동 전달 요구를 충족했다고 할 수 없다. https://help.openai.com/ko-kr/articles/11084440-images-in-chatgpt
- GPT Actions의 `openaiFileIdRefs`: Actions POST 요청에 대화 파일(구 문서에서는 DALL-E 생성 이미지 포함)을 자동 첨부하는 5분짜리 URL 경로가 문서화돼 있다. 그러나 **GPT Actions의 파일 인수 계약**이고, 현재 설치된 JH Secure Live **MCP 플러그인**과 동일한 호스트 기능을 제공한다고 증명할 수 없다. GPT Actions 방식은 별도의 경로 검증 없이는 채택 금지. https://developers.openai.com/api/docs/actions/sending-files
- Responses API `image_generation`은 생성 결과 base64를 제공하지만 **OpenAI API 호출**이며 ChatGPT 구독 내부 이미지 생성 도구의 서버 전송 권한을 대신하지 않는다. 별도 과금 API를 자동으로 사용하지 않는다. https://developers.openai.com/api/docs/guides/tools-image-generation

## 이번 PR 코드의 검증된 정책
1. `camera-v2-opt-in-gpt-image-port.mjs`와 동명 시험 파일을 개발 브랜치에서 삭제했다. 제3자 서버·외부 이미지 REST를 이용할 선택형 어댑터도 운영 기본 경로에 없다.
2. `camera-v2-no-paid-api-contract.test.mjs`가 코드 내 유료 OpenAI 이미지 REST 엔드포인트/임포트/키 사용을 검색하고, 원치 않는 재도입 시 CI를 실패시킨다.
3. `camera-v2-chatgpt-native-capture-flow.mjs`는 네이티브 이미지 포트를 강제하고 유료 API용 콜백을 덮어쓴다.
4. `camera-v2-chatgpt-native-image-ports.mjs`는 **접속 가능한 실제 호스트 구현체가 있을 때만** 현재 발화/REFERENCE 이미지 자산·생성 완료 영수증·실제 JPEG 바이트를 신뢰한다. 가짜 `shown:true` 또는 임의 URL은 사용하지 않는다.

## 미완료: 현재 플랫폼 연결
**현재 연결된 JH Secure Live/Render에서 ChatGPT 자체 Images 생성 자산의 바이트를 JH 서버에 무인 전달하는 공인 호스트 포트를 확인하지 못했다.** 내부 포트명과 모의 Node 콜백의 존재는 연결 증거가 아니다.

원클릭 Share 대안은 기술적으로 가능하지만 **사용자가 원한 0회 조작 경로를 충족하지 않으므로 별도 모드로 도입하지 않는다.** GPT Actions 전용 자동 파일 참조 방식은 증빙을 갖춘 격리 실험에서만 조사할 수 있다. 기능이 확보되기 전에는 Render LIVE/JH227을 건드리지 않는다.

## 실제 전환 시 필수 검증
- ChatGPT Images 실제 생성물의 **플랫폼 승인 자산 ID와 원본 참고사진 ID 바인딩**.
- 생성 JPEG byte readback과 SHA256, 왼쪽 GPT 이미지/3줄 표시 완료 영수증 일치.
- 외부 비용 0, 직접 입력·복사·붙여넣기 0, 원격 AUTO 0.
- 활성 Secure56 기기/명령/세션/nonce/HMAC 검증, 30초·1회 스테이징, signed GOAL APPLY, 오른쪽 JPEG 표시.
- 기존 인증서 그대로 JH228 설치 승인 후 실기기 AUTO·1장 촬영/저장·재조회 및 오류 5% 이내 시험.

**현재 결과: 정책과 보안 코드 개발/모의 검증, 실서비스 자동 이미지 바이트 전송 미검증. 운영 배포 금지.**
