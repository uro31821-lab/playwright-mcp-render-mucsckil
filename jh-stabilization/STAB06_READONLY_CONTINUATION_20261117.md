# STAB-06 작업 이어가기: 원본 Tasks의 읽기 전용 안전 경계

- JH v1.34.126 / Tasks 원장 revision43.
- 기존 `jh-biseo-manager/scripts/continuation.mjs`, `tasks.mjs`, `task-context.mjs`에 가상 새 대화 threadId를 사용하여 **5/5 격리 시나리오 PASS**.
- 작업 미선택 → `TASK_SELECTION_REQUIRED`; 직접 taskId만 지정 → `EXPLICIT_TASK_SELECTION_REQUIRED`; 명시적 선택이 있어도 가용성 미확인 → `AVAILABILITY_UNCONFIRMED`; 오래된 조건 revision → `CONDITIONS_CHANGED`; 다른 방의 기존 메뉴 → `CROSS_THREAD_MENU_EXPIRED`.
- 모든 결과 `stateChanged=false`, `authorizesExecution=false`, `dispatchesTools=false`. Tasks 기록 쓰기·ACTIVATE·RESUME 실제 실행 **0건**.
- 이 검증은 호스트의 실제 새 대화 자동 연결 성공이 아니라 **읽기 전용 기존 코드와 현재 원장 분기**의 PASS이다.
- 사용자 규칙과 저장 자료를 공개 GitHub에 복제하지 않았다. 상세 개인 보관함 원문은 `JH_STABILIZATION_STAB06_TASK_CONTINUATION_READONLY_20261117.md`.
