# JH Gemini native unified v0.5 — V4 개발 소스

기존 v0.4 기본 웹 실행 경로를 폐기하고 JH 원래 Android/Secure56 호스트를 사용한다. 실행 키·계정·승인·파일 서버를 새로 만들지 않는다.

- `src/index.mjs`: native 기본 진입점. 웹/폰 이중 선택 없음.
- `contract.mjs`: 요청·영상 ID·2048 UTF8 바이트/1200 코드포인트 입력 한도.
- `native-workflow.mjs`: 타입·전송·답변·내보내기·전달 각 동작을 원래 저널/증거로 분리. 자동 재전송·재개 없음.
- `jh-port.mjs`: 원래 호스트의 실행 포트만 사용. 실제 현장 승인 요청/상태/준비/실행을 담당하는 호스트 구현 필요.
- `gemini-ui.mjs`: 현재 확인된 네이티브 노드 후보 읽기. 화면 자료는 명령 권한이 아님.
- `video-artifact.mjs`: 실제 파일 헤더·ffprobe·해시 검증. 영상 내용 적합성은 별도.
- 기존 웹 세션 생성 API는 오류를 반환하여 조용히 구 실행기로 되돌아가지 않는다.

`npm test`는 현재 48개의 명시적 정책/합성/로컬 파일 검사를 실행한다. Android APK 전체 빌드나 실기기 성공을 뜻하지 않는다. 오래된 두 웹 시험 파일은 전환 안내 표식이며 현재 시험 명령에서 제외했다.

원래 호스트의 `claimTask`는 원자적 영속 생성 예약, `saveDispatched`는 기존 실행 저널의 원자적 1회 예약이어야 한다. JSON의 `verified:true`나 일반 저장 콜백으로 대신하지 않는다. `verifyObservation`/`verifyReceipt`는 기존 Secure56가 실제 검증한 영수증만 인정해야 한다.

이 폴더만으로 운영을 배포하지 않는다. 통합 패키지의 `00_먼저읽기.md`, `docs/최신엔진_인계서.md`가 적용 기준이다.
