# 카비서 v0.22 — 실제 GPT 촬영 경로 확인용 읽기 전용 점검

## 결론
v0.21의 우선순위에 따라 추상 프로필/설정 시험을 더 늘리지 않고, **현재 촬영 화면과 카메라 사용 앱을 확인하는 Windows 점검기**를 만들었습니다. 실제 휴대폰 관찰은 아직 NOT_RUN입니다. 사용자 PC에서 기존 승인된 ADB 연결로 한 번 측정해야 하며, 자동 촬영/배율/노출 제어 또는 카비서 설치본이 아닙니다.

현재 Primary JH `life_status`는 응답했습니다. 그러나 이는 읽기 전용 서버 상태이며 실제 새 화면/카메라 검증이 아닙니다. 현재 도구 목록에 camera 전용 도구가 없고 일반 screen_understand는 RIGHT 작업창에 제한됩니다. GPT 촬영 화면을 일반 오른쪽 snapshot으로 우회하지 않았습니다. BEGIN_COMMAND, 새 승인, 화면 클릭이나 사진조회도 만들지 않았습니다.

## 사용자 전달 파일
- 이름: `KaBiseo-v0.22-CameraRoute-Check.zip`
- artifact: `13514226407`, 7,294 bytes
- GitHub artifact SHA256: `59c3d55a98f809cd8231ea56593c586733eb8cec300be1cbb35565706aff2442`
- 구성: 루트 `실행.cmd`, `사용안내.txt`, `verification.json`, `data/probe.ps1`. 중첩 ZIP 없음.
- 정확한 GitHub artifact 다운로드 커넥터 성공: file ID `file_000000002c148209b5bd78a8f69a841d`. 서명된 임시 다운로드 URL은 기록하지 않습니다.
- 다운로드 후 로컬 Python 검증은 ClientError로 실행되지 않았습니다. Windows CI의 압축해제/파일해시 일치 검증과 원격 업로드 영수증은 확인했으며 로컬 재검증으로 표현하지 않습니다.

## 실제 시험 증거
- 코드 head `0fe96dcd60a9717fc95587e4ce7a193ff4ef2919`
- run `42239804901`, job `127966773989`, attempt1, completed/success
- Windows Server2025/실제 Windows PowerShell5.1에서 파서·개인정보 최소화·오류분류 **20시나리오 PASS**.
- 실제 ZIP을 한글/공백 경로에 압축해제하고 실제 `실행.cmd`를 호출했습니다. ADB가 없는 격리환경에서 exit2/`EXISTING_ADB_NOT_FOUND`와 RESULT.txt 생성을 확인했습니다. 이는 정상 기기 읽기 경로의 성공 증거가 아닙니다.
- 패키징 전후 3개 payload 파일의 SHA256 일치를 확인했습니다. 시험용 내부 ZIP SHA256은 `89a0c785a3edce75532cd850d68ba95079097b468a69cab5f7d2c55f75e0d3f2`. 다운로드 artifact는 같은 payload에 verification.json이 더해져 별도 ZIP 해시입니다.
- 첫 run42238835372는 종료된 CMD에 stdin을 쓰는 시험기 오류, 두 번째 run42239214189는 시험기 CMD 중첩 경로 인용 오류로 실패했습니다. 입력을 EOF로 닫고 실제 한글 작업 폴더에서 고정 `실행.cmd`를 호출해 해결했습니다. 사용자 실행기·보안 정책을 우회하거나 성공 조건을 낮추지 않았습니다.

## 점검 범위와 개인정보
기존 ADB만 찾고 정확히 한 대의 이미 승인된 기기에 한정합니다. 기기 목록, `dumpsys -t 5 activity activities`, `dumpsys -t 5 media.camera`를 읽습니다. 앱 설치·삭제·권한 변경·root/pair/connect·촬영·입력·화면 조작·재시도는 하지 않습니다.

활성 Camera Clients 영역만 사용하고 CONNECT/DISCONNECT 과거 이력은 현재 증거로 인정하지 않습니다. 현재 화면과 카메라 사용 앱을 두 번 대조합니다. 다른 카메라 앱이 보인다는 이유만으로 GPT 위임이라 결론 내리지 않으며, 정확한 ActivityRecord의 GPT 호출자 및 IMAGE_CAPTURE action이 함께 있어야 위임 관찰로 분류합니다.

raw dumps는 메모리에서만 처리합니다. 사진·스크린샷·대화 본문·기기 일련번호·PID·원본 로그·content URI를 결과에 저장하거나 외부 전송하지 않습니다. 허용된 알려진 앱 식별값 외 다른 앱 이름은 OTHER_REDACTED로 출력합니다. 결과요약과 과거 실행별 요약만 PC에 남습니다. 제조사 형식 차이, 복수 클라이언트, 권한 부족, 관찰 중 상태 변화는 UNKNOWN/BLOCKED입니다.

두 번 읽기는 원자적 관찰이 아닙니다. 카메라 소유 앱을 안다고 CameraX/Camera2의 내부 구현, 다른 앱의 제어권, 배율·노출 읽기/변경/복원 가능성이 증명되지 않습니다.

## 근거와 다음 한 단계
공식 Android dumpsys 문서: https://developer.android.com/tools/dumpsys
AOSP CameraService 현재 클라이언트 영역: https://android.googlesource.com/platform/frameworks/av/+/refs/heads/android16-release/services/camera/libcameraservice/CameraService.cpp
공식 Camera Intent 계약: https://developer.android.com/media/camera/camera-intents
이 문서들은 Android 관찰/위임의 의미를 설명할 뿐 현재 GPT가 어느 방식을 쓴다는 근거가 아닙니다.

사용자: 기존 JH Windows PC에 폰 USB연결 → 전체 압축해제 → 실행.cmd → 안내에 따라 GPT 사진찍기 화면만 열고 PC Enter → RESULT.txt 하나 첨부. 기존 확대/원상복귀 수동시험은 반복하지 않습니다. 원래 JH ZIP 재첨부·앱 재설치 불필요. 스크립트/기기 보안이 차단하면 보안을 끄지 않고 결과/오류만 확인합니다.

다음 개발은 실제 결과에 따라 현재 소유 세션과 지원 제어 경로를 판단하는 것입니다. 앱 내부이면 독립 CameraX 코드로 GPT 제어가 가능한 것처럼 표현하지 않습니다. 외부 Intent면 호출·결과 복귀 계약을 별도 검증하며 다른 앱으로 임의 전환하지 않습니다.

## 보존
기존 서버/Android/core/통합부/Node 실행보류 원본보존 CI 통과. 기존 Node REVIEW는 변경하지 않았습니다. 새 Node/REA/JH서버 실행, 운영배포, Android 재빌드/설치, 실제 기기명령, 알림등록 없음. v0.13 전체앱 빌드와 v0.21 모의 설정 복원 결과는 기존 증거로 남깁니다. 현재 동작완료 기능으로 확대하지 않습니다.
