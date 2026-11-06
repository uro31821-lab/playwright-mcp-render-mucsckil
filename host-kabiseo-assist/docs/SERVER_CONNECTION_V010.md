# 카비서 v0.10 — 서버 읽기 요청 생산자 검토 후보

로컬 container/Python이 계속 ClientError이므로 v0.9 전체 Gradle 앱 빌드는 재실행하지 못했다. 이 단계는 그 성공을 대신 주장하지 않는다.

## 실제 연결 방식
`server/source-patch.mjs`는 기존 서버 생성기가 인증·승인·명령 바인딩을 구성한 **뒤의 검토용 출력**에 전용 MCP tool을 추가한다. 원래 `registerOAuthTool` / `jhRequireCommand56` / `exactEnvelope56` / `mk` / Secure56 signer / `waitJob` / 검증된 jobs 저장소를 사용한다. 새로운 HMAC, OAuth, 카메라 executor는 만들지 않는다. 기존 운영 startup·attestation 파일은 변경하지 않고 역변환 일치 및 기존 attestation 유효성을 검사한다.

`STATUS`는 서버 상태만 반환한다. `READ`는 현재 server-runtime digest와 request_id·task_digest가 있어야 한다. 불확실한 요청을 새 요청으로 재실행하지 않으며 `RESULT`는 원래 job만 조회한다. 서버 재시작 전 digest는 거부한다. 응답은 허용된 고정 상태/boolean으로만 구성하고 원문·사진·오류 문자열은 내보내지 않는다.

## 실행 제한과 미완료
- 실제 운영 entry에서는 이 patch를 호출하지 않는다. 환경 flag는 기본 OFF.
- 현재 휴대폰이 광고하지 않는 `kabiseoCameraMetadataVersion=1` 확인도 필수로 넣었다. 이 필드를 untrusted 요청 JSON으로 채우면 안 된다. 향후 기존 인증된 capability 등록 경로에 연결해야 한다.
- 화면 조회 성공도 현재 프레임·확대·원상복원 성공이 아니다. 모든 응답에서 automaticZoomEnabled/restoreVerified=false.
- 서버 내 중복 방지는 해당 runtime identity/프로세스 범위이다. 기존 signed completion의 신뢰성을 host adapter가 유지해야 하며 테스트의 모의 job은 실제 휴대폰 서명 증거가 아니다.
- 운영 attestation 통합·실제 capability 협상·전체 Android APK·기기 적용은 남아 있다.

## 검증 계획
새 Node 테스트는 mock transport 사용을 명시한다. CI는 현재 기준 commit `0663e0c3b434f300803e5cf272609032a5e519d3`에서 기존 runtime generator를 실행하고, 새 후보에 대한 syntax/reversibility/기존 attestation 유지 검사를 한다. 결과는 실행 로그 확인 뒤 기록한다. 이 문서 작성만으로 PASS를 부여하지 않는다.

사용자가 할 일: 없음. 설치본이나 카메라를 반복 조작하지 않는다.
