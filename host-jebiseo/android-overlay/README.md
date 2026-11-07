# 제비서 Android 자동 세 단계 후보

이 오버레이는 검증된 Stage62 FIX3 원본에 적용하는 개발 후보다. 설치된 APK나 운영 서버를 바꾸지 않는다.

- 왼쪽 native ChatGPT의 정확한 요청문 선택과 실제 범위 확인
- 실제 Android 선택 메뉴의 ‘Gemini에게 물어보기’ 클릭과 오른쪽 Gemini 초안 확인
- 기존 Gemini 검토·대상별 휴대폰 승인·실제 전송 클릭과 제출 관찰

`files/`의 새 Kotlin 4개 파일과 `existing-files.patch`의 기존 파일 2개 변경으로 구성한다. `manifest.json`에 기준 ZIP·원본 manifest·변경 전후 파일 해시와 보존된 실행 정책 해시를 기록한다. 전체 원본 앱은 이 공개 오버레이에 복제하지 않는다.

## 적용·빌드

검증된 기준 Android source를 별도 작업 폴더로 복사하고 manifest의 변경 전 해시를 먼저 대조한다. 그 폴더에서 `git apply --check /absolute/path/existing-files.patch`가 성공한 경우에만 같은 patch를 적용한다. `files/`의 네 새 파일을 상대 경로 그대로 복사하고 변경 후 해시를 대조한다. 기존 설치본이나 다른 개발본을 덮어쓰지 않는다.

검사·빌드 명령은 `gradle --offline --no-daemon --max-workers=2 :app:testDebugUnitTest :app:assembleRelease`다. 원래 Gradle 8.9, Android SDK 35/build tools 34.0.0, Java 17과 잠긴 의존성을 사용했다. 이번 실제 결과는 1283 tests passed / 0 failed / 0 skipped, release build SUCCESS다. 신규 제비서 9개는 전체 개수에 포함된다.

후보 versionName만 구분하며 applicationId·versionCode와 원래 무서명 계약은 유지한다. 기존 인증서로 서명해야 정식 업데이트를 검토할 수 있다. 서명 없는 APK를 설치 가능한 완성본으로 안내하지 않는다.

## 적용 조건

원 서버의 native handoff binding과 Android consumer가 함께 필요하다. 기존 FIX3에는 새 action 소비자가 없다. 서버는 기존 `life_android_step`과 Secure56 서명·durable·Stage26 완료를 유지한다. 일반 LEFT 클릭·입력 권한을 넓히지 않는다.

호스트가 정확한 준비문을 현재 GPT 화면에 먼저 한 번 표시해야 한다. 선택 API/offset이 없거나, 메뉴가 실제 framework 선택 도구로 확인되지 않거나, Gemini가 오른쪽 분할 창이 아니거나, 초안·제출을 확인하지 못하면 실패·미확정으로 남긴다. 클릭 후 미확정 상태를 재실행하지 않는다. 기존 승인 대기는 같은 requestId로만 재개한다.

유튜브 분석 결과를 GPT로 수동 공유하는 기존 경로는 유지한다. 자동 역방향 수집과 삼성 앱 작업·분석·영상의 최종 결과 확인은 이 세 클릭의 성공과 별도다. 실제 휴대폰에서 세 단계를 검증한 결과는 아직 없다.
