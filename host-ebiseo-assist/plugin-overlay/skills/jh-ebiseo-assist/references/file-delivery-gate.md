# 에비서 사용자 전달 파일 게이트 — JH 공통

적용 범위: JH Secure Live의 ZIP·APK·문서 및 다운로드 파일. 기존 Secure56·휴대폰 승인 규칙을 변경하지 않는다.

## A. 생성·무결성 검사
1. 현재 런타임의 **정확한 파일 경로**를 확인한다. 파일 제목·opaque file_id·툴 업로드 성공만으로 sandbox 링크를 추측하지 않는다.
2. 파일의 크기·SHA-256을 확인하고, ZIP은 CRC/testzip·경로 조작·manifest 개별 크기/해시·추출·`실행.cmd` 진입점 및 CRLF를 검증한다.
3. 파일이 유효하다는 사실을 사용자 다운로드 성공으로 바꾸지 않는다. `CONTENT_INTEGRITY_PASS`와 `USER_DOWNLOAD_CONFIRMED`를 분리한다.
4. Windows/Android 설치파일은 실제 서명·AV·권한·빌드 증거를 별도로 확인한다. 보안 경고를 우회하지 않는다.

## B. 공개 가능한 파일의 독립 다운로드
1. 사용자가 **공개 배포를 허용한 비민감 개발 결과**이고 기존 공개 저장소 권한이 확인된 때에는 **GitHub Releases 직접 다운로드 자산 URL**을 우선할 수 있다. 별도 서버·유료 호스팅은 자동으로 만들지 않는다.
2. `https://github.com/<owner>/<repo>/releases/download/<tag>/<filename>` 형식의 주소를 **추측해서 생성하지 않는다**. 실제 release `draft=false`, 저장소 `PUBLIC`, 정확한 자산 이름·크기·digest(SHA-256)·`browser_download_url` 재조회가 있어야만 보여준다.
3. GitHub Actions **Artifacts는 로그인·만료가 있는 작업 산출물**로, 안정적인 영구 직접 다운로드라 단정하거나 기본 전달로 반복하지 않는다.
4. 동일한 바이트를 sandbox 링크에서 1회 재전달한 뒤에도 사용자가 실패했다고 보고하면 **같은 표면에서 파일 이름만 바꿔 재시도하지 않는다**. `DELIVERY_FAILURE`로 분리하고 승인된 독립 호스트 파일 전달로 전환한다.
5. 공개 GitHub Release 자산의 게시·검증이 확인돼도 사용자 PC에서 무인증 GET 및 실제 다운로드가 가능했는지는 별도의 `EXTERNAL_ANONYMOUS_GET_VERIFIED`·`USER_DOWNLOAD_CONFIRMED`로 관리한다.

## C. 비공개 파일
환자정보·계좌·보험·계약·개인사진·개인키·인증서 비밀키·사용자 원본·비공개 사내 데이터·민감 ZIP은 **GitHub 공개 저장소, 공개 Release, 공개 검색에 올리지 않는다**. 비공개 전달 경로가 없으면 `DELIVERY_BLOCKED`로 보고하고 승인 없는 공개로 우회하지 않는다.

## D. 사용자에게 보여줄 결과
- 검증된 직접 파일 링크 하나와 필요하면 해당 릴리스 상세 페이지 백업 하나만 표시한다.
- 파일명·용량·해시, `CONTENT_INTEGRITY_PASS`, `EXTERNAL_ASSET_METADATA_VERIFIED`와 `USER_DOWNLOAD_CONFIRMED=false` 등 상태를 구분한다.
- 실제 사용자 다운로드 성공이 확인되기 전에는 `전달 완료`라고 표현하지 않는다.
- 이미 검증된 ZIP이 있다면 **파일 링크 문제만으로 Android 빌드/서명/실기기 검사를 반복하지 않는다**.

세부 계약·회귀 검사는 JH 개발 저장소 `jh-server/owner-setup/file-delivery/{DELIVERY_STANDARD.md,delivery-gate.mjs,delivery-gate.test.mjs}`를 기준으로 한다. 이 저장소 문서만으로 플러그인 실제 릴리스가 업데이트됐다고 주장하지 않는다.
