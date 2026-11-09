# 카비서 v0.22 FIX1 — PC 시작 실패의 구체적 원인 수집

2026-11-07 KST. 사용자가 올린 결과에는 `BLOCKED: PowerShell startup failed. No camera observation.` 한 줄만 있습니다. 이 문구는 기존 CMD가 비정상 종료와 RESULT 부재에 붙인 일반 메시지이므로, 실행 정책·파일 누락·구문·저장 오류 중 무엇인지 확정하지 않습니다. 카메라 소유 앱 또는 촬영 경로도 미확인입니다. 원본 사용자 파일 및 PC 환경값은 공개 저장소에 업로드하지 않았습니다.

## 변경 범위
기존 카메라 검사기, 앱, 서버, 보안 정책은 수정하지 않았습니다. 별도 `tools/kabiseo-camera-startup` 진단용 실행기를 만들었습니다. 정상 `powershell.exe -File data/probe.ps1 -LibraryOnly` 로딩만 확인하며 Main/ADB/촬영/설정 변경은 수행하지 않습니다. 기존 스크립트를 읽어 실행 문자열로 바꾸거나 dot-source하는 우회는 없습니다.

고정된 명령줄 진단은 PowerShell 버전/언어모드/정책이름, 파일 존재·해시, 인터넷 출처표시 여부, 구문오류 식별자, 실제 자식 종료코드 및 허용된 오류 식별자만 기록합니다. 원본 오류 메시지·경로·사용자명·다운로드 원본 URL·기기정보는 RESULT에 내보내지 않습니다. 기존 RESULT는 로컬 logs에 보존합니다. 정책 차단은 그대로 BLOCKED이며 설정·다운로드 표시·서명·관리자 권한을 변경하지 않습니다.

PowerShell7 → CMD → Windows PowerShell5.1로 시험할 때 상속된 모듈 경로 때문에 `CouldNotAutoloadMatchingModule`이 재현됐습니다. 진단 프로세스의 SETLOCAL 범위에서 Windows 기본 모듈 경로만 선택하도록 수정했습니다. 사용자/시스템 환경변수 저장, 레지스트리/프로필 수정, 보안정책 변경은 없습니다. 이것은 CI에서 재현한 문제이며 사용자의 최초 원인으로 단정하지 않습니다.

## 실제 검증
- 검증 commit: `e7ed0900cd0d0ea93cc8614d1d6901989d50fc77`
- GitHub run `42243948553`, job `127981144264`, attempt1: completed/success.
- 실제 압축해제한 한글/공백 경로의 실행.cmd 및 Windows PowerShell5.1로 5조건: 정상 LibraryOnly, 파일누락, 구문오류, Restricted, 인터넷출처 표시+RemoteSigned를 검사했습니다.
- 제한 조건에서 자식 exit1/UnauthorizedAccess 및 BLOCKED 상태를 확인했고, 전후 정책 동일성을 확인했습니다. 차단을 실행 성공으로 바꾸지 않았습니다.
- 사용자 PC 원인은 여전히 미확정. 이 성공은 진단기 시험이며 카메라 검사나 원래 오류 해결 완료가 아닙니다.
- 기존 probe/서버/Android/Node 실행보류 소스 보존 비교 통과. 새 외부 바이너리·라이브러리 도입 없음.

초기 두 실행은 모듈 경로 문제로 실패했고 두 번째에서 오류 식별자를 확보했습니다. 수정 후 세 번째 실행은 Windows가 PSSecurityException 표시 없이 UnauthorizedAccess만 내보내는 조건에서 잘못된 표시문자 기대 때문에 실패했습니다. 실제 오류ID+종료코드+정책+BLOCKED 상태를 검사하도록 시험을 바로잡았으며, 스크립트 차단은 계속 유지됐습니다.

## 전달 artifact
- 파일명: `KaBiseo-v0.22-FIX1-PC-Startup-Check.zip`
- artifact ID: `13516478605`, 10002 bytes
- GitHub digest: `a522cd44892ff34bca5d0110bde5f2e240b86c6bbfb000b64ec7782e6780448f`
- 대화 파일 ID: `file_00000000ff2882098f0400d88f0611d6`
- 루트에 실행.cmd가 직접 노출되며 중첩 ZIP 없음. 원본 probe는 LibraryOnly 용도로 포함. verification.json/payload-hashes.json 포함.
- GitHub 성공 로그와 artifact 영수증 및 다운로드 성공을 확인했습니다. 다운로드 후 로컬 Python 해시/CRC 검사는 ClientError로 NOT_RUN이며 로컬 검증으로 주장하지 않습니다.

## 다음 사용자 행동
휴대폰/USB/GPT 카메라 준비 없이, 새 ZIP 전체 압축해제 → 실행.cmd 더블클릭 → 생성된 RESULT.txt만 첨부. 기존 카메라 시험을 반복하거나 앱을 설치하지 않습니다. 정상 로딩 결과도 카메라 제어 가능성을 증명하지 않습니다. 실행 자체가 보안 제품에서 차단되면 강제 허용을 요구하지 않습니다.

## 참고한 공식 문서
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath?view=powershell-7.3
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1

보안 알림/예약은 만들지 않았고 기존 Node 보류도 변경하지 않았습니다. 이전 v0.13 Android 빌드 및 v0.21 모의 설정복원 기록은 이전 증거로 유지합니다.
