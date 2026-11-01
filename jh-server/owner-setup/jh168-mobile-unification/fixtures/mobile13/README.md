# 모바일 13개 명령 검증용 중립 화면

이 화면은 검증할 UI를 제공한다. MCP 실행기, 승인 발급기, Android 증거 생성기가 아니다. 실제 기기 판정의 초기값은 모두 **NOT_RUN**이다.

## 구성

- `index.html`, `fixture.css`, `fixture.js`: 입력·선택·지연 표시·내부/중첩/가로 스크롤·팝업·포커스 관찰.
- `destination.html`: 같은 탭 이동·새 탭·페이지 뒤로를 구분하는 별도 목적지.
- `cases.json`: 기존 WEB01–09 / ENTRY01–04에 맞춘 시나리오·기대 증거·현재 기능 제약.
- `smoke.cjs`: loopback의 임시 HTTP 서버와 독립 headless Chromium에서 페이지 자체의 동작을 확인한다. 검사 완료 후 서버와 브라우저를 닫는다.

페이지는 외부 API, 계정, 쿠키, 저장소, 서비스 워커를 사용하지 않는다. 폼은 실제 전송을 하지 않으며 입력값을 이벤트 기록에 남기지 않는다. 이벤트 목록과 카운터는 페이지 메모리에만 있고 새로고침하면 초기화된다. 테스트에는 `JH TEST` 같은 비민감 문자열만 쓴다.

## 로컬 화면 검사

저장소의 기존 개발용 Playwright/Chromium을 사용할 수 있는 환경에서 실행한다. 이 도구는 **새 테스트 화면의 로컬 검사**에만 사용하며 JH 운영 웹 실행 경로나 휴대폰 조작을 추가하지 않는다.

```bash
node jh-server/owner-setup/jh168-mobile-unification/fixtures/mobile13/smoke.cjs
```

Playwright 모듈이 공용 개발 환경에 이미 있으면 Node의 정상 `NODE_PATH` 설정을 재사용한다. 브라우저 바이너리가 기존 별도 경로에 있으면 Playwright의 `PLAYWRIGHT_BROWSERS_PATH`를 사용한다. 모듈이나 브라우저가 없으면 검사는 실패하며 성공으로 건너뛰지 않는다. 검사 결과는 `DESKTOP_FIXTURE_ONLY`이고 **PHONE_E2E는 NOT_RUN**이다.

화면을 수동으로 보려면 이 디렉터리에서 loopback으로만 제공할 수 있다.

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

이 주소는 개발 머신의 로컬 주소다. 휴대폰에서 접근할 수 있는 게시 주소가 아니며, 이 준비만으로 실제 기기 검증 환경이 만들어지지 않는다.

## 실제 13개 검증에 연결할 때

1. [기존 실기기 사전검사](../../JH168-MOBILE-REAL-DEVICE-PRECHECK.md)에 따라 실제 호출 후보 SHA·도구 등록·Secure56 기기 연결을 먼저 확인한다. 기존 운영 Playwright alias를 호출해 모바일 후보 통과로 기록하지 않는다.
2. 승인된 중립 HTTPS 호스트에 **페이지 자산 4개만** 제공하고 실제 주소를 검증 기록에 남긴다. 기존 origin에서 제공할 수 있는 후보 HTTP 구현은 아래에 정리했다. 소스 준비는 HTTPS 게시나 운영 배포를 수행하지 않는다. `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`와 `Cache-Control: no-store`를 유지한다.
3. [한 세션 검증표](../../JH168-MOBILE-13-ONE-SESSION-VERIFY-MATRIX.md)와 `cases.json`에서 해당 행의 원 command/request/job/receipt·창·로컬 승인·실제 표시 결과를 확인한다. DOM ID는 Android의 `item_...`를 대신하지 않는다. 페이지 이벤트도 서명된 완료 영수증이 아니다.
4. 불확실한 실행 결과는 같은 원 작업의 결과를 조회한다. 새 request_id를 만들어 다시 클릭하지 않는다. 완료한 Stage27 Chrome 메뉴 동작도 반복하지 않는다.
5. `life_web_press_key`의 미지원 키, `life_web_wait`의 미확인 조건, 입력의 `submit=true` 제한은 기존 CODE_GAP으로 유지한다. 페이지가 해당 UI를 제공한다는 이유로 도구 지원을 통과시키지 않는다.

`ENTRY03 life_naver_mail`의 실제 서비스 열기와 `ENTRY04`의 원래 native 화면 복귀는 이 중립 페이지로 대체할 수 없다. 해당 범위를 별도 증거로 확인해야 한다. 화면 캡처는 기존 휴대폰 로컬 동의와 정확한 RIGHT 창의 one-shot 결과를 사용하며 공개 문서에 토큰·픽셀을 기록하지 않는다.

## 검증 범위

현재 후보 문맥은 PR72 `9baec5776b23e286f34014b090b7ad0c799a85ec`다. 이 후보의 `JH_MOBILE_WEB_13_MODE`가 비어 있으면 원래 등록을 보존한다. 모바일 검증에는 원본 gate가 인정하는 `EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1` 모드와 실제 모바일 도구 등록을 함께 확인해야 한다. 이 문서는 모드를 켜거나 실행 권한을 만들지 않는다. 변경된 실행 후보에서는 그 SHA를 별도로 기록하고 이 준비 파일의 기준과 구분한다. 기존 APK 식별자는 과거 설치 근거이며 현재 설치·연결 확인을 대신하지 않는다.

페이지 자산 준비, 데스크톱 동작 검사, HTTPS 게시, 모바일 후보 환경 연결, 13개 실제 기기 검증은 각각 별도 상태다. 마지막 단계까지 완료됐을 때만 실기기 PASS 수를 올린다.

## 기존 origin의 검증 모드 전용 HTTP 제공 후보

`cce1c049` 이후의 준비 변경은 [mobile13-fixture-http.mjs](../../mobile13-fixture-http.mjs)를 기존 모바일 선택기에 연결한다. 유효한 `PHONE_RIGHT` 모드에서만 생성 시 고정 4파일의 검토된 SHA-256을 확인하고 바이트를 런타임에 포함한다. 요청을 파일 경로로 바꾸거나 요청마다 파일을 읽지 않는다. `ORIGINAL`은 자산을 읽지 않고 원래 소스를 반환한다.

허용 경로는 `/__jh_mobile13_fixture/v1/` 아래의 `index.html`, `destination.html`, `fixture.css`, `fixture.js` 네 개다. `GET`과 `HEAD`만 허용하고, 해당 경로의 다른 메서드는 405, 미등록 파일은 404로 거절한다. 인코딩·경로 순회·역슬래시를 파일 주소로 해석하지 않는다. 목적지 링크의 쿼리는 파일 선택과 응답 바이트에 반영하지 않는다. README·시나리오·검사 스크립트는 제공하지 않는다.

**계획 URL:** `https://jh-secure-bridge-fix4.onrender.com/__jh_mobile13_fixture/v1/index.html`. 아직 운영 적용·접근 확인을 하지 않았으므로 `cases.json`의 `hostedHttpsUrl`은 `null`을 유지한다. 로컬 생성 런타임 해시는 운영에서 실제 선택된 런타임의 증거를 대신하지 않는다.

정확한 후보, 활성화 조건, 원복, 현재 배포 도구의 범위는 [운영 활성화 검토](../../JH168-MOBILE-VERIFICATION-ACTIVATION.md)를 따른다. [HTTP 단위 검사](../../mobile13-fixture-http.test.mjs)와 [실제 생성 Stage25의 두 모드 HTTP 검사](../../mobile13-fixture-stage25.test.mjs)는 이 추가 경로만 검증하며 휴대폰 E2E로 집계하지 않는다.
