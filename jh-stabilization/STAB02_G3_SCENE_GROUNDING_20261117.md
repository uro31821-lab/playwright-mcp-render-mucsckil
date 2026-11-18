# STAB-02 / G3 카비서 참고사진·현재 장면 분리 — 2026-11-17

## 실제 관찰과 사용자 확정 규칙
- G3 S1 실사용에서 과거 디퓨저 참고사진을 현재 현장 피사체로 오인해 이동 지시를 출력한 것은 **실제 FAIL**.
- 사용자는 `카비서 시작`을 한 번 입력하고 `카비서 종료` 명시 전까지 같은 대화에서 여러 촬영을 계속한다.
- 참고사진 1~10장은 목표 구도·주인공·분위기 자료이며 현재 카메라 프레임이 아니다.
- 실제 현장 장면을 확인한 후에만 상하좌우·각도 **정확히 3줄** 이동 지시. 현재 화면 미확인이라면 이동을 추정하지 않는다.
- 촬영·수동/반자동/자동 모드·에이밍/셔터·Android JH214·Secure56·편집 비서 명시적 전환 및 사용자 승인/no-replay 규칙 그대로 유지.

## 소스 후보 — 운영 연결 보류
- 읽기 전용 `camera-scene-grounding.mjs`는 현재 장면의 신뢰된 provenance와 대화/세션 revision 바인딩을 검사하는 **격리 후보**.
- fixture 20/20 PASS. reference image, foreign thread, stale revision, no live observation, ended session -> movement guidance 차단.
- **실제 호스트가 current scene evidence를 공급한다는 증거 없음.** 기존 정상 촬영 안내를 차단하지 않도록 현재 JH CLI / Plugin 1.34.125에 이 후보를 강제 연결하지 않음.
- 모든 결과는 코드 단위시험이며 실기기 촬영·실제 호스트 E2E가 아님.

## 실제 적용
- `JH Secure Live v1.34.125`: 에비서 photo-taste 스킬의 오래된 JH188 '현재 운영본' 문구를 최신 실기기 JH214/v0.28.6로 바로잡은 문서/테스트 수정만 릴리스.
- JH188 자동촬영 0.55초/반자동 안정 2초 기록은 이력으로 보존하되 JH214 현재 수치로 단정하거나 덮어쓰지 않음.
- host defaultPrompt 22개·keywords 120개 및 기존 앱/MCP 연결 변화 없음. 관련 Node 테스트 62/62 PASS, Plugin Creator 재조회 PASS.

## 다음 게이트
신뢰된 실제 호스트 sceneRef·sessionRevision, 매 응답 `route.check_response` 실제 호출 증거, S1 재사용자 입력 및 S2 협력결과 E2E가 확보될 때에만 scene guard 연결·G3 통과 여부를 결정한다. 미확정 상태에서 자동 실행·배포 없음.
