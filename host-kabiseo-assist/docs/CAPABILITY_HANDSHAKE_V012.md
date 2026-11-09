# 카비서 v0.12 — 서버 지원 확인 후보, 운영 OFF

## 목표와 정확한 범위
기존 `meta.kabiseoCameraMetadataVersion===1`처럼 출처가 연결되지 않은 표시값으로 카메라 지원을 판단하는 경로를 제거했습니다. 별도 검토용 서버 합성본에서만 기존 Secure56 `life_android_secure_status` / `secure_device_status`를 재사용해 서명된 응답으로 확인합니다. 운영 startup, 기존 signer/completion/authentication, Android 소스, 설치 앱은 변경하지 않습니다.

이것은 **서버 측 프로토콜 구현**입니다. 현재 Android status에 capability 응답을 추가한 것이 아닙니다. 기존 앱의 일반 status 응답은 지원 미확인으로 거절합니다. GPT 내부 촬영 화면을 바꾸거나 확대/픽셀 접근을 실행하지 않습니다.

## 계약
- `life_android_kabiseo_capability`: STATUS(전송0), PROBE(명시적 단발 상태 요청), RESULT(원 요청 결과만 조회).
- 요청은 command/task/request/runtime/device/session/owner/trust에 묶습니다. Secure56 원본 signer가 만든 큐 객체를 대기 전에 확인하고 같은 원본 객체의 인증된 완료만 사용합니다. 서명 재료를 복제·저장하지 않습니다.
- capability는 제출 시점으로부터 최대30초이며 기존 서명/세션 만료를 넘지 않습니다. RESULT/STATUS 반복 조회로 연장하지 않습니다. 새 probe는 이전 지원결과를 먼저 무효화하고, 이전 늦은 응답이 새 probe를 덮어쓸 수 없습니다.
- 확인된 지원은 현재 명령의 metadata READ에만 필요조건으로 사용합니다. 프로필·카메라 창·화면 동의·제스처·원상복원 검증을 대신하지 않습니다.
- 현재 metadata 프로필은 미등록, 자동 확대 OFF. 미확정 요청 자동 재전송 없음. 기록256개 초과 시 오래된 기록 삭제 대신 차단합니다.

## 향후 Android 상태 응답 형태 — 아직 연결되지 않음
기존 인증된 status의 result.ok=true 및 result.kabiseoCameraMetadata에 다음 항목이 있어야 합니다.
`schema=KABISEO_CAMERA_METADATA_CAPABILITY_V1`, `requestId=서명된 원요청 requestId`, `version=1`, `enabled=true`, `cameraTargetPackage=com.openai.chatgpt`, `readOnly=true`.
`pixelsRead`, `gestureDispatched`, `cameraSettingsChanged`, `automaticZoomEnabled`, `restoreVerified`, `cameraSurfaceMatched`는 모두false.
모델이 이 값을 넣어 보내거나 일반 기기 등록 JSON에 추가해서 지원을 얻는 경로는 없습니다. 현재 앱은 이 형태를 광고하지 않으므로 실제 지원 확인은 미완료입니다.

## 검증과 제한
새 단위시험과 기존 원본 signer/completion을 사용하는 localhost HTTP 시험을 CI에 연결했습니다. 기존 v0.11의 정상 완료 처리 회귀시험을 그대로 유지합니다. 실제 실행 성공은 CI 로그를 확인한 체크포인트에만 기록합니다. 새 npm 패키지/install hook/Android 권한 없음. 기존 lockfile 의존성 경고와 출시 전 보안 검토는 그대로 남습니다.

현재 대화의 container/Python은 단순 health check부터 ClientError입니다. 전체 JH Gradle/APK/서명/설치 및 현 설치본 소스 대조를 수행한 것으로 표시하지 않습니다. 공개 repo에 비공개 전체 Android 소스를 업로드하지 않습니다. 기존 v0.8/0.9 검증물과 빌드 도구를 새로 만들거나 동일 실패를 반복하지 않습니다.

다음 필수 작업: 정확한 현재 Android 소스에 위 status 응답을 연결하고 기존 원본 보안·전체 빌드 검증을 완료한 뒤, 운영 후보를 검토합니다. 이후 실제 기기에서 지원 확인→촬영화면 확인→자동 확대/종료/복원 순으로 검증해야 합니다. 현재 사용자 설치·수동 촬영 재시험은 필요하지 않습니다.
