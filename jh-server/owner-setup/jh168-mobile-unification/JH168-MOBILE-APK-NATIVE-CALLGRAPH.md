# JH168 Android 모바일 엔진 — 실제 설치 APK DEX 호출 경로 정적 감사

**기준:** 2026-11-01. **범위:** Playwright→Android 모바일 전환 9개 웹 명령 + 4개 진입 경로. 이번에는 *수정 없이 전체 실행부 연결 증거 수집*.

## 분석 원본·방법
- 서명 APK 원본 SHA-256: `129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359` (이전 Stage27 설치 검사 `STATUS: NEW_PASS`의 대상과 일치).
- 패키지: `com.koreanlifehub.bridge`, versionCode 168, targetSdk 35. AndroidManifest: `BridgeService` AccessibilityService 및 `android.permission.BIND_ACCESSIBILITY_SERVICE` 선언 확인.
- APK 안 `classes.dex`, `classes2.dex` 각각 Android SDK 35 `dexdump -c` 체크섬 검사 **0 반환 코드/통과**. 두 DEX를 `dexdump -d -n`으로 정적으로 분석해 `invoke-*` 직접 호출과 `new-instance` 출현을 집계.
- 네트워크, 휴대폰 명령, APK 재설치, 비밀번호/서명키 접근, 원본 서버 수정 **0**.

## 실제 호출 관계 (소스 이름 존재 여부보다 엄격한 검사)

| 경로·기능 | 양쪽 DEX에서 확인된 직접 호출 | 판정 |
|---|---:|---|
| `BridgeService → AndroidComputerUseTransport.execute` | 1 | **컴파일된 진입 호출 존재** |
| `AndroidComputerUseTransport → AndroidComputerUseRuntime.executePrepared` | 1 (Runtime 내부 재호출 1 별도) | **컴파일된 연결 존재** |
| `BridgeService → AndroidAgent.executeRightPane` | 1 (ComputerUseRuntime 측 1 별도) | **컴파일된 연결 존재** |
| `AndroidAgent → JH168InputFocusPolicy.select` | 1 | **포커스 정책 직접 사용 확인** |
| `GuidedForms → JH168RightVerticalScrollRuntime.scrollInternal` | 1 | **중첩 수직 스크롤 호출 존재** |
| `GuidedForms → JH168RightHorizontalScrollRuntime.scrollInternal` | 1 | **수평 스크롤 호출 존재** |
| `JH168ExistingNativeExecutorPort12 → JH168RightNativeExecutor.imeEnterOnce` | 1 | **전용 IME 포트 연결 존재** |
| 외부 클래스 → `JH168OriginalSecure56NativeDispatch12.executeOriginalJobOnce` | **0** | **전용 원본 실행 디스패처의 직접 진입 증거 없음** |
| `new-instance JH168OriginalSecure56NativeDispatch12` | **0** | **DEX 정적 직접 생성자 호출 증거 없음** |

`JH168NativeAction12` enum은 **`IME_ENTER`, `RIGHT_WINDOW_CAPTURE`, `UNSUPPORTED`** 세 값으로 확인. 전용 인터페이스 `JH168NativeEffectPort12`는 이 두 동작만 정의하며, 일반 `CLICK`·`SCROLL`·`SET_TEXT`는 별도의 기존 Android Computer Use/Agent 실행부가 담당할 수 있다. **한 클래스에서 전부 동작한다거나 새 디스패처가 이미 운영 연결됐다고 주장하면 안 됨.**

## 구체적 해석

- **확정:** APK 안 기존 `BridgeService`/Computer Use/Android Agent와 포커스·GuidedForms 수직·수평 스크롤의 **직접 바이트코드 호출**은 확인됨.
- **확정:** 새 `OriginalSecure56NativeDispatch12.executeOriginalJobOnce`의 **다른 클래스 직접 호출 및 직접 생성은 없음**. 따라서 소스에 타입이 들어 있다는 이유만으로 이 디스패처의 실기기 실제 실행을 증명할 수 없음.
- **미확인:** DI/리플렉션 등의 간접 경로가 있는지, BridgeService가 원래 `FOLLOW_UP`에서 해당 새 디스패처를 이용하도록 연결됐는지, 실제 오른쪽 Chrome과 왼쪽 ChatGPT 분할화면을 보존한 채 동일 장치/세션/승인으로 각 웹 alias가 실행되는지.
- **구조상 확인 필요:** `GuidedForms`의 중첩 스크롤과 `AndroidComputerUseRuntime`의 일반 스크롤이 별개로 운용되는 지점이 있으므로, 상위 웹 명령이 내부 스크롤 대상과 현재 창/입력 포커스를 바꾸는 단계에 동일 작업 ID·정확한 컨테이너·실행 결과를 보존하는지 하나의 시나리오로 검증해야 함.

## 교체 대상별 영향

- WEB01–03(OPEN/START/CLICK), WEB04(TYPE), WEB05(SELECT), WEB06(KEY), WEB07(WAIT), WEB08(BACK), WEB09(SCREENSHOT) 및 ENTRY01–04의 **생성 Secure56 서버 소스 시험은 13/13 PASS**. 기존 서버 Native 접근성 실행의 정적 호출 존재는 위 표와 같음.
- **실제 교체된 13개 명령의 폰 E2E = 0/13**, 현재 JH 운영 카탈로그의 9개 웹 명령은 별도 서버 Playwright로 안내됨. 이 APK 분석으로 호환성/완료 결과를 가정하거나 실기기 시험을 대체할 수 없음.
- **기존 27단계 Chrome 메뉴 CLICK은 이미 성공한 독립 동작**이며 해당 명령을 다시 시도하지 않음.

## 별도 메타데이터 주의
APK 내 `assets/jh-release.json`은 후보 시점의 `installed:false`, `phoneVerified:false`가 기재돼 있으나, 이후 별도 설치 보고 `STATUS: NEW_PASS`는 실제 서명 앱 업데이트 설치를 확인함. 내부 자산값은 업데이트 후 실기기 현재 상태를 반영하지 않는 과거 메타데이터이므로 이를 설치 실패나 기능 실패로 오해하지 않는다.

## 사용자 확정 순서 — 지금 수정하지 않는다
1. 13개 전체 **소스 및 진입 함수 계약 검사 완료**를 증거로 고정 (기존 PR #72, GitHub CI).
2. APK 네이티브 호출 지도에서 확인된 **G12–G14 신규 결함 후보**를 기존 하나의 장부에 추가 (본 보고서).
3. 실제 교체 서버가 미배포여서 13개 폰 E2E는 BLOCKED/NOT_RUN. 미확정 13개 모두를 한 번의 검증 계획으로 묶되 **원래 Stage27 앱·승인·보존 작업과 격리**.
4. **13개 조사 완료 및 명시적 승인 후에만** G01–G14를 공통 원인으로 묶어 단일 소스/네이티브 패치→CI→한 세션의 실기기 재검증. 일시적인 오류마다 서버/APP을 다시 배포하는 일 금지.

**한계:** DEX의 정적 `invoke-*`·`new-instance` 카운트는 간접 호출/리플렉션·실제 기기 상태를 검증하지 못한다. 이 보고서는 일부 컴파일된 코드의 연결 흔적을 기록한 것이지 13개 작업 성공 증거가 아니다.
