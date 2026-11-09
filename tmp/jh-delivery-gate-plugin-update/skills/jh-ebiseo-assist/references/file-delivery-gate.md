# 에비서 사용자 전달 파일 게이트

확정일: 2026-11-09
적용 범위: JH가 사용자에게 직접 전달하는 ZIP, APK, 문서, 이미지, 기타 다운로드 파일.

## 목적
`파일을 만들었다`와 `사용자가 실제로 받을 수 있다`를 분리한다. 내부 생성·도구 업로드·ZIP 무결성만으로 전달 완료라고 말하지 않는다.

## A. 최종 파일 자체
1. 최종본은 실제 사용자 전달이 가능한 현재 런타임 경로에 둔다.
2. 정확한 절대경로를 현재 런타임에서 확인한다. 파일명이나 첨부 제목에서 sandbox 경로를 추정하지 않는다.
3. 파일 존재, 일반 파일 여부, 크기 > 0을 확인한다.
4. SHA-256을 계산해 기록한다.
5. 기본 사용자 전달 파일명은 가능한 한 짧은 ASCII 이름을 사용한다.

## B. ZIP 추가 검사
1. ZIP을 생성 직후 다시 연다.
2. CRC/testzip 또는 동등한 전체 entry 검사에서 오류가 없어야 한다.
3. entry 수와 핵심 파일 존재를 확인한다.
4. 필요한 경우 임시 폴더로 실제 압축 해제해 경로/중첩 폴더 문제를 확인한다.
5. package manifest가 있으면 manifest의 파일 크기/해시와 ZIP 내부 바이트를 다시 대조한다.
6. JH Windows ZIP은 현재 패키지가 약속한 사용자 진입점(`실행.cmd`, 호환 alias `RUN.cmd`)을 정확히 확인한다.
7. CMD는 Windows용 CRLF와 약속한 인코딩을 확인한다.
8. PowerShell 5.1 스크립트는 single UTF-8 BOM + CRLF를 기본으로 하고 double BOM을 금지한다.
9. Windows에서 실제 실행하지 못한 항목은 `NOT_RUN`으로 표시한다.

## C. 링크 출력 전
1. 실제 파일 경로를 현재 런타임에서 생성 또는 확인한 경우에만 sandbox 링크를 쓴다.
2. opaque file id, connector reference, tool-upload 성공만 있고 실제 사용자 링크 경로가 없으면 링크를 추정해 만들지 않는다.
3. 링크 직전 파일 크기와 SHA-256을 한 번 더 확인한다.
4. 최종 답에는 파일명, 크기, SHA-256, `DELIVERY_GATE_PASS` 여부를 남긴다.
5. 사용자가 받았다고 확인하기 전에는 `USER_DOWNLOAD_CONFIRMED=false`다.

## D. 다운로드 실패 보고 시
1. 다운로드 실패를 소스/빌드/서명 실패와 분리해 `DELIVERY_FAILURE`로 분류한다.
2. 기존 파일 바이트와 SHA-256이 유효하면 소스 빌드, Gradle, Android 서명, 서버 배포를 반복하지 않는다.
3. 같은 바이트를 현재 사용자 전달 경로에 짧은 새 ASCII 파일명으로 copy/materialize한다.
4. 새 파일의 크기와 SHA-256이 원본과 같은지 확인한다.
5. ZIP이면 다시 testzip/readback한다.
6. 새 정확한 경로로 링크를 하나만 제공한다.
7. 같은 실패 링크를 그대로 반복해서 보여주지 않는다.
8. 반복 실패면 파일 바이트 문제가 아니라 전달 표면/세션 문제일 수 있음을 명시하고, 확인되지 않은 다운로드 성공을 주장하지 않는다.

## E. 상태 이름
- `FILE_CREATED`
- `CONTENT_INTEGRITY_PASS`
- `DELIVERY_GATE_PASS`
- `USER_DOWNLOAD_CONFIRMED`
- `DELIVERY_FAILURE`
