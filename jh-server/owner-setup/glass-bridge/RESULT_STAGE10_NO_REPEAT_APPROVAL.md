# Stage 10 — 최초 승인 1회 후 사진별 버튼 한 번 (개발 코드 검증)

검증일: 2026-11-10 KST
상태: **서버·Android 개발 소스/CI PASS, 실사용 인증·전송 연결 미완료.**
기존 JH 운영 서버, 플러그인, 설치된 CameraAccess/JH APK 변경 없음.

## 사용자 요구
- 매 사진마다 MediaProjection 화면공유/확인창 승인 반복은 불편함
- 최초 JH 기기 연결 시 사용자가 1회 승인
- 유효한 등록 동안 **사용자 직접 사진 전송 지시 1회**로 처리, 이후 별도 확인창 없음
- 자동 배경촬영·보안 팝업 우회·환자정보 촬영은 금지
- ChatGPT 구독 이외 추가 OpenAI API 과금 금지

## 실제 추가된 코드

1. `approved-device-session.mjs`: 공식 Android KeyStore ECDSA P-256 공개키를 최초 Secure56 등록 승인(서버 검증 콜백)과 연결하는 개발용 장치 등록부.
   - 최초 등록 시 120초 일회용 챌린지와 키 소유 증명 검증
   - 최초 JH Secure56 사용자 승인 콜백을 **실제 운영 코드에 아직 연결하지 않았음**. 테스트는 승인 콜백을 모의
   - 30일 유효기간으로 설계된 등록 초안(정식 운영 전 재승인/갱신 정책 조정 필요)
   - 사진마다 요청 ID·사진 SHA-256·시각·난수에 대해 기기 개인키의 서명 확인(45초 이내), 중복·위조·철회 차단
   - Android 일반 화면공유 권한을 확대·자동 승인하는 구조가 아님

2. `android_cameraaccess/JhGlassDeviceSigner.kt`: AndroidKeyStore 내부에서 P-256 개인키를 생성·서명하고 외부로 내보내지 않는 **새 소스**.
   - P-256 공개키의 SHA-256 및 DER ECDSA 서명 생성
   - 서명 메시지 형식이 서버의 `glassEnrollmentMessage` / `glassPhotoIntentMessage`와 일치하도록 구현
   - Android OS 화면 캡처(MediaProjection) 호출 없음
   - 사진 전송 **사용자 클릭 이벤트**에서만 호출하도록 연결해야 하며 현재는 별도 클래스 (실제 UI 호출 연결 미완료)

3. `android_cameraaccess/apply_cameraaccess_patch.py`: Meta CameraAccess 미리보기 `JH로 보내기` 버튼을 **한 번 누르면 한 사진만 보내는 사용자 명령** 형태로 수정.
   - 종전 Stage 7의 매번 개인정보 확인 `AlertDialog` 삭제
   - 기존 `Share`는 보존
   - `jhTransferEnabled=false` 및 `onJhTransferPhoto=null`이 기본값이라 **현재 전송은 여전히 비활성**
   - 연결이 실제 완료된 경우에도 한 사진의 재전송은 자동으로 수행하지 않음
   - 버튼 옆 환자·개인정보 전송 금지 문구 표시

4. `photo-claim-gate.mjs`: 서명에서 확인된 `photoSha256`가 실제 JH 서버가 수신한 JPEG SHA와 다르면 버리고 채팅에 전달하지 않도록 추가.
5. `approved-device-photo-flow.test.mjs`: 등록 승인 콜백 1회(모의) → 서로 다른 사진 2장에 대해 서명된 사용자 지시 → 각각 일회용 사진 업로드와 채팅별 회수 성공, 바꿔치기·다른 대화 접근·등록 취소 차단 시험.

## GitHub Actions 실제 검증 근거

- 서버 [run 42841542013](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42841542013)
  - 테스트 대상 커밋 `8e3054d7dad0661036f8c762e4f64fd747a0fb0a`
  - `node --test .../*.test.mjs` : **141/141 통과, 실패 0**
  - `NO_PRODUCTION_WIRING_CONFIRMED`
- Android [run 42841253151](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42841253151)
  - 테스트 대상 커밋 `32c1be925995a2e2d1ba8ec36d8b0c590212f57f`
  - 공식 Meta 고정 소스 `f4371bc9f90249d51eb07d7f8a61e8d829294f16`
  - Python 패치 테스트 **7/7 통과**, `./gradlew :app:compileDebugKotlin` : **BUILD SUCCESSFUL in 1m 39s**
- 이 테스트는 **실제 운영 연결이 아니라 모의 최초 승인 / 모의 사진 등록/접수**를 포함합니다.
- GitHub CI 합격 ≠ 삼성 휴대전화 설치 ≠ 실제 JH 서버 사진 수신 ≠ GPT 사진 분석 성공

## 운영 연결 전 필수 차단 조건

1. 현재 JH `/oauth/authorize`는 로그인 사용자 식별 없는 일반 승인 폼이라 사진 소유자 인증 증거가 아닙니다. 앱과 실제 사용자 계정 연결된 **Secure56 최초 1회 휴대전화 승인**의 실물 구현 필요.
2. Android KeyStore 서명자의 공개키와 JH 등록 기록을 안전하게 연결하는 최초 페어링 UI 및 전용 인증 경로 구현 필요. 현재 키 등록부는 메모리에만 존재하여 서버 재시작 후 유지되지 않음 — 운영용 암호화된 지속 저장 필수.
3. 실제 등록된 사진 전송 명령의 서명 증거와 수신 JPEG를 검증하고 차단하는 HTTPS 업로드 및 MCP 이미지 반환 경로 구현 필요. 이미 개발한 코드가 운영 서버에는 미연결.
4. 민감자료/환자정보는 자동 분류 기능이 없으므로 현재 **실제 사진 업로드 기능 출시 금지**. 필요 시 독립된 개인정보 보호 심사와 사용자 동의.
5. 실제 CameraAccess 앱에 Android 서명자/사진 서버 연결 제공자를 연결해 스테이징 빌드·보안검사, 명시적으로 승인된 1회 실기기 E2E를 한 뒤에만 별도 배포 승인.
6. 추가 OpenAI API 과금은 사용하지 않음. ChatGPT의 MCP 이미지 반환 경로가 실제 이용 가능한지 별도 확인 필요.

## 다음 한 단계

기존 JH Android 184/보안 브리지의 **현재 원본 코드**를 확보·확인해 Secure56 최초 기기 등록 승인과 AndroidKeyStore 공개키 바인딩을 실제 Android 통로에 연결하는 후보를 작성. 앱 삭제·서명키 교체·보호기능 해제·운영 배포를 하지 말 것.

## 기존 확정 시험 재사용

Ray-Ban Meta DAT 설치와 안경 카메라 미리보기 실기기 성공, 이미 설치한 Meta CameraAccess 샘플은 재시험하지 말 것.
