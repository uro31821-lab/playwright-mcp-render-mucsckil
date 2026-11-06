# 카비서 v0.15 — 구성 묶음·실행 전 무결성 검사 통과

## 이번 실제 결과

2026-11-06, 검증 코드 `7a0ae7c95975fa674aaac175080e4e8e86921be7`.
PR 시험 checkout은 `22e6b24de3aa8c2553ff15ebcb0e35f183fc6664`이며 운영 병합이 아니다.
고정 원본 `845c5dfd9925a9f40950f3a873b4e58bfada9990`.

GitHub Actions run **42159837580**, job **127702641638**, attempt1 **completed/success**.
검증된 구성 loader를 실제 사용한 전체 MCP/HTTP 왕복 **17개 항목 통과**.
변조·누락·잘못된 환경과 정상 복구를 포함한 구성 검사 **22개 항목 통과**.
원본 trusted challenge/reconnect/process activation/signed poll/complete 경로에서 서로 다른 시험 요청 **3개**를 처리했다.
기기·가입 승인자·키·카메라 응답은 synthetic이며 실제 Android 실행이나 휴대폰 카메라 시험이 아니다.

검사 대상은 전체 **5,010파일**, 그 안의 설치된 의존성 파일 **4,465개**다. 숫자는 중첩 관계이며 합산하지 않는다.
원본 입력은 시험 전후 동일했고, 보호된 저장소의 정책·인증·기본 시작 경로는 수정하지 않았다.
Node v22.23.4/Ubuntu24.04.5에서 실행했다. 같은 환경/소스의 과거 Android 전체 앱 빌드를 반복하지 않았다.

## 구현한 구성 경로

- `buildKabiseoReviewAssembly`: 공개 jh-server와 이미 잠금 파일대로 설치된 의존성을 새 사본에 복사하고 원본 보존을 확인한다. **생성은 별도 자식 프로세스**에서 수행한 뒤 종료한다. 이 함수는 npm이나 listener/등록/폰 명령을 실행하지 않는다.
- `verifyKabiseoReviewAssembly`: 호출자가 전달한 기대 manifest SHA256과 전체 파일 명세를 대조한다. 서버 entry뿐 아니라 정책, trusted registry, 실제 node_modules, lockfiles, 생성된 원본 runtime과 원래 검증 기록도 포함한다. `.bin` CLI 링크는 복사하지 않으며 다른 symlink는 거부한다.
- `loadKabiseoReviewAssembly`: 생성 프로세스의 모듈 캐시를 물려받지 않는 실행 프로세스에서 명세를 다시 확인한 뒤 runtime을 import한다. CI/test/defer 환경만 허용하며 listener는 닫히고 카비서는 기본 OFF다. 운영/주입 환경변수와 같은 프로세스의 두 번째 load를 거부한다.

기존 공통 workflow 식별자는 유지한다. 카비서 binding의 runtimeDigest만 원본 runtime, 카비서 템플릿, 정확한 정책, 전체 종속 파일 명세, Node 버전으로 만든 assemblyId에 연결한다. runtime 해시 하나만으로 별도 정책도 검증됐다고 간주하지 않는다. 이 실행의 명세를 검증한 것이며 서로 다른 생성 경로·시각 간 byte reproducibility를 주장하지 않는다.

## 발견하고 수정한 문제

1. run42159103220: 전체 runtime에는 같은 workflow digest 표현이 여러 곳에 있어 넓은 문자열 치환 검사가 중단됐다. 카비서 추가 블록 내부의 단일 binding만 교체하도록 좁혔다. 함께 CI runner를 기존 검증 Node22.23.4로 고정했다.
2. run42159344188: 파일 명세 검사는 통과했지만, 생성기가 이미 불러온 원본 정책이 같은 프로세스의 모듈 캐시에 남아 metadata poll에서 HTTP409 `DURABLE_OPERATION_NOT_SUPPORTED`가 재현됐다. 검사 기준이나 허용 정책을 풀지 않고 생성/실행 프로세스를 분리했다.
3. 최종 run42159837580: `KABISEO_BUILD_PROCESS_SEPARATION_PASS` 및 전체 왕복17/구성22 통과. 잘못된 완료 MAC401, 다른 구성ID 무전송 거부, capability 전 metadata 거부, 중복READ/RESULT 무재실행, 프로필 부재 거부, OFF시 과거결과 차단을 확인했다.

기존 공통 검사7개도 동일 코드 head에서 success를 확인했다. 전체 PR의 모든검사·출시승인을 선언하지 않는다.

## 보관 증거

`REVIEW_ASSEMBLY_V015_RESULT.json`에 job 로그에서 확인한 수치·검증 식별자·실패 이력을 기록했다.
원격 artifact **13476695693**, JSON2개, 1901bytes, ZIP SHA256 `de87487160b49e20525639474ab91507d9354127700cdeb4f9d1b4e92cfec648`.
이는 원격 업로드 결과이며 로컬 다운로드 후 검사는 하지 않았다. 이번 로컬 container/Python은 ClientError였고 실제 검증은 GitHub CI에서 수행했다.
전체 복사본·의존성·키·APK는 artifact로 공개하지 않았으며 시험용 복사본은 종료 시 삭제했다.

## 출시 경계

이것은 **검토용 해시 무결성 명세**다. 운영자의 암호학적 서명·출시 승인서 또는 보안 SAFE 판정이 아니다. 운영 시작 경로는 아직 연결하지 않았다. 운영에서는 승인된 immutable 배포, 신뢰할 수 있는 기대 digest/서명 전달과 실제 설정 조합 검토가 필요하다. privileged writer가 검사 직후 파일을 바꾸는 TOCTOU 위험을 제거한 sandbox라고 주장하지 않는다. OS/Node native binary 공급망 검사나 AV/기존 의존성 경고 해결도 대신하지 않는다.

다음 미완료는 **승인된 운영 시작부에 이 구성 검증을 연결하는 작업**이다. 출시 보안 검토, 원본 인증서 서명·승인된 업데이트 설치, 현재 GPT 카메라 화면 프로필과 실기기 읽기 왕복은 별도 경계다. 자동 확대·종료감지·원상복원도 미검증이다.
GPT 기존 촬영 흐름 유지, 별도 카메라/Chrome전환 없음, 얼굴·몸매보정 제외.
운영병합0 / 운영배포0 / 물리폰명령0 / 설치0 / 사진읽기0 / 설정변경0.
