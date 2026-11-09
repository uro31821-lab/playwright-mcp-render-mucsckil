# 이비서 0.5.3 Windows 서명·업데이트 실행기

이 실행기는 클라우드에서 검증한 unsigned APK를 재사용한다. Windows에서는 기존 JH 인증서로 서명하고 현재 앱을 한 번 업데이트한다. 로컬 Gradle 빌드, 키 생성, 앱 삭제, 데이터 초기화, 자동 재시도는 없다.

## 검증 범위

- RELEASE.json에 앱 식별자, 단일 버전 이름, 원본 인증서, 허용한 현재 앱 버전, APK 해시, 소스와 빌드 증거 해시를 고정한다.
- Start-JH-Ebiseo.ps1의 manifest SHA 핀이 해당 RELEASE.json 바이트를 고정한다. Windows 전달 프로필은 별도 검토와 실제 CI 이후 등록한다.
- APK의 패키지·버전·SDK·비디버그 여부를 확인한 뒤 서명한다. 서명 후 v2/v3 원본 인증서, 정렬, 모든 원본 APK payload 항목의 해시를 대조한다.
- 검증된 기존 서명 APK는 재사용한다. 원본 키는 기존 PC의 알려진 위치만 제한적으로 확인하며 키 파일을 복사하지 않는다.
- 현재 USB 기기는 한 대여야 한다. 기존 앱의 버전과 인증서를 직접 확인하고 base.apk를 읽어 해시를 기록한다.
- 마지막 Y 이후 APK를 쓰기 불가로 열고 해시·USB 기기·기존 앱을 다시 확인한다. 바뀐 상태이면 설치하지 않는다.
- 사용자 로컬 영구 폴더에 CreateNew와 Flush(true)로 시도 기록을 남긴 뒤 adb install -r을 한 번 호출한다. 불명확한 결과에서는 재설치하지 않는다.
- 설치 뒤 현재 APK 해시·인증서·버전까지 일치해야 설치 확인으로 표시한다. 버전만 같으면 MATCH로 표시하지 않는다.
- 기존 RESULT와 signed APK를 덮어쓰지 않는다. 결과 기록 실패는 별도 fallback 위치에 저장을 시도하며 현재 RUN_ID와 결과 해시를 검증한다.

## 검사 실행

Windows PowerShell 5.1에서 tests/Test-EbiseoInstaller.ps1 -KitRoot . 과 tests/Test-EbiseoBootstrap.ps1 -KitRoot . 을 실행한다.

첫 검사는 실제 production PowerShell을 읽고 안전한 경계 함수만 시험 과정에서 교체한다. 가짜 ZIP, 가짜 인증서 응답, 가짜 ADB 응답을 사용한다. 실제 결과 검증 스크립트는 별도 PowerShell 프로세스에서 현재 ID·오래된 ID·보고서 종류·해시 오류를 검사한다.

둘째 검사는 실제 CMD를 실행한다. 시험 복사본의 PowerShell 실행 경로 한 줄만 무해한 C# 프로세스로 바꿔 누락·오래된 결과·불명확한 호출·fallback을 검사한다. 생산 실행기에는 우회·모의 실행 플래그가 없다.

Python tests/check_release_contract.py . 은 실제 APK와 빌드 증거의 해시 및 정확한 버전 일치를 확인한다. 이것은 Windows 실행이나 기기 검사가 아니다.

## 원본에서 수정한 결함

Stage78 원본 ZIP은 Gradle 버전 이름이 fix1-fix1-fix1, 설치기 예상값이 fix1-fix1, 공개 metadata가 fix1이었다. 이번 실행기는 RELEASE.json의 정확한 버전 값을 공통으로 참조하고 원본 문자열을 반복 치환하지 않는다.

Stage78의 원본 인증서 검색은 이미 사용자 PC에서 MATCH였다는 저장소 증거가 있다. 이 환경에는 원본 키가 없으므로 서명·설치를 실행하지 않았다. 실제 Windows 검사, 전달 프로필, 로컬 서명·설치 결과는 각각의 외부 영수증으로 확인한다.
