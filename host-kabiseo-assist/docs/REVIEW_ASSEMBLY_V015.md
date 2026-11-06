# 카비서 v0.15 — 검토용 서버 구성 묶음과 실행 전 무결성 확인

## 범위

v0.14에서 시험한 전체 MCP runtime과 정확한 READ_ONLY durable 정책을 별도 사본에 함께 구성한다. 보호된 운영 경로, 기본 npm start, Secure56 signer/HMAC/nonce/승인 코드, Android 소스와 APK는 변경하지 않는다. 이 파일을 작성하는 시점의 새 시험 결과는 PENDING이며 실제 CI 결과로 별도 기록한다.

- buildKabiseoReviewAssembly: 기존 공개 jh-server 소스와 이미 설치된 잠금 의존성을 새 사본에 복사한다. 원본 변경이 없는지 다시 검사한다. npm 실행이나 서버/휴대폰 연결은 하지 않는다.
- verifyKabiseoReviewAssembly: 독립적으로 전달받은 manifest SHA256과 전체 파일 명세를 확인한다. entry뿐 아니라 정책, trusted registry, 실제 설치된 node_modules, lockfiles, 생성된 기본 runtime과 원래 검증 기록도 대상이다. .bin 실행 링크는 구성에서 제외하며 런타임에 필요하지 않다. 다른 symlink는 거부한다.
- loadKabiseoReviewAssembly: 지정된 CI/test/defer 환경에서만 동작한다. 검증을 통과하기 전 runtime을 import하지 않는다. listener는 닫힌 상태이고 카비서는 기본 OFF다. 운영 환경변수, Node 주입 변수 및 재호출은 거부한다.

## 카비서의 구성 식별자

기존 일반 workflow 식별자는 수정하지 않는다. 카비서 binding의 runtimeDigest만 원본 runtime, 카비서 템플릿, 정확한 정책, 전체 종속 파일 명세, Node 버전에서 만든 assemblyId에 묶는다. 전체 runtime 해시 하나만으로 종속 정책도 검증됐다고 간주하지 않는다. 파일 명세는 생성물과 입력을 분리해 순환 해시를 피한다.

## 시험

별도 assembled-mcp.integration.mjs가 실제 검증 loader로 runtime을 올린다. 원래 v0.14 시험 파일은 변경하지 않는다. 변조한 entry/정책/원본 runtime/registry/설치 모듈/lockfile, 누락/추가/symlink/잘못된 manifest 및 환경을 거부한 뒤 원상복구한 동일 구성으로 전체 MCP 왕복을 시험한다. 등록 승인자, 키, 기기, 카메라 응답은 synthetic이며 실제 Android 시험이 아니다. 네트워크는 127.0.0.1 HTTP 시험만 사용한다.

## 출시 경계와 남은 위험

이것은 **검토용 해시 무결성 명세**이며 운영자의 암호학적 서명이나 출시/배포 승인서가 아니다. 운영 시작 경로는 아직 연결하지 않는다. 운영에서는 별도 승인된 immutable 배포와 서명/기준 digest 전달, 실제 설정 조합의 확인이 필요하다. 동일 프로세스에서 악성 privileged writer가 검사 직후 파일을 바꾸는 TOCTOU 위험을 제거한 보안 sandbox라고 주장하지 않는다. OS/Node native binary의 공급망 검사나 AV/기존 의존성 경고 해결을 대신하지 않는다.

현재 GPT 카메라 화면 프로필, 원본 인증서 서명, 승인된 업데이트 설치, 실기기 읽기 왕복, 자동 확대·종료감지·복원은 별도 미완료다. 기존 Android 빌드 결과를 이번 서버 변경 때문에 다시 실패 처리하거나 재빌드하지 않는다. 원본 전체 비공개 Android 소스와 서명키는 공개 GitHub에 올리지 않는다.
