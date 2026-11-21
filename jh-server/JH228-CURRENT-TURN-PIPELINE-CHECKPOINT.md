# JH228 카비서 v2.0 — 2026-11-21 현재 발화별 자동 예시사진 연결 후보

## 이번 구현
`jh-server/owner-setup/kabiseo-camera-v0256/camera-v2-current-turn-pipeline.mjs`
- 사용자에게는 **참고사진 + 원하는 분위기**만 요구. 실제 생성 지시·기기 commandId/nonce/설정 입력 노출 0
- 신뢰된 `readCurrentTurn`에서 현재 1개 `REFERENCE` 첨부 확인
- JH Secure Live 플러그인의 실제 `routeShootingTurn/verifyShootingRoute` 포트로 현재 발화 검증
- 신뢰된 Secure56 세션·기기·작업·명령 및 실제 현재 첨부 ID 재조회
- `JH228DurableOnceJournal.claimOneShot`으로 **생성 전** 원자적 1회 예약. 예외·다운로드/화면 확인 불명 상태에서 자동 반복 금지
- 편비서 `createSingleExample` 호출: 원본 보존형 참고 구도 JPEG 1장, 앞뒤좌우 제한 없는 짧은 카메라 이동 안내 3줄
- `createJH228HostDeliveryPorts`의 왼쪽 GPT 표시 **현재 턴 영수증** 확인. 원본과 예시는 서로 다를 수 있다고 표시
- 실제 JPEG 형식·크기/SHA256을 검사하고 **서버 메모리에서 30초·1회** Secure56 임대 발급
- **기존** `life_android_camera_goal_v1`의 서명된 `apply`만 호출. 카비서 V2가 실제 JPEG를 내려받고 예시·줌을 적용한 영수증을 확인
- 사용자가 직접 AUTO를 누르기 전까지 자동 촬영·셔터·저장 호출 0
- 오른쪽 GPT 3줄/입력/복사·붙여넣기 0, 3줄은 왼쪽에 한 번만

## 실제 검증 증거
- GitHub Actions: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/44882484999
- Git 커밋 `4d9232202e7e2b39a065a5768cc080be79f88d16`; 현재 브랜치에 새 pipeline 및 9개 테스트 추가
- CI 기본 검사: JPEG stage **5/5**, 기존/신규 카비서 목표 **12/12**, 왼쪽 영수증·서명 세션 **4/4**, SQLite 1회 원장 **4/4**, 전체 연결 파이프라인 **9/9**, 실제 durable 생성·운영 진입 게이트 **5/5** = **39/39 PASS**
- 독립 Node 프로세스 100회 × [JPEG 5 + LEFT 4 + 원장 4 + pipeline 9 + V2 목표 4 + durable 5] = **3100/3100 PASS**. 로그 `JH228_FULL_HANDOFF_SIMULATED_100_PASS`.
- **중요:** JPEG·SQLite·생성 런타임 검증은 실제 코드지만, GPT 이미지 생성·왼쪽 대화창 표시 및 signed APPLY 응답은 *주입된 모의 포트*다.

## 실제 미연결 및 배포 중지
1. 사용자의 현재 발화/첨부 ID를 반환하는 인증된 **ChatGPT/JH 호스트** 포트
2. JH 플러그인 `plugins_6ac116dadd588191ba4712ffe090534b`의 `routeShootingTurn/verifyShootingRoute`를 호출하는 라이브 어댑터. 현재 버전 확인 1.34.137, 읽기 전용 검사
3. 편비서가 GPT 이미지 도구로 실제 사용자의 참고사진 1장만 변환하여 JPEG 바이트를 반환하는 권한 있는 **실제 생성기** 포트. 해당 API 접근 권한 미확인, 가짜 이미지를 만들었다고 하지 않음
4. **왼쪽 GPT 화면에 실제 표시 완료**한 플랫폼 영수증. 채팅에 글을 출력했다는 추정으로 대체 불가
5. Render 런타임의 내부 stage writer와 SQLite 별도 원장 명시 초기화/승인/키·파일 경로 연결. 현재 서버엔 새 모듈만 있고 실제 등록된 producer 없음
6. 사용자 승인 후 기존 인증서로 JH228 서명·업데이트, 실기기 앱 예시/줌·3×3 격자·수평계·수동 AUTO 1회·저장 재조회 확인

**상태**: 개발 PR #202 Draft 유지; Render `jh-secure-bridge-fix4` LIVE 원본 `5c97a5c7de70a7c85a8bc0d46c209f630281811c` 유지; Android 기존 JH227 유지. 서버/플러그인 운영 릴리스 미변경.

## 사용자 확정 8항목
① 참고사진+분위기 ② 편비서 자동 호출 ③ 예시사진 자동 전달 ④ 오른쪽 GPT 3줄 버튼·입력/복사/붙여넣기 제거(왼쪽 3줄만) ⑤ 직접 움직일 수 있는 **모든 방향·45도·회전·기울기** 허용 ⑥ 줌·촬영 설정 자동 ⑦ 3×3 격자·수평계 ⑧ AUTO 작동 중 진한 버튼색 및 종료 복귀.

**금지**: 새 서명키 생성, 기존 데이터 초기화/앱 삭제, 원격 AUTO, 검증 전 Render 배포·PR 병합, 모의시험 결과로 실제 완료 주장.
