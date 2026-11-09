# 카비서 v0.35: 1.4.2 호환성 로컬 검사기

## 이번에 실제로 완료한 개발
공개 repo에 범용 검사기 tools/kabiseo-private-compat-guard/check.py를 추가했다. 비공개 JH ZIP이나 소스 내용은 공개하지 않았다.
정확한 ZIP SHA256 확인, 압축경로 탈출·심볼릭링크·중복 방어, Kotlin 주석·문자열 오탐 분리, CameraX 최신 API 사용 가능성 스캔을 수행하도록 작성했다.
검사 결과가 깨끗하더라도 전체 299개 차이 또는 컴파일 호환을 보증하지 않는 정적 사전검사다.

## 실제 검증 증거
- Synthetic fixtures: 10 / 10 PASS
- Windows GitHub Actions run 42556212063, job 128962376220, attempt 1, success
- Evidence artifact ID 13647995061; sha256 d88478a6a55e21a7e49fde7f3829c89ec6d135b954e63851e3d5834efbf9a72d
- Link: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42556212063
- Original private JH app, server, signing, security setting, phone: unchanged

## 아직 안 한 부분
Local Python/container execution in this turn returned ClientError/reset. Exact v0.24.2 user ZIP bytes were not inspected; don't claim app CameraX1.4.2 compatibility.
v0.24.3 private patch, model runtime integration, real Android compile/lint, signing, installation and phone E2E NOT_RUN.
Gate verdict REVIEW, release not approved. Do not upload private ZIP/source to public GitHub.

## 다음 한 작업
Local execution recover => scan real private v0.24.2 archive with exact pinned SHA and compare exact method call sites with v0.34 CameraX ABI; if compatible produce private v0.24.3 CameraX1.4.2 review source patch.
Do not ask user to reupload ZIP or repeat previous valid CI test.