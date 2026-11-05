# 카비서 — 사례 조사 후 실행환경 복구 경로

카메라 기능 버전을 올리지 않는다. 현재 기능 후보는 v0.12이며 운영 OFF/Draft다. 이 변경은 반복되는 개발 막힘의 분류와 이어받기만 다룬다.

## 조사 결과와 적용
1. OpenAI Community에는 `caas.internal.errors.ClientError`로 단순 Python/container 명령까지 실패한다는 직접 경험 보고가 있다. 검색 결과에서 동일 증상을 확인했지만 본문 열기는 실패했다. 공식 원인 규명이나 해결 보장으로 취급하지 않는다.
2. OpenAI 공식 장애 안내는 긴 대화에서 새 대화로 전환해 재시도하고, 지속되면 증거를 모아 Support에 전달하도록 안내한다. 특정 CAAS 내부 오류의 확정 처방은 아니다. 같은 고장 난 실행기에 계속 Gradle을 요청하지 않는다.
3. Gradle 공식 문서는 필요한 의존성이 없으면 `--offline` 빌드가 실패한다고 명시한다. 예제 seed의 성공 또는 SDK 파일 보관을 실제 앱의 완전한 오프라인 캐시 증명으로 취급하지 않는다.
4. Gradle issue #10934는 온라인 빌드 후에도 필요한 메타데이터가 없어 offline 빌드가 실패한 과거 사례다. 현 버전의 같은 버그라고 단정하거나 constraints를 끄지 않는다.
5. GitHub-hosted 실행기는 이 대화의 container와 별도 환경이다. 이미 사용 중이므로 새 해결책처럼 제시하지 않는다. 공개된 검토 코드의 시험은 계속 가능하지만, 비공개 전체 앱 원본이 없으면 전체 앱 빌드는 완료할 수 없다.

## 이번에 발견한 더 최신 완료 근거
`RESULT(20261105-152437).txt`는 부모 JH 앱의 Android build PASS, original signing PASS, update accepted, 설치 identity readback을 보고한다. 기존 persistent toolchain을 재사용했고 recovery는 불필요했다고 기록한다. 이 기록은 카비서 빌드/설치 성공이 아니다. 실제 APK 해시와 전체 소스의 연결도 별도 검증 대상이다.

최신 검토 원본은 `JH77_LOCATION_ONCE_FIX2.zip`으로 확인됐다. FIX2 패키지는 FIX1 앱 식별자를 유지하므로 파일명의 FIX2와 앱의 FIX1을 혼동하지 않는다. 이름 일치만으로 설치된 바이트와 동일하다고 할 수 없다. SHA와 source manifest는 CURRENT.json에 고정했다. 이 방의 raw-byte materialize는 권한 경로 없음으로 거절됐다.

## 재개 순서
- 새 실행환경에서 비변경 한 줄 health check 한 번. 실패하면 source 수정을 시작하지 않고 같은 환경 재시도 종료.
- 정확한 최신 ZIP 원본을 사용자 첨부 또는 허용된 기존 파일 경로로 확보. 파일 목록/검색문/해시만으로 확보됐다고 하지 않는다.
- ZIP/hash/원본 트리/설치 계보 확인 후 카비서 변경분만 비교·통합. 과거 433파일 JH73로 되돌리지 않는다.
- 검증된 기존 빌드 호스트/캐시 재사용. 현 후보의 전체 build/test/lint·원본 서명은 각각 증거를 확인한다. 불필요한 부모 앱 재설치는 하지 않는다.
- 실제 촬영 화면 프로필·읽기·자동 확대·종료감지·복원은 별도 검증한다.

이 정책은 어떤 설치/배포/휴대폰 조작도 승인하지 않는다. 현재 plugin에 저장된 정책이 모든 열린 대화에서 즉시 갱신됐다고 주장하지 않는다.

## 1차 출처
- https://community.openai.com/t/caas-internal-errors-clienterror-affecting-python-container-execution/1400354 (사용자 경험 보고; 검색 결과 확인)
- https://community.openai.com/t/caas-internal-errors-clienterror-python-container-uploaded-files-intermittently-unavailable-for-4-days/1394734 (사용자 경험 보고; 검색 결과 확인)
- https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages
- https://docs.gradle.org/current/userguide/dependency_caching.html
- https://github.com/gradle/gradle/issues/10934
- https://docs.github.com/en/actions/concepts/runners/github-hosted-runners
