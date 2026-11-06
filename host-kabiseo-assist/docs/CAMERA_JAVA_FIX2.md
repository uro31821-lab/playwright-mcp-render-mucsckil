# 카비서 v0.22 FIX2 — 에비서/깃비서 공동 PC 시작 복구

## 확인된 사용자 실패와 판단
2026-11-07 KST. 사용자가 보낸 FIX1 RESULT에서 파일 존재=true, 구문 오류 목록 비어 있음, effectivePolicy=Restricted, 모든 policy scope=Undefined, 실제 정상 -File 호출 exit1/UnauthorizedAccess, phoneAccessAttempted=false를 확인했습니다. Windows 클라이언트의 모든 실행 정책이 Undefined일 때 Restricted가 유효 기본값이라는 Microsoft 공식 설명과 부합합니다. 인터넷 출처표시도 있었지만 이것만으로 단독 원인이라고 하지 않습니다.

같은 PowerShell 파일을 재전달하거나 또 진단만 요청하지 않습니다. 정책 해제/Bypass/Unblock-File/인라인 script 평가를 하지 않고, 현재 목적에 맞는 별도 Java 관찰 프로그램을 작성했습니다. 기존 JH 작업용 JDK17 이상 및 ADB만 탐색하며 새 runtime, APK, JAR, 라이브러리나 설치기를 다운로드하지 않습니다. 사용자의 실제 JDK/ADB 위치와 정상 폰 관찰은 아직 확인되지 않았습니다.

## 실제 변경
신규 tools/kabiseo-camera-java/package는 실행.cmd, 사용안내.txt, data/CameraRouteProbe.java입니다. 배포 artifact에는 verification.json이 추가됩니다. 사용자는 한 번 압축해제하고 실행.cmd만 누릅니다. .ps1/.class/.jar/.exe를 배포 ZIP에 넣지 않았습니다. Java source-file mode로 검증된 자체 소스만 실행합니다.

기존 PS 검사기/Android/서버/core/통합부/Node 보류 파일은 byte-preservation CI에서 보존됐습니다. PowerShell 실행은 사용자 payload에 없고, CI만 원래 정책의 차단과 전후 동일성을 확인하기 위해 격리된 테스트 프로세스를 사용했습니다.

실제 ADB 호출은 devices와 고정 인자 dumpsys activity activities/media.camera만 허용합니다. 임의 셸·설치·root/pair/connect·클릭·촬영·설정 변경은 없습니다. 각 프로세스의 출력은 메모리에서 제한하고 시간초과 시 자신이 시작한 프로세스만 중단합니다. 원본 dump/사진/본문/기기일련번호/PID/content URI는 RESULT에 쓰지 않습니다. 알려진 앱 이름 외에는 OTHER_REDACTED로 처리합니다.

현재 foreground와 활성 camera client를 두 번 대조합니다. 외부 앱인 경우 현재 ActivityRecord에서 GPT 호출자와 IMAGE_CAPTURE action도 함께 보여야 위임 관찰로 분류합니다. 과거 CONNECT 이력은 쓰지 않습니다. 둘을 연속 관찰한 것이 원자적 snapshot 또는 앱 제어권/설정 복원 증거는 아닙니다.

## 완료 증거
- 검증 코드 commit: 0a43fbe4479f4bedb2c39cc356676c5e55c0a501
- run: 42249102895 / job: 127999072795 / attempt1 / push / completed success
- Java17 --release17 -encoding UTF-8 -Xlint:all -Werror 컴파일 및 합성 metadata/local-file 검사24개.
- 실제 ZIP을 한글/공백 경로로 압축해제하고 실제 실행.cmd→Java source launch 실행.
- 동일 테스트 프로세스 계열에서 PowerShell Restricted를 유지하고 PS1 파일이 UnauthorizedAccess로 계속 차단되는 것 확인.
- Java 점검기가 실제 실행되어 ADB 미설치 조건의 EXISTING_ADB_NOT_FOUND와 RESULT 생성에 도달.
- 기존 JDK를 숨긴 조건에서는 EXISTING_JDK_NOT_FOUND로 중단하고 이전 결과를 logs에 보존.
- 테스트 전후 시스템/사용자 정책 목록이 동일하고 패키지 파일 해시가 압축해제 후 동일함을 확인.
- 이 검사는 실제 폰 정상 읽기·사용자 PC JDK 탐색·실기기 카메라 제어 성공은 아닙니다.

초기 run42248797898/job127997997535는 Java17 launcher가 Unicode 절대경로 인자를 손상시켜 실패했습니다. 사용자의 폴더를 옮기게 하지 않고 실행.cmd가 이미 지정한 정확한 작업 폴더에서 ASCII 상대경로 인자로 source-file mode를 실행하도록 수정했습니다. 성공 기준이나 정책을 완화하지 않았습니다.

## 산출물
artifact13518359602 / 8732bytes / SHA256 8cda6fd9c60abfbf5c4d0d39065b32b62ef42f3368619a9b2afc9804196c6856
다운로드 이름 kabiseo_fix2.zip, connector file_id file_000000005fa48209937dddf0415333fd.
GitHub 완료 상태와 artifact digest/다운로드 응답을 확인했습니다. 로컬 container/Python의 압축 CRC/hash 재확인은 ClientError로 NOT_RUN입니다. CI의 payload 검증과 별개이며 로컬 재검사 성공이라고 표현하지 않습니다.

## 사용자 다음 한 번
이번 FIX2는 시작오류 진단 전용 FIX1과 달리 실제 촬영경로 관찰용입니다. 기존 JH Windows PC에 이미 승인된 단일 휴대폰 USB연결 → 새 폴더에 전체 압축해제 → 실행.cmd → 안내 시 GPT 사진찍기 화면만 열고 PC Enter → RESULT.txt 첨부. 촬영/확대/앱 재설치는 필요 없습니다. 도구가 없거나 보안 제품이 차단하면 중단하고 결과만 확인합니다.

## 미완료/보존
실제 촬영경로/배율·노출 readback/원상복원은 NOT_RUN. 기존 프로필 provider=null 및 자동조작 OFF 유지. 운영 배포/설정 변경/새 APK/설치/알림 등록0. v0.13 Android 전체 빌드1301시험/lint0오류56경고는 과거 증거로 보존. Node executionAllowed=false 정책을 바꾸거나 target Node를 실행하지 않았습니다.

참고: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1
이 설명은 기본 정책의 의미를 확인하는 출처이며 특정 사용자의 원격 장치 관찰 증거가 아닙니다.
