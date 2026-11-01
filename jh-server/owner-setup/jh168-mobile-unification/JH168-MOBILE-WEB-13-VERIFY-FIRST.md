# JH168 — Playwright → Android RIGHT 모바일 엔진 전면 교체: **13개 전체 검증 우선 / 일괄 수정** (2026-11-01)

> **최신 사용자 지시:** 기존 9개 `life_web_*` 웹 명령 + 4개 진입 경로의 전면 교체를 이번 작업의 **유일한 우선순위**로 한다. Android 원래 접근성/창/스크롤까지 함께 검증한다. Stage28–37의 서버 결과 회수·SQLite·영수증 작업은 기존 증거로만 보존하고, 13개 검증 완료 전 신규 기능·새 단계·배포·DB 정리로 관심을 분산하지 않는다.

## 🔒 최종 구조 확정 — 웹 운영과 모바일 조작을 단일 엔진으로

**2026-11-01 사용자 최신 확정:** 기존 웹/클라우드 **Playwright 실행 엔진 전체를 최종적으로 제거**한다. 웹 브라우저(기존 오른쪽 Chrome)와 일반 Android 앱 조작은 **단일 Android 접근성 기반 Playwright Mobile 실행 엔진**에서 수행한다. 9개 웹 명령 + 4개 진입 경로만 바꾸고 별도 Playwright 엔진을 유지하는 것은 최종 완료가 아니다.

**최종 구조:** GPT → 하나의 JH MCP → Secure Bridge → 단일 서명 모바일 실행 디스패처 → 동일한 Android 오른쪽 화면의 Chrome 웹 및 일반 앱 → 같은 원본 명령/기기/승인/완료로 GPT 복귀. 브라우저 Chrome 앱 자체를 제거하는 것이 아니다.

**완료 기준:**
1. 웹 주소 열기·화면 읽기·클릭·입력·드롭다운·키/Enter·조건 대기·뒤로·스크린샷, 앱 내 세로/가로/중첩 스크롤, 여러 창/팝업을 하나의 Android 실행 로직에서 제공. 검증 결과 미확정/지원 불가 시 별도 Playwright로 무단 폴백하지 않는다.
2. 웹↔Android 앱 전환 도중 같은 Secure56 서명 명령·창 ID·현재 컨텍스트·항목 참조, 로컬 승인·화면동의·완료 수신·중간 개입·GPT 복귀를 일관되게 보존. 창 변경 시 신규 화면 증거와 itemRef를 획득하고, 동일 효과를 자동 재실행하지 않는다.
3. 9개+4개 외 모든 실제 Playwright 참조도 전수 조사하여 서버 브라우저 세션, 클라우드 프로필, 복구/라우터/폴백/독립 브라우저 호출 및 서버 의존성을 후행 일괄 제거. 독립 Render playwright-mcp 서비스는 사용처와 다른 기능 영향 확인 후 별도로 정리하며, 승인 없는 서비스 삭제는 금지.
4. 기존 13개 명령 실기기 E2E, 앱↔웹 상호 개입, 성능, 기존 기능 전체 회귀·안면 인식·GPT LEFT/Chrome RIGHT, 원본 APK 서명/허가·중복 방지 통과 전에는 완료로 표시하지 않는다.
5. 운영 위험을 줄이기 위한 **임시 전환 스위치/롤백은 검증 단계에서만** 허용. 최종 배포에서는 영구적인 두 실행 로직 공존, Playwright 자동 폴백, 실행 방식·Primary 재선택 반복을 없앤다.

**실행 순서:** 먼저 13개 원본 기능과 연결 계약을 끝까지 검증 → 공통 문제를 기존 단일 결함 장부에 취합 → 동일 원인 일괄 수정 및 전체 회귀 → 단일 Android 실기기 검증 → 기능 동등성 확인 후 기존 Playwright 실행부와 임시 테스트 스위치를 완전히 제거해 최종 회귀. 현재 검증 중 기능 코드를 개별 변경하지 않는다. 운영 배포·휴대폰 승인·서비스 삭제는 별도 실제 승인/증거 기준 유지.

---

## 검증 대상 고정 — 9 + 4

| 구분 | 명령/진입 경로 | PR #72 소스 관찰 | 실제 Android E2E |
|---|---|---|---|
| WEB-01 | `life_web_navigate` | signed RIGHT Chrome URL open 경유 | NOT_RUN |
| WEB-02 | `life_web_snapshot` | signed RIGHT START/STATUS 경유 | NOT_RUN |
| WEB-03 | `life_web_click` | context + fresh itemRef CLICK | NOT_RUN |
| WEB-04 | `life_web_type` | SET_TEXT 사전검사; CSS/submit 직접지원 없음 | NOT_RUN |
| WEB-05 | `life_web_select` | 메뉴 OPEN→신규항목 확인→PICK 2단계 | NOT_RUN |
| WEB-06 | `life_web_press_key` | BACK만 허용, Enter/Tab/Escape 미검증 | NOT_RUN |
| WEB-07 | `life_web_wait` | conditionVerified:false, 조건 대기 미구현 | NOT_RUN |
| WEB-08 | `life_web_back` | signed BACK; Chrome history를 성공으로 가정하지 않음 | NOT_RUN |
| WEB-09 | `life_web_screenshot` | 원래 Android local consent·1회 캡처 | NOT_RUN |
| ENTRY-01 | `life_route` | phone RIGHT 우선 분류 | NOT_RUN |
| ENTRY-02 | `life_open_service` | RIGHT URL open 원본 경로 | NOT_RUN |
| ENTRY-03 | `life_naver_mail` | RIGHT Chrome 메일 열기 | NOT_RUN |
| ENTRY-04 | `life_android_open` | 원래 native/app 경로와 phone web 경로 분류 | NOT_RUN |

### 검증은 **13개를 중단하지 않고 끝까지** 진행

**A. 소스·라우팅 검증:** 모두 동일한 원본 Secure56/Android RIGHT 엔진에 들어가는지, Playwright 클라우드 브라우저로 몰래 대체되는 경로가 없는지 확인. 소스 빌드 성공 = 기기 기능 완성 아님. 항목별 `SOURCE_PASS|SOURCE_FAIL|BLOCKED|NOT_RUN`로 독립 기록.

**B. 공통 모바일 동작과 13개 실제 사례:** 오른쪽 Chrome과 Android 앱의 포커스, 창 ID 교체, 팝업/중첩 스크롤, 입력 사전검사, 로컬 승인/스크린 동의, 선택지 재읽기, 실행 중 다른 로직 개입/복귀, 같은 작업 완료 응답, 속도·중복 실행 방지. 사용자 승인이 필요한 실제 휴대폰 효과는 **각 해당 승인 범위로 1회만** 수행. 미구현/기기 미연결 시 PASS 대신 BLOCKED로 기록하고 *다음 항목 계속 검증*.

**C. 문제 일괄 수집:** 모든 항목을 PASS/FAIL/BLOCKED로 조사한 뒤, 중복되는 원인을 `입력/포커스`, `중첩 스크롤`, `다중 창/항목 인식`, `키/선택/대기`, `명령 진입/통합`, `서명·승인/결과`, `테스트/출시 차이`로 묶는다. 동일 원인 한 번만 수정한다. **13개 전체 검증 전 동작 소스 수정 금지**(보안상 즉시 중단이 필요한 상황 제외).

**D. 한 번에 수정·한 번에 재검증:** 결함 목록과 우선순위를 고정해 **단일 기능 수정 묶음**(하나의 기존 작업 PR)을 작성한다. 전체 9+4 회귀, 원본 Secure56 HMAC/nonce, Android UI, one-shot phone approval, GET/POST no-replay, 기존 앱 서명, 창/스크롤/포커스, 최신 main 호환성, 한 번의 실기기 세션 순으로 재검증. 실패 시 영향 범위를 다시 확인하되 문제별 무작정 APK/서버 재설치하지 않는다.

## 확인된 역사적 증거와 분류 (완성 판정 아님)

- **PR #72** (`feat/jh168-mobile-web-13-securebase-20261031`, 원래 SHA `43bb260bb0f2e8b9e5ef48f4dd4b860181701042`): 소스 전환과 생성 Secure56 서버 라우팅 CI `41204264607` **성공** (9 aliases, 4 entrypoints). 실제 모바일 종단은 미실시. 원본 Secure56 전면 교체/배포/서명 APK 재설치의 성공 증거가 아니다.
- PR #72 후속 관련 CI `41204321189`은 이전 브라우저 CLICK 거부문구를 기대하는 JH167 V2 테스트에서 1개 실패 (실제 native click 실패라고 단정하지 않음). `41204321123`, `41204321253`, `41204321130`은 서로 다른 구 버전 보호 소스 해시/내용 차이 검사에 걸림. 원인·기대 동작 판정 필요.
- PR #72는 원본 4개 진입 경로의 전환을 소스 수준에서 보여주지만, 일부 기존 `life_status` 등의 Playwright 기반 코드 제거는 별도 후행 정리로 남김. 새로운 모바일 앱/Android Kotlin 전체 기능이 이 PR에서 검증되었다고 주장하지 않는다.
- **Chrome ⋮ 실기기 CLICK 1회 성공(27단계)**은 기존 signed Android RIGHT 실행의 특정 작업 증거이지 `life_web_click` alias가 PR #72 교체본으로 배포돼 통과했다는 증거가 아니다.
- Native 키 BACK 외 Enter/Tab/Escape, 조건부 wait, submit, 메뉴 option 새 항목, screenshot consent, 내부/중첩 scroll 및 입력 포커스/다중창은 추가 검증 또는 기능 미비로 결함 후보에 등록한다.
- 현재 주 브랜치 `jh-fix3-secure-server`와 원래 PR #72의 과거 기능 브랜치가 다르므로 **최신 소스 병합 전에 13개 정합성 재검증 필수**. 기존 신뢰/승인/서버 코드는 임의로 덮어쓰지 않는다.

## 이 문서가 바꾸는 실행 방법

`계속` = **다음 아직 확인하지 않은 WEB/ENTRY 항목 검증**. 13개를 다 확인하기 전 기능 수정·다른 프로젝트 단계·DB 정리·Gemini 개발·Stage 번호 연장 금지. 단 하나의 결함 장부를 유지하고, 모든 대상 결과가 모인 뒤 일괄 수정과 전체 재시험으로 넘어간다.

**상태 판정:** 소스 라우팅 일부 검증 / 실기기 13개 전체 완료 **0/13**. 안전한 승인 없는 기기 명령 반복 **0회**. 이 전환이 완성됐다는 주장은 금지.
