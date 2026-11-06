# 카비서 v0.16 — 기존 운영 시작 경로 연결 후보

## 결론과 범위
2026-11-06. 기존 운영 시작 코드를 복제한 별도 후보와 카비서 구성 검증을 연결했습니다. 신규 시작 경로 검사 12개 묶음 및 그 안의 잘못된 환경/실행인자 23개 거부가 GitHub CI에서 통과했습니다. 숫자는 중첩되며 합산하지 않습니다.

**실제 운영 서버 시작 성공이 아닙니다.** 실제 원래 operational main을 호출한 시험은 인증정보가 없는 상태에서 원래 `STORAGE_SECRET_PAIR_REQUIRED` 검사에 도달해 중단되는 것을 확인했습니다. 나머지 enabled/disabled 시험은 합성 환경에서 두 selector 호출과 owner의 defer 전환을 모사하고 실제 생성 runtime을 import한 것입니다. 실제 저장된 소유자 설정·키·저장소는 사용하지 않았습니다. 새 listener 0, 물리 휴대폰 명령 0.

## 이번 변경
- v0.15 검증 구성의 5,010개 파일을 보존한 새 사본에 시작용 파일 5개만 추가했습니다. 총 5,015개는 과거 파일 수에 더하지 않습니다.
- 원래 owner/unified/operational 시작 코드의 지정된 import·runtime 선택 지점만 교체합니다. 변경을 되돌리면 원본 전체 바이트가 같아야 합니다.
- 원래 operational 환경 검사 및 secret 소비 전에 새 전체 구성 manifest를 대조합니다. 기대 SHA-256은 별도로 검토된 호스트 설정에서 제공해야 하며, 파일 내부의 자체 주장만으로 선택하지 않습니다.
- 카비서의 두 서버 enable 콜백과 runtimeDigest만 새 시작 binding에 연결합니다. 기존 공통 signer/HMAC/nonce/승인과 workflow digest는 그대로 둡니다.
- CI/test 플래그와 예전 `JH_KABISEO_METADATA_REVIEW`는 운영 활성화 근거로 인정하지 않습니다. 명시적 시작 설정과 기존 운영자 설정이 필요하며 기본 카비서 메타데이터는 OFF입니다.
- 새 조합의 해시는 무결성 증거이지 운영자 서명·출시 승인이나 privileged writer를 막는 sandbox가 아닙니다.

보호된 저장소 deployment 소스, 기존 시작 명령, 실제 운영 설정은 변경하지 않았습니다. 전체 manifest·부모 manifest·각 파일·추가/누락·symlink·환경·중복 시작/선택을 확인합니다.

## 검증 증거
- 검증 코드: `be6ef43008cec08bb94d3e7a02cf66e798fd9575`
- 기준: `845c5dfd9925a9f40950f3a873b4e58bfada9990`
- PR 가상 병합 checkout: `ad89aa654d96c04731842fe1f7d365f6797773f1`
- run `42162319717`, job `127710645739`, attempt 1: completed/success
- Node v22.23.4, Ubuntu 24.04.5
- operator manifest SHA256: `a38326367b280714237573ef38f7649c4eaad80aba6f825b3240fd1dde4a713d`
- 부모 manifest SHA256: `6e07ed624bb13575d4b4f26be72d8f58b9e1ccdec390e9838936f2307b4ef658`
- 결과 JSON artifact `13477411888`, 972 bytes, ZIP SHA256 `0f97a954fa6ac807db7ca1e2f1197a5a5cae2ffff685c42577da503d5f77214a`
- 원격 로그와 업로드 결과 확인. 로컬 다운로드·해시 재검사는 미실시.
- 기존 CI success 확인: v0.15 assembly42162319778, servermetadata42162319738, metadata42162319957, pending42162319735, isolatedread42162319754, FOLLOWUP42162319706, ACK42162319802, inspect42162319786. 전체 PR의 모든 검사 완료나 출시 승인으로 확대하지 않습니다.

첫 run42162112889/job127709978621은 원문을 포함하는 추가 삽입을 역변환할 때 단순 문자열 부재 검사에 걸렸습니다. 전체 추가 블록의 유일성 및 전체 원본 byte equality를 확인하도록 고쳤습니다. 인증·원본보호 검사를 끄거나 실패를 성공으로 처리하지 않았습니다.

## 운영 적용 전에 필요한 사항
이 조합은 v0.15와 동일한 검토 profile(모바일13 ON, Stage26 ACK/Stage40·41·44/command diagnostics 미설정)에 묶여 있습니다. **현재 실제 운영 profile은 이번에 조회하지 않았습니다.** 실제 값이 다르면 현재 기능을 끄지 말고, 그 profile을 보존하는 조합을 만들어 영향 검증해야 합니다. 오류를 없애려고 실제 설정을 이 후보에 맞춰 지우면 안 됩니다.

다음은 운영 profile과 신뢰할 수 있는 외부 기대 digest 전달 경로를 대조하는 읽기 전용 출시 검토입니다. 실제 소유자 저장소를 포함한 전체 시작 성공·배포·원본 인증서 APK 서명/사용자 승인 설치·실제 GPT 촬영 화면 profile·휴대폰 왕복·자동 확대·종료/원상복원 검증은 미완료입니다.

## 과거 증거와 사용자 작업
v0.13 전체 Android 앱 빌드/1,301 단위시험/lint 0오류·56경고 기록은 그대로 보존했습니다. 이번 Android 소스·권한·의존성은 변경하지 않았으며 전체 앱을 재빌드·서명·설치하지 않았습니다. 기존 locked npm 입력은 install hooks 없이 재사용했으며, 기존 dependency/Node 경고는 남아 있습니다. SAFE 또는 무결점 판정은 하지 않았습니다.

이번 로컬 container/Python 단순 실행은 ClientError였으므로 GitHub에서 실행했습니다. 이 오류는 과거 앱 빌드 성공을 무효화하지 않습니다. 사용자는 기존 JH 앱을 유지하며 추가 조작이 필요하지 않습니다. 이전 손가락 확대/화각복귀 시험도 반복하지 않습니다.
