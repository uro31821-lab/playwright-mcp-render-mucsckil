# JH Secure Live 카비서 × 편비서 — 왼쪽 GPT 구도 시안 독립 기능 인계

작성: 2026-11-21. **구형 자동 이미지 파일 전송 PR #202와 별도.**

## 사용자 최종 확정
**현재 참고사진 + 원하는 분위기 입력 → 카비서 주담당 → 편비서 자동 협력 → ChatGPT 자체 이미지 생성 도구로 왼쪽 GPT 대화창에 예시사진 1장 → 바로 실행할 수 있는 쉬운 카메라 이동 안내 3줄.**

**사용 중단**: 왼쪽 GPT 생성 JPEG를 오른쪽 카비서/Secure56으로 자동 파일 전송·다운로드·스테이징하는 기능 **하나뿐**. 편비서 자동 호출/왼쪽 이미지 생성은 중단하지 않음.

## 현재 소스
- `jh-plugin-overlay/skills/jh-camera-left-preview/SKILL.md`: 정확한 사용자 작업·출력·실행 금지 경계. 실제 ChatGPT 이미지 생성 도구는 현재 호스트만 실행할 수 있음
- `jh-server/owner-setup/jh-camera-left-preview/left-preview-route.mjs`: 현재 대화/발화/REFERENCE/분위기/검증된 촬영 요청→카비서 주담당·편비서 촬영 시안 협력 계획. 기존 `edit_existing` 사진 편집·불확실 명령은 배제. 외부 효과 없음
- `left-preview-route.test.mjs`: 8개 독립 경계 테스트
- `.github/workflows/jh-camera-left-preview-only.yml`: 100개 독립 Node 22 프로세스 검증, HTTP/Android 효과 금지 검사

## JH 개인 플러그인 실제 통합
현행 `plugins_6ac116dadd588191ba4712ffe090534b` v1.34.137는 기존 촬영 라우터에서 사진 편집으로 의도치 않게 전환되는 것을 차단. 이 보호는 유지한다. **새 협력은 이미지 편집 실행 경로에 편승하지 말고**, 촬영 구도 예시 전용 협력으로 분리해야 한다.

Plugin Creator `update_plugin`에서 초기에 ZIP manifest 부족으로 실패했고, 정식 manifest가 포함된 진단 패키지는 서버 package 검사까지 통과했으나 현행 release를 보존하기 위해 실제 JH manifest를 축약해 덮어쓰는 업데이트는 하지 않았다. 따라서 **본 PR의 통과와 실제 JH 플러그인 편입은 별개**다.

현행 앱의 `.app.json`, `.mcp.json`, `plugin.json`, `.codex-plugin/plugin.json`, 22개 root defaultPrompt 및 기존 카비서/편비서 SKILL·스크립트는 변경 없이 보존해야 함. 통합 때 새로운 좌측 촬영 예시 협력 문구만 기존 manifest·허브·카비서·편비서 스킬에 최소 추가할 것. JH 개인 플러그인 업데이트에는 현행 release ID 재조회와 업데이트 성공 후 같은 플러그인 ID의 재조회가 필요하다.

## 완료 증거 구분
- 기본 Node 테스트 8개 PASS, 100개 독립 프로세스 800개 PASS는 소스 회귀 검증임
- 실제 ChatGPT image_gen이 현재 참고사진을 변환해 **사용자 왼쪽 창에 이미지 1장을 표시한 경우**만 기능 실사용 성공
- 기존 JH227·Secure56·Render, 인증서·기기 데이터, 사용자 직접 AUTO는 변경하지 않음
- **추가 유료 OpenAI 이미지 API / 원격 셔터 / 오른쪽 이미지 다운로드는 사용하지 않음**

## 개발 링크
- 신규 독립 PR: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/203
- 이전 자동파일전송 취소 PR: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/pull/202
