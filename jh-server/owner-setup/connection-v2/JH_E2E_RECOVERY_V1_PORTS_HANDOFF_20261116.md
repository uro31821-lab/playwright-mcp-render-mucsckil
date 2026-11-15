# JH 통합 자동진단·복구 V1 — JH 운영 소스 연결 체크포인트 (2026-11-16)

## 정확한 기준
- Render 운영 서비스: jh-secure-bridge-fix4 / srv-db0fjl2d0e5s73be114g
- 실제 LIVE 배포 커밋: fd9ea7fb01e58d02a0e023cb25f55aab35954b10 (2026-11-11)
- 운영 브랜치: jh-fix3-secure-server; Render 자동 배포: OFF
- Android JH213: 설치본 그대로 유지. 재설치·서명 변경 금지.
- 기준 사용자가 전달한 ZIP: JH_END_TO_END_AUTO_RECOVERY_V1_SOURCE_ONLY(1).zip
- ZIP manifest 23/23 SHA256 PASS, 원본 Node 검사 47/47 PASS. Android 정책 37건은 전달된 기존 PASS 기록이며 이 PR에서 Android 빌드하지 않음.

## 확인한 기존 복구 체계
- owner-setup/connection-v2/jh-self-diagnostic.mjs: server/mcp/browser/bridge/security 5단계 읽기 전용 진단
- owner-setup/connection-v2/jh-auto-recovery.mjs: 승인된 브라우저 transport soft reconnect만 (독점 유지보수 lease·idle 증거 필요)
- owner-setup/deployment/jh-recovery-write-fence.mjs: 연결 복구 후 예전 작업 재실행 금지
- 이번 V1은 이를 덮어쓰지 않으며, Android 접근성 ON과 실제 Service bound의 구별, Secure56 서명 증거, 원래 job_id의 결과 영수증을 덧붙이는 별도 관찰 후보임.

## 이 PR에 추가한 첫 번째 실제 연결 파일
- connection-v2/jh-e2e-v1-ports.mjs: 기존 JH host에서 주입받은 읽기 전용 함수의 결과를 V1의 readout 형식으로 정규화.
- connection-v2/jh-e2e-v1-ports.test.mjs: OAuth, 독립 감시자, 서명된 휴대폰 상태, 기존 job 영수증의 출처·시각·기기 일치 검증 10건.
- 서버 내부 단독 상태로 외부 ChatGPT OAuth 성공을 주장하지 않음.
- Android 설정 ON만으로 바인딩 PASS를 만들지 않음. 기존 Secure56 검증을 통과한 host callback만 허용.
- securePollFresh는 signed poll 직접 결합 전까지 항상 false.
- 원래 job_id와 원래 command_id를 모두 받아야 영수증 조회.
- 새로운 공개 URL, 토큰 저장, 서버 재시작, Android 동작, 작업 재실행, 자동 알림 없음.

## 운영 연결을 완료하기 전 반드시 남은 일
1. 실제 런타임의 life_status와 life_android_devices authenticated read-only internal ports 확인·주입.
2. 외부 OAuth 호출 결과는 호출 host가 제공. 서버 자체 성공을 MCP OAuth 근거로 오인 금지.
3. Android JH213의 signed accessibilityServiceBound readout 구현 및 기존 Secure56 검증과 결합; 앱 설치본 변경하지 않음.
4. 원래 job_id+command_id의 immutable 영수증 조회 연결. BEGIN_COMMAND 재발급, 재실행·중복발송 금지.
5. 서버가 중지되어도 동작하는 외부 watchdog 설치/허가. 서버 재시작 기본 OFF.
6. 기존 JH UI 안내 영역과 1단계 사용자 조치 연동; 기존 JH recovery v2 browser lease/guard 보존.
7. 현재 배포 소스에 원본 V1 엔진을 실제 포함·연결한 뒤 전체 CI/보안/실기기 E2E 검증.
8. 운영자 확인 없이 PR merge, Render deploy, 휴대폰 APK 재설치 금지.

## 상태
SOURCE_ONLY_PORT_BRIDGE / TESTED_LOCALLY / NOT_MERGED / NOT_DEPLOYED / PHONE_NOT_MODIFIED
