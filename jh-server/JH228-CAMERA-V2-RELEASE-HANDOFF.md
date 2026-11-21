# JH228 카비서 v2.0 — Render durable 이미지 전달 후속 인계

2026-11-21 · JH Secure56 · 개발 후보 (운영 미반영)

## 실제 작업 기준
- Render workspace: My Workspace (`tea-dan8erugekts738358ug`)
- 서비스: `jh-secure-bridge-fix4` (`srv-db0fjl2d0e5s73be114g`)
- 운영 브랜치: `jh-fix3-secure-server` (자동 배포 OFF)
- 기존 LIVE 커밋: `5c97a5c7de70a7c85a8bc0d46c209f630281811c`
- 개발 브랜치: `jh228-camera-v2-secure-stage-20261121`, PR #202

## 후보 변경
1. `camera-v2-secure-stage.mjs`: 검증된 JPEG 1장, 30초, 1회 수신. 활성 Secure56 세션 HMAC과 command/task/device를 묶으며, 무단 업로드 API는 없음
2. `jh228-camera-v2-durable-overlay.mjs`: 기존 clean restart → JH167 article review → JH228 GET 경로의 순서로 *생성된 런타임에만* 덮어씌움. 기존 13개 파일 원본 SHA-256 잠금 보존
3. `jh228-camera-v2-candidate-entry.mjs` 및 `published-host-router.mjs`: 운영 기본 경로 보존. 명시적 설정과 E2E 게이트 없으면 JH228 시작 불가
4. CI: HTTP 보안/중복/만료 회귀, 실제 durable 생성 파일·구문 검사, 100개 독립 프로세스 검증

## 활성화 금지 조건
편비서 실제 원본보존형 이미지 생성, 왼쪽 GPT 예시사진+쉬운 3줄 1회 표시/영수증, 현재 턴 검증 라우팅, Secure56 원자 1회 실행 원장, 카비서 signed GOAL APPLY와 실기기 JPEG 수신이 아직 운영에서 연계되지 않았다. 그래서 `JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE`을 설정하거나 Render 서버를 재배포해서는 안 된다.

## 보호 계약
- 오른쪽 `GPT 3줄`/입력/복사·붙여넣기 0회
- 실제 실행 가능한 모든 방향의 카메라 이동·비스듬한 45도·기울기 허용
- 자동 줌과 3×3 격자·수평계·진한 AUTO 색은 Android 기존 패치에서 관리
- 사용자의 실제 AUTO 누르기 전에는 촬영·추적·프리즈·저장 시작 금지
- 기존 JH227과 원본 인증서·Secure56·설치 데이터 보존
- 원격 셔터, 공개 JPEG POST, 서비스 키 공개 금지

**판정:** 별도 브랜치에서 서버 GET 생성 오버레이 검증 완료 후보, 운영 배포·편비서 실제 이미지·휴대폰 E2E 미완료.
