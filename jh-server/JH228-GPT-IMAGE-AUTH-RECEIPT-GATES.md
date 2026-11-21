# JH228 카비서 v2.0 — GPT 이미지 생성/LEFT 표시/서버 전달 연결 계약 (후속 인계)

기준일 2026-11-21 KST. `jh-fix3-secure-server` LIVE 변경 없음, PR #202 Draft.

## 현행 추가 개발 (이번 단계)
- `camera-v2-verified-host-ports.mjs`: GPT 왼쪽 출력의 **원본 JPEG SHA256 + 3줄 SHA256**을 정확히 묶음. `shown:true` 단독 또는 다른 이미지/다른 3줄은 절대 전송 허용하지 않음. 독립된 호스트 `verifyLeftPresentationReceipt` 검증이 필수.
- `camera-v2-current-turn-pipeline.mjs`: `confirmImageGenerationReady`를 원장 `claimOneShot` **이전**에 실행. 이미지 생성권한/현재 첨부/실제 호스트 준비가 없으면 원장을 소진하지 않고 정지. 생성이 시작된 이후 불명 상태에서 자동 재시도는 여전히 금지.
- `camera-v2-opt-in-gpt-image-port.mjs`: 공식 OpenAI 이미지 편집 API를 호출 가능한 **독립 선택형 구현체**. 고정된 단일 사용자 REFERENCE, `gpt-image-2.6-sunburst`, JPEG 1장, 원본보존형 구도 예시, JPEG 무결성·다음 3줄의 입력/출력 SHA256 확인. **기본 비활성**, 별도 API 비용 승인·현재 첨부 검증·보안키와 실제 카메라 이동 계획 포트 필요. 테스트에서는 `fetchImpl` 가짜 HTTP 사용해 API 비용·외부 전송 0회.
- 서버 원본 Secure56, 원본 13개 해시 잠금, 카비서 AUTO 사용자 직접 누름, JH227 휴대폰, 인증서/비밀번호 보존. 공개 JPEG POST/원격 셔터 없음.

## 현재 미연결 (기술적으로 중요)
1. ChatGPT 호스트의 인증된 현재 턴 첨부 읽기와 진짜 왼쪽 GPT **표시 완료 영수증** API. 서버 내부 코드로 ChatGPT UI 상태를 추측할 수 없음.
2. 편비서의 GPT 이미지 도구 직접 호출/실제 생성 바이트 포트. 이미지를 모델이 만들었다는 텍스트 응답을 믿지 않음.
3. 선택형 GPT **유료 API** 경로를 사용하려면 사용자와 계정에서 API 청구/키 설정을 별도로 승인받아야 함. ChatGPT 플랜과 OpenAI API 비용은 동일한 것으로 가정하지 않음. API 키는 GitHub/파일/프롬프트에 보관하지 않는다.
4. 이미지 생성 결과를 왼쪽에 표시한 후 동일 JPEG를 실제 JH Secure56 서버에 스테이징하고 서명된 `life_android_camera_goal_v1 apply`를 실기기에 적용하는 종단간 확인.
5. 현재 JH 플러그인 촬영 라우터는 구형 촬영 중 `edit_existing` 호출을 차단한다. V2 자동 편비서 예시 생성은 새로운 기존 사진 편집이 아닌, 검증된 현재 촬영 `REFERENCE`의 **전용 1장 생성 보조 포트**로 구분해야 한다. 정본 JH 플러그인 릴리스 업데이트는 E2E가 확인되기 전까지 하지 않는다.

## 완료 판정 금지
GitHub `PASS` = Node/모의 HTTP·장치 콜백 검증일 뿐 실제 ChatGPT ImageGen 연결, LEFT 렌더링, Android 앱 설치/사진촬영, Render LIVE 배포가 아니다.
사용자가 직접 `AUTO`를 누른 뒤 실제 한 장 촬영·저장·재조회까지 실기기 영수증으로 확인해야 한다.

## 근거
- 공식 이미지 편집 API: https://developers.openai.com/api/reference/resources/images/methods/edit
- GitHub 개발 브랜치와 검증 결과: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/202
