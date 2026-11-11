# JH 파일 전달 오류 재발 방지 기준 — 2026-11-12

## 현상과 수정 범위
G Glass Stage25/26 사용자 다운로드에서, ZIP CRC/해시가 PASS였는데도 ChatGPT 내부 sandbox 링크를 클릭해 받을 수 없다는 보고가 반복됐다. 기존 방식처럼 ZIP을 재생성·이름 변경하고 같은 전달 표면을 다시 사용하는 것만으로는 해결되지 않는다. 전달 문제를 소스/빌드/서명/휴대폰 실행과 별도의 `DELIVERY_FAILURE`로 취급한다.

## 동작 계약 — 다운로드가 필요한 모든 JH 작업
1. **FILE**: 실제 파일 bytes·크기·SHA-256·ZIP CRC·내부 manifest·Windows `실행.cmd` 검증. 불명확한 경로·tool-upload 성공만으로 링크를 만들지 않는다.
2. **CLASSIFY**: 공개 배포 가능 여부를 먼저 구분한다. 사용자 민감자료·환자사진·앱 비밀키·사적 소스·개인계약은 **절대 공개 GitHub Release 업로드 금지**.
3. **PRIMARY**: 사용자에게 공개해도 된다고 확인된 소스/배포물이라면 JH 소유 공개 GitHub Releases의 **직접 asset URL**을 우선한다. Actions Artifacts는 로그인/보관기간 제한이 있으므로 영구 다운로드 링크로 사용하지 않는다.
4. **VERIFY**: release `draft=false`, `repositoryVisibility=PUBLIC`, exact asset `name`, `size`, SHA-256 digest, `browser_download_url`을 현재 조회해 교차 검증한다. 필요하면 인증 없는 HTTP GET을 추가하고 수행하지 못했다면 `EXTERNAL_ANONYMOUS_GET_VERIFIED=false`로 표시한다.
5. **FAILOVER**: 동일한 sandbox 전달 방식으로 1회 재시도 후에도 사용자가 다운로드 실패를 보고하면 **다시 파일명만 바꾸지 않는다**. 다른 독립 호스트/앱에서 자산 링크를 검증한다. 공개 경로를 쓸 수 없는 비공개 파일은 적법한 다른 비공개 전달이 없으면 `DELIVERY_BLOCKED`.
6. **USER**: release asset 게시나 ZIP 무결성은 실제 사용자 다운로드 확인이 아니다. `USER_DOWNLOAD_CONFIRMED`는 사용자 수신 보고/실제 증거가 있을 때만 true.
7. **NO REBUILD**: 같은 해시의 ZIP이 유효하면 Gradle·서명·기기 설치·서버 배포를 반복하지 않는다.
8. **USER WORKFLOW**: ZIP 전체 압축풀기 → `실행.cmd`; Windows Defender/Play Protect 우회 금지. 실기기/OS 승인·개인정보는 새 사용자 승인 없이 확대하지 않는다.

## 재사용 API
- Pure guard: `delivery-gate.mjs` 의 `decideFileDelivery` 와 `verifyPublicReleaseAsset`
- 18 unit tests: `delivery-gate.test.mjs`
- 이 공통 기준은 JH 개발 파이프라인의 소스 정책이며 **별도 플러그인 배포 성공이나 ChatGPT UI 수정까지 증명하지 않는다.**

## 이번 G Glass에서 실제 증거
- 기존 검증 ZIP: `GGlass26.zip`, SHA-256 `18bed0876ba08a884cd1d532f4f380a5ae7ececb0d24d19e1aab86f138a07a68` (16,006 bytes; 기존 ZIP 자체 이상 없음).
- 검증된 공개 릴리스 새 자산: [GGlass26.zip 직접 다운로드](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/releases/download/gglass-s26-readonly-20261112/GGlass26.zip) — GitHub 게시 자산 15,822 bytes, SHA-256 `44f2ba7a85f39af9bf8155af0aa081cfdc13044e5594f285adf3e583345a491c` 확인.
- Release page: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/releases/tag/gglass-s26-readonly-20261112
- 서로 다른 ZIP 바이트 때문에 SHA가 다르며 둘 다 8개 소스 파일을 포함하는 별도 포장본. **SHA가 같다고 주장하지 않는다.**
- 공개 릴리스 생성/자산 재조회 CI: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43048401895 PASS.
- 사용자 브라우저 실제 다운로드 여부: **미확인**. release asset 메타데이터 확인과 익명 GET 실증을 분리한다.

## JH 플러그인 전파 상태
- JH 개발 저장소의 전달 정책과 테스트는 새 소스/CI에서 검증한다.
- 현재 `jh-secure-live` 플러그인 실행 릴리스 자체를 갱신했다는 증거가 없으면 **PLUGIN_RELEASE_NOT_VERIFIED**로 표시한다. 기존 installed 플러그인 변경을 단정하지 않는다.

## 최종 외부 다운로드 검증 (2026-11-12 추가)

- **실제 GitHub CI** [43051395945](https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/43051395945): **SUCCESS**.
- JH 공통 파일 전달 단위시험 **18/18 PASS**, 에비서 plugin-overlay 참조·비공개 자료 공개 차단 규칙 PASS.
- **인증 헤더·쿠키 없는 `curl -L` 실제 HTTP GET**을 통해 공개 Releases의 `GGlass26.zip`을 내려받아 용량 **15,822 bytes**, SHA-256 **`44f2ba7a85f39af9bf8155af0aa081cfdc13044e5594f285adf3e583345a491c`**, ZIP CRC 8 entries 전부 확인.
- 따라서 **`EXTERNAL_ANONYMOUS_GET_VERIFIED=true` (GitHub Actions 환경에서)**. 다만 사용자 PC 브라우저·네트워크에서 성공한 증거가 아직 없으므로 **`USER_DOWNLOAD_CONFIRMED=false`**.
- 변경 범위는 현재 JH 개발 저장소 코드/CI 및 미래 JH 플러그인 편입용 overlay. **사용자의 설치된 JH Secure Live 릴리스 1.34.97은 아직 갱신 성공 증거가 없음**. JH 운영/휴대폰 설치/Meta WDC/API는 변경하지 않음.
