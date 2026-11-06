# 카비서 v0.14 — 전체 생성 서버의 연결 검증 후보

## 실제 발견한 연결 누락
기존 Stage25 생성 서버의 MCP 도구를 호출하여 원래 trusted challenge/reconnect/process activation, 명령 생성, Secure56 서명/poll/완료 응답을 함께 실행했습니다. 기존 기기 지원 확인은 성공했지만 `kabiseo_camera_metadata`는 durable-native-job-policy에 없어서 poll 단계에서 HTTP409 `DURABLE_OPERATION_NOT_SUPPORTED`로 막혔습니다.

`candidate-durable-native-job-policy.mjs`에는 정확한 tool/효과/대상/요청·명령·작업·기기ID, 고정 read-only payload만 허용하는 25줄을 추가했습니다. unknown 작업·픽셀·제스처·다른 대상·비밀 입력은 허용하지 않습니다. 원래 signer/HTTP verifier/승인/기존 journal 규칙을 바꾸지 않습니다.

## 검토 경계 유지
최초 변경은 보호된 deployment 경로에 있어 기존 PR source-preservation gate가 실패했습니다. 그 검사를 수정하거나 예외를 늘리지 않았습니다. 보호 파일은 원본 blob `39be04401aa360ba6bf87370d291bc6096b5c655`로 복원하고, 추가 정책을 `host-kabiseo-assist/server/`의 후보로만 보관합니다. CI는 원본과 후보 차이가 정확한 추가 블록뿐임을 확인하고 임시 baseline checkout에서만 시험합니다. 이 후보는 운영에 연결되지 않았습니다.

후보 정책 SHA256: `1f0cedab941241f5f2123fa3d429946dfdd478407f21eec697d1774e8a902089`.
전체 생성 runtime SHA256: `12415abc4580fcd0770843f5687f18508368a99e215964af2c7b5cefee7c3b04`.
원본 runtime SHA256: `9c6f59f920abbf4944fb5c5a8da0204b29f15197a83ec209eed330041234f7ce`.
Runtime 단일 해시만으로 종속 정책까지 동일하다고 판단하면 안 됩니다. 실제 운영 통합·release attestation은 별도 미완료 단계입니다.

## 이미 확인한 실행과 실패 기록
- run42154954283/job127686771225: 새 시험 코드의 중괄호 누락으로 실행 전 문법 오류. 수정하고 사전 node --check 추가.
- run42155129597/job127687349480: 완성된 서버에서 지원확인 성공 후 실제 누락된 durable 정책 오류 재현.
- run42155484265/job127688502618: 수정 정책으로 전체 MCP 15개 체크·서명된 시험용 요청 3개 통과. 잘못된 범위45개 거부, 기존 정책153개 조합의 결과 동일.
- run42155491337/job127688524572 등: 보호된 원본 파일 변경을 CI가 차단. 따라서 위 후보 분리와 원본 복원을 수행했습니다. 분리 후 실행 결과는 해당 후속 commit의 CI/PR 기록으로 확인해야 합니다.

테스트 등록자·기기·키·카메라 응답은 합성 fixture입니다. 실제 MCP/HTTP 서버를 실행했지만 실제 소유자 로그인 승인, Android 코드 실행, 물리 휴대폰, 카메라 화면/초점/줌/복원 시험은 아닙니다. 네트워크는 임시 127.0.0.1에서만 사용했고 사용자 인증정보를 사용하지 않았습니다.

## Android와 사용자 영향
이번은 서버 후보/통합시험 변경만으로 v0.13의 실제 전체 앱 빌드·1301시험·lint0오류56경고 기록을 보존합니다. APK 재빌드/서명/설치/서버배포/실제폰명령은 0입니다. v0.13의 feature OFF와 profiles=0도 그대로입니다. 추가 패키지·install hook·Android 권한은 없으며 기존 lockfile과 경고를 그대로 유지합니다.

다음 미완료 경계는 검증된 서버 후보의 운영 attestation 연결과 정확한 카메라 화면 프로필을 확보할 읽기 전용 실기기 후보 준비입니다. 운영 배포·설치·phone-local approval은 별도이며 기능 완료로 간주하지 않습니다. 현재 사용자 수동 조작이나 기존 pinch/reset 재시험은 필요 없습니다.
