# JH228 카비서 v2.0 — ChatGPT 자체 이미지 생성 우선 · 유료 API 기본 제외

2026-11-21. 개발 PR #202 (Draft). 운영 Render/JH227 미변경.

## 사용자 확정 기능
참고사진 + 분위기만 제출 → JH 카비서가 편비서 미리보기 작업 1회 요청 → ChatGPT 자체 이미지 생성 결과를 호스트가 검증 → GPT 왼쪽에 예시사진 + 유치원생 수준의 짧은 촬영 지시 3줄 → 동일 JPEG를 Secure56에서 30초·1회만 전달 → 카비서 오른쪽 예시 표시 및 자동 줌·촬영 설정. 사용자가 직접 AUTO를 눌러야만 기존 프리즈·1장 셔터·저장·재조회 단계 실행. 오른쪽 GPT 3줄 입력 버튼/복사 붙여넣기는 0회.

## 이번 실제 코드 추가
- `camera-v2-chatgpt-native-image-ports.mjs`: **ChatGPT 자체 이미지 생성 결과를 반환할 수 있는 승인된 호스트만** 연결하는 포트. 현재 턴 REFERENCE 첨부, 원본 SHA-256, `provider=CHATGPT_NATIVE_IMAGEGEN`, 실제 생성 영수증 검증, JPG readback, 이동 안내 3줄의 입력/출력 해시 검증. API 키·HTTP fetch·외부 유료 이미지 API 호출 코드 **없음**. 생성 효과 후 불명확하면 자동 재요청 금지. 원본 자산의 비공개 핸들은 readiness 응답으로 내보내지 않음.
- `camera-v2-current-turn-pipeline.mjs`: `CHATGPT_NATIVE_IMAGEGEN`만 수락; `billingMode=CHATGPT_PLAN`, `externalApiRequired=false`, `paidApiBillingAuthorized=false`, 원본과 결과 SHA 및 네이티브 생성 영수증 확인 후에만 LEFT 표시·서버 stage·signed APPLY 진행. 유료 API 형식은 작업 원장 예약 전에 거부.
- `camera-v2-chatgpt-native-capture-flow.mjs`: 기존 카비서 파이프라인과 네이티브 이미지 생성 포트를 묶는 합성 진입점. 이전 유료 API용 `createSingleExample`를 외부에서 주입해도 네이티브 포트가 반드시 덮어써 사용하지 않음. 새로운 대화/첨부로 바뀌면 중단.
- 각 모듈 독립 Node 테스트와 연결 통합 모의시험 추가.

## 확인된 GitHub CI
- 최종 **SUCCESS** [run 44884764872](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/44884764872)
- 기본 단위/회귀: JPEG5 + 카비서 목표12 + 왼쪽 영수증7 + 1회 원장4 + 기존 파이프라인20 + 네이티브 이미지 포트8 + 기존 유료 API 비활성 모의5 + 네이티브 합성 연결4 + durable 오버레이5 = **70/70 PASS**
- 독립 Node 프로세스 **100회 × 62개 핵심 시험 = 6,200/6,200 PASS**
- 모의 포트 테스트이며 실제 ChatGPT image_gen 호출, 플랫폼 영상/화면 표시·JPEG 파일 다운로드 성공, Secure56 실기기 적용은 검증한 적 없음. 유료 Image API 요청 0회.

## 아직 실제로 연결되지 않은 호스트 권한 (필수)
1. ChatGPT 자체 image_gen이 생성한 바이너리/자산 ID를 **현재 사용자의 원본 참고사진과 같은 대화**에 묶어 JH 쪽에 넘길 수 있는 공식 호스트 포트.
2. 플랫폼이 보증한 편비서 이미지 생성/좌측 화면 표시 완료 영수증을 확인하는 내부 포트. GPT 텍스트의 "완료"는 증거로 사용 불가.
3. 카비서/편비서의 요청 소유권과 실제 Secure56 운영 서버의 원자 실행 원장·stage writer·기존 `life_android_camera_goal_v1` APPLY 연결.
4. 승인된 JH228 실기기 업데이트 후 같은 JPEG 표시, 자동 줌, 3×3 그리드/수평계, 사용자 AUTO, 1장 저장·재조회 실기기 시험.

**현재 판정**: 네이티브 이미지 연결 계약과 모의 구현·실제 GitHub CI 통과. 운영 기능은 **미완료**. 다른 챗/화면에서 생성한 이미지를 임의 추정해 전달하지 않으며 별도 과금이 필요한 API 키 생성을 요청하거나 실행하지 않음.

## 정본
- [개발 PR #202](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/202)
- `jh-server/owner-setup/kabiseo-camera-v0256/camera-v2-chatgpt-native-image-ports.mjs`
- `jh-server/owner-setup/kabiseo-camera-v0256/camera-v2-chatgpt-native-capture-flow.mjs`
- `jh-server/owner-setup/kabiseo-camera-v0256/camera-v2-current-turn-pipeline.mjs`
- `jh-server/owner-setup/deployment/jh228-camera-v2-durable-overlay.mjs`

## 기존 보호
- Render 서비스 `jh-secure-bridge-fix4` 운영 브랜치 `jh-fix3-secure-server`, 자동 배포 OFF. PR Draft 유지.
- 기존 JH227 앱 및 Android AUTO, 원본 인증서/키, 데이터, JH Secure Live 플러그인 현행 릴리스에 변경 없음.
- 유료 OpenAI API adapter는 과거 개발 후보의 별도 파일로만 존재하며 본 네이티브 경로에는 import·호출하지 않음. 기존 코드의 존재를 실제 API 사용으로 간주하지 않는다.
