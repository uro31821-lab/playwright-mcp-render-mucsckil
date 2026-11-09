# 카비서 v0.24 후속 검토 0.26 — 사용조건이 확인된 공식 모델 대안

## 결론
TensorFlow가 Kaggle에 배포한 정확한 `tensorflow/efficientdet/tfLite/lite0-detection-metadata/1` 변형을 확인했다. 해당 변형의 공식 페이지와 실제 다운로드한 `1.tflite` 내부 메타데이터가 모두 Apache 2.0을 명시한다. **샘플 코드의 라이선스를 모델에 대신 적용하지 않았다.** 기존 v0.24의 MediaPipe float32 v1 파일 사용권을 확인한 것은 아니며, 이 모델로 앱을 자동 교체하지 않았다.

이제 모델 사용권이 불명확하다는 이유만으로 같은 조사만 반복할 필요는 없다. 이 정확한 공식 대체 파일을 대상으로 기존 앱 입력 처리·MediaPipe 호환·실제 추론을 검증할 수 있다. 아직 Android 모델 실행/사진 촬영까지 통과한 것은 아니다.

## 정확한 출처와 식별
- 공식 페이지: https://www.kaggle.com/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1
- 공식 이전 주소: https://tfhub.dev/tensorflow/lite-model/efficientdet/lite0/detection/metadata/1 (위 페이지로 이동)
- 페이지의 About Variation은 lite0-detection-metadata / Version 1 / License Apache 2.0 / 1.tflite 4.56 MB로 표시한다. default d0 또는 다른 변형의 내용을 근거로 삼지 않았다.
- 버전 고정 공급자 다운로드: https://www.kaggle.com/api/v1/models/tensorflow/efficientdet/tfLite/lite0-detection-metadata/1/download
- 응답은 storage.googleapis.com의 gzip TAR. 압축본 3,328,249 bytes, SHA256 0799da1decd268958a9eb8341aab08eb99dee27b0ffdf9924e10ce428a97e854.
- 내부 파일은 1.tflite 하나, 4,563,519 bytes, SHA256 **2e04c53bfeac0ac2a30c057c7e2a777594ce39baaac35a92f74fb1e8c4fc4e0b**.
- 모델 내부: EfficientDet Lite0 V1 / author TensorFlow / license Apache License, Version 2.0. 공식 카드와 파일 내부 표시가 일치.
- SHA256은 이번에 읽은 바이트의 식별값이다. 발행자 전자서명이나 무해 절대보장으로 해석하지 않는다. 향후 내려받은 파일이 이 해시와 다르면 재검토한다.

## 정적 호환성 자료와 중요한 차이
실행하지 않고 모델 FlatBuffer를 읽었다. 입력은 UINT8, [1,320,320,3]이며 결과 텐서는 4개다. 결과 shape는 파일에서 비어 있는 동적 shape로 보이므로 실제 할당/추론 결과 크기를 검증했다고 하지 않는다. TFLITE_METADATA와 labelmap.txt를 포함한다.

함께 비교한 공식 MediaPipe int8 v1 모델은 4,602,795 bytes, SHA256 0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb. 이 파일은 입력 UINT8 [1,320,320,3]이고, raw 결과 2개([1,19206,90], [1,19206,4])다. 두 모델의 label 텍스트 해시는 같지만 전체 파일과 출력 계약은 다르다. 따라서 **이름이 EfficientDet-Lite0라는 이유로 drop-in 교체하지 않는다.** 새 모델이 v0.24의 `ObjectDetector` 호출과 맞는지 확인해야 한다. 비교 대상 int8은 기존 private float32 후보 그 자체가 아니다.

## 이번 실제 원격 검사
- 코드 commit: 5ed07679ee6298c726f047248e3e50f14d877636
- workflow: .github/workflows/jh-kabiseo-model-provenance.yml
- run **42489152230**, job **128757484757**, attempt 1, completed/success.
- 공급자 버전 고정 아카이브를 경로/항목/크기 제한 내에서 읽고 파일 식별·입력·출력·메타데이터·associated label 자료를 추출했다.
- 두 모델 파일을 Windows Defender로 검사: exit 0, SCAN_COMPLETED_NO_THREAT_REPORTED. 보호 설정 변경 없음. 정의 버전 1.463.110.0, 정의 갱신 2026-11-03T11:21:45Z. 알려지지 않은 취약점 부재를 보장하지 않는다.
- 모델·공급자 코드를 실행하거나 모델을 APK에 넣지 않았다. 새 외부 패키지 설치 없음.
- 기존 JH 앱·서버·이전 검사 소스가 기준 c14550b8과 같은지 확인했다.
- 결과 artifact **13621081495**, 2,809 bytes, SHA256 **f377192cf2be05555309fda123d32a6afedbc9d023e15a22954308666c0e9509**. report.json/antivirus.json/defender.log만 보존. 모델 자체와 private 소스를 공개 artifact에 올리지 않았다.
- GitHub 완료 로그/영수증을 회수했다. 로컬 재다운로드 및 CRC 재검사는 하지 않았다. 새 테스트 개수로 과거 117개/25개/41개를 합산하지 않았다.

## 남은 실제 장애물
현재 컨테이너 단순 명령은 ServiceUnavailableError, Python 단순 파일조회는 ClientError였다. 두 번의 간단한 상태확인 후 같은 시도를 반복하지 않았다. 그러므로 `/mnt/data/JH_Kabiseo_PhotoMaster_Reuse_v024_REVIEW_ONLY.zip` 내부를 이번에도 열거나 수정하지 못했다. 이전 v0.24 통합/후속 수정 포함 여부 및 전체 앱 빌드는 이번에 재확인되지 않았다. 공개 v0.23 카메라 샘플을 비공개 전체 앱 성공으로 바꾸어 표현하지 않는다.

CameraX1.5.2의 기존 도구 요구조건, MediaPipe1.1.1+Protobuf4.36.2 정적 참조 일치 등 v0.25 결과는 재사용한다. 전이 의존성/Android 호환성은 계속 미완료다. SDK가 성능·사용 통계를 전송할 수 있다는 Google의 공개 고지도 있으므로, 기존 JH가 INTERNET 권한을 가지고 있다는 점을 고려해 최종 오프라인 동작 경계를 확인해야 한다. 이미지가 기기 밖으로 나가지 않는다는 설명을 전체 통신 없음과 혼동하지 않는다.

## 다음 한 단계
**먼저 private v0.24 소스에 접근 가능한 실행환경을 확보하고, 실제 모델 초기화·입력 변환·저장 및 메모리/시간초과 수정 포함 여부를 대조한다.** 이번에 해시가 고정된 라이선스 확인 모델을 실제 API와 맞는지 평가한 후에만 앱의 모델/의존성 변경을 적용한다. 기존 보안 검토와 전체 Android build/lint/서명/명시적 설치 승인/실촬영은 별도로 완료해야 한다.

앱 버전은 v0.24-private-review-not-built로 유지한다. 검토 기록 번호0.26은 새 APK 완성을 뜻하지 않는다. securityGateVerdict=REVIEW; build/install/deploy/phone actions 모두0. 사용자에게 같은 ZIP 재업로드·USB 재연결·기존 진단 재실행을 요구하지 않는다. 알림은 생성하지 않았다.
