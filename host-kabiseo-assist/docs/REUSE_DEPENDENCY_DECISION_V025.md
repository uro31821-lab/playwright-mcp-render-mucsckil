# 카비서 v0.24 재사용 통합 — 의존성 검토 0.25

## 목표와 이번 실행 범위
사용자가 재개를 지시한 현재 목표는 기존 PhotoMaster AI 촬영 코드를 비공개 JH 통합본 v0.24에 재사용하는 것이다. GPT 내부 촬영화면 제어/ADB 진단이나 GPT 사진 전달로 돌아가지 않는다. 공개 v0.23 Activity는 참고 소스일 뿐 현재 완성 후보가 아니다.

이번에는 로컬 container와 Python의 단순 실행이 각각 ClientError로 실패했다. 같은 실패를 반복하거나 사용자의 ZIP 재업로드를 요청하지 않았다. 비공개 v0.24 ZIP 내부 소스/후속 수정 포함 여부를 이번에 재검사하지 못했고, 이 파일을 공개 GitHub에 업로드하지 않았다. GitHub 개발 브랜치에서 공개 공급자 파일의 정적 검사만 새로 작성·실행했다.

## 이번 새 원격 검사 — 실제 완료
- 코드: c8e10ba027aa53591c796122ea58eeed2974df4a
- workflow: .github/workflows/jh-kabiseo-compatible-inputs.yml
- run 42487175777 / job 128751478350 / attempt 1: completed, success
- 검사일 UTC: 2026-11-08T13:54:42.140647+00:00
- Google Maven 원본 POM/AAR 6개(카메라4, MediaPipe2)를 읽고 좌표·아카이브 구조·발행자 SHA-256 sidecar와 대조했다. 6개 모두 일치.
- 원래 JH/카메라 앱 소스 및 기존 검증 코드 불변을 비교했다. 공급자 클래스나 native .so를 실행하지 않았다. Gradle build, model inference, 사진/휴대폰 명령, 앱 설치, 서버 배포 0.
- Defender는 원본 AAR와 내부 JAR/SO 총24파일을 검사해 종료0/위협 보고 없음. 엔진 정의 1.463.110.0, 업데이트 시각 2026-11-03T11:21:45Z. 이는 알려지지 않은 취약점 부재나 전체 앱 보안 승인 증거가 아니다. 발행자 전자서명은 검증하지 않았다.
- 결과 artifact 13619922717: 5,671 bytes, SHA256 72f565c46db9c552c7d3a3aa0c4558459ba48b045b729e502d8009f65708dc88. report.json/antivirus.json/defender.log만 보존. 외부 바이너리와 private 소스를 배포하지 않음. 로컬 다운로드 재검사는 미실시.

## 실제로 좁힌 조합

### CameraX 1.5.2: 기존 빌드 도구를 바꾸지 않는 우선 검토 후보
다음 네 AAR 내부의 aar-metadata.properties가 모두 minCompileSdk=35, minAndroidGradlePluginVersion=8.6.0이다. 기존 JH에서 기록된 compileSdk35/AGP8.7.3의 이 두 조건을 만족한다.

| 좌표 | 바이트 | SHA-256 |
|---|---:|---|
| androidx.camera:camera-core:1.5.2 | 1184680 | 803d1a61481149431740ad1ff354c36066dff2a05500f0b179c61d77ad88ae16 |
| androidx.camera:camera-camera2:1.5.2 | 604029 | 855d4aebfa1ad9bd6156ce0182ff74c5cd62ed1f76352e6a4aab2b794d85244b |
| androidx.camera:camera-lifecycle:1.5.2 | 50554 | 463d2d0c75a4db796b6edd6a4d39d289c16550b7dc6afa78f83cfae948a23c51 |
| androidx.camera:camera-view:1.5.2 | 122488 | 4505a6deac7dc6b0e9b60e94487bc1ad104cede6d1c9fbce89dd9c19c566484b |

반면 앞서 생성된 run42466574709의 원본 입력 기록에서 CameraX1.6.2의 같은 4 AAR은 compileSdk36/AGP8.9.1을 요구했다. 1.6.2를 현재 JH에 그대로 추가하고 빌드 성공을 기대해서는 안 된다. 공식 릴리스 문서의 현재 검색 스냅샷은 2026-07-01 기준이므로 여기서 1.6.2의 최신성/안정판 여부를 새로 단정하지 않는다. 판단 근거는 실제 받은 정확한 AAR 메타데이터이다.

이 결과는 전체 dependency graph, Kotlin metadata, Android API/DEX 호환성 또는 폴드8 촬영 성공을 보장하지 않는다. camera-view에는 camera-video [1.5.2], camera-camera2에는 featurecombinationquery 1.5.2 등이 선언돼 있다. 모든 전이 의존성은 현재 JH의 실제 Gradle graph에서 별도로 검사해야 한다. OEM 야간 extension 사용 여부와 종속성도 기존 v0.24 소스에서 확인해야 한다. 아직 private Gradle 파일을 수정하거나 1.5.2를 실제 앱에 적용하지 않았다.

### MediaPipe 1.2.2: 단순 업그레이드로 Protobuf 문제는 해결되지 않음
공식 Google Maven의 tasks-core:1.2.2 POM도 protobuf-javalite:4.26.1을 직접 선언한다. tasks-vision:1.2.2는 tasks-core:1.2.2를 선언하고, litertlm-android:0.18.0은 optional=true다. 선택적 대형 라이브러리를 무조건 추가하지 않는다.
- tasks-core1.2.2: 32145407 bytes / SHA256 7ed8d0d473af0ad62914401226199f595683001a6930f0f46a0d32af70eeb048
- tasks-vision1.2.2: 485698 bytes / SHA256 114b3dce25bbafa0f93904a2294cdc3576b415c879ed60bb1aa945183d0dee08
공급자가 선언한 4.26.1은 공식 보안 공지 GHSA-735f-pc8j-v9w8(CVE-2024-7254)의 영향 범위이다. 따라서 최신 SDK라는 이유만으로 해당 의존성 문제를 해소했다고 간주하지 않는다. 실제 설치된 JH 앱이 취약하다고 판정한 것은 아니다.

### 기존 완료 증거 재사용 — 새 시험과 구분
이 대화에서 회수한 기존 성공 run42466574709/job128687379758, 코드6d4317206b1be3691615f27ef946102c75a556af는 MediaPipe1.1.1 클래스997개의 Protobuf 참조117개가 protobuf-javalite4.36.2 후보와 모두 정적으로 연결되는 것을 확인했다. 미해결0, 실제 JDK17 부모 정의를 사용한 상속 참조12개 포함. Android 런타임/JNI/access opcode/전체 graph 호환은 증명하지 않는다. 이것을 MediaPipe1.2.2에도 성립한다고 확대하지 않는다.
- 교체 후보 JAR SHA256 8f4f93d08cb37130ecb0bc69d376d7d27c36ff04ddb1bb27430b06caa9fa062e.
- OSV 조회에서 해당 4.36.2 좌표의 알려진 취약점 목록이 비어 있었고 Defender 종료0이었다. 최신성/절대 안전 보장이 아니다.
- 기존 artifact13612325597 / SHA256 c34e43ce9cb051a348ff3320c963731d5e1374f0f1f3cfc4611255414fca8b1d.
- 이 성공 시험은 이번에 반복하지 않았으며 새 6개 공급자 검사와 숫자를 합산하지 않는다.

## 모델과 private 소스의 남은 경계
검토 대상 공식 모델은 efficientdet_lite0/float32/1이다. Google 가이드는 해당 모델과 다운로드를 안내하지만, 샘플 코드 Apache-2.0 및 다른 변형의 모델카드를 이 정확한 모델 파일의 배포 라이선스로 대신하지 않는다. 이번 확인으로 라이선스 불명확성을 해소했다고 주장하지 않는다. 모델은 실행/앱 번들링하지 않았다.

PhotoMaster의 메모리/설정 시간초과/저장 콜백 후속 수정은 private v0.24 actual source를 다시 열어야 포함 여부를 확정할 수 있다. 이전 보고의 수치나 오래된 GPT 카메라 진단 보고서를 대용으로 쓰지 않는다.

## 다음 미완료 작업과 금지된 우회
추천 검토 방향은 기존 SDK35/AGP8.7.3 보존 + CameraX1.5.2 검토 + 기존 검증된 MediaPipe1.1.1/수정 Protobuf 조합 우선 대조이다. 이것은 적용 완료된 lockfile이나 배포 승인이 아니다. 모델 권리/공급망, 전이 그래프 및 실제 v0.24 소스 대조 후에만 전체 Android 빌드로 이동한다.

securityGateVerdict=REVIEW / private ZIP 이번 재검사 NOT_RUN / Android 전체 build NOT_RUN / 서명·설치·휴대폰 촬영·갤러리 저장 NOT_RUN. 기존 앱·서버·보안 설정 불변. 사용자 추가 업로드·USB·재설치 요구 없음. 재개 시 이번 검사 재실행 대신 원 artifact와 체크포인트를 재사용한다.

## 외부 공식 근거
- https://github.com/protocolbuffers/protobuf/security/advisories/GHSA-735f-pc8j-v9w8
- https://developer.android.com/jetpack/androidx/releases/camera
- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector
- 실제 좌표별 Google Maven POM/AAR 원본 주소와 모든 해시는 원격 artifact report.json에 기록되어 있다.
