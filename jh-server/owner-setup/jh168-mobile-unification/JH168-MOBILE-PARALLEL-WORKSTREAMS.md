# JH168 병렬 개발 작업 규칙 — 2026-11-01

**확정:** 충돌이 없는 문제는 독립 브랜치/독립 소스 파일에서 동시에 수정하고 각각 CI를 통과시킨다. 공통 실행부, Secure56 보안, 명령 ID, 승인 및 서명 APK를 여러 작업이 동시에 편집하지 않는다. 단일 통합 담당자만 이 파일을 한 번 수정한다.

## 이번 실제 적용

| 담당 | 독립 브랜치 | 소유 코드 | 독립 검증 |
|---|---|---|---|
| WAIT 관측 | feat/jh168-mobile13-wait-evidence-20261101 | mobile13-wait-condition.mjs 및 test | 6/6 PASS |
| Playwright 제거 | feat/jh168-mobile13-browser-retirement-20261101 | mobile13-browser-retirement.mjs 및 test | 6/6 PASS |
| 통합 담당 | PR #72 | mobile-web-tool-patch.mjs, residual audit, 통합 CI | 통합 CI로 별도 확인 |

### 절대 합치지 말아야 할 단계
- 독립 정책의 오프라인 test PASS는 실제 Android 13개 E2E PASS가 아니다.
- WAIT는 원본 signed STATUS와 동일 컨텍스트/창/접근성 행 증거가 있으면 한 번의 읽기 결과만으로 정확한 화면 문구를 판정한다. 증거 누락/불일치에서는 기존 MOBILE_WAIT_CONDITION_UNVERIFIED로 남기고 한 번 더 자동 폴링하지 않는다.
- 브라우저 제거 감사는 이전 서버 BrowserSession, browserTool/browserRpc/ensureBrowser, ConnectionV2 browserSession.probe를 제거 전 장애물로 관리한다. **완전 대체된 후에만** 삭제한다.
- 원본 승인·SQLite 미확정 결과·기존 Stage27 Chrome CLICK을 삭제/완료처리/재실행하지 않는다.
- 실제 운영 서버 활성화·APK 설치·휴대폰 효과는 해당 별도 승인과 증거를 요구한다.

### 앞으로의 병렬 작업 기준
1. 파일 단위 소유자 지정; 두 작업이 같은 파일을 수정해야 한다면 공통 변경은 통합 담당자에게 귀속
2. 각 브랜치 동일 기준 SHA로 시작하고 서로의 원본 코드를 변경하지 않음
3. 각각 적합한 단위·보안 실패 시험 후 통합 PR에 code-only 병합
4. 수정된 공통 실행부에는 한 번만 충돌을 해결하고 관련 전체 회귀 검증
5. CI 전체 성공 뒤에도 실기기 검증과 실제 운영 배포를 분리
