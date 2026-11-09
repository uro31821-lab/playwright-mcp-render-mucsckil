# 카비서 v0.27 — 라이선스 확인 모델의 MediaPipe 정적 호환성 확인

## 결과
공식 TensorFlow Kaggle 모델 `tensorflow/efficientdet/tfLite/lite0-detection-metadata/1`의 이미 검증된 파일 SHA256 `2e04c53bfeac0ac2a30c057c7e2a777594ce39baaac35a92f74fb1e8c4fc4e0b`을 그대로 고정하고 다시 다운로드했습니다. 압축본 SHA256 `0799da1decd268958a9eb8341aab08eb99dee27b0ffdf9924e10ce428a97e854` 및 모델 해시 모두 이전 v0.26 자료와 일치.

이번에는 공개 MediaPipe 원본의 정확한 요구 조건(하위 문서 링크 참조)과 실제 TFLite FlatBuffer를 비교하여 **12개 검사항목 모두 참**임을 확인했습니다.

| 검사 내용 | 결과 |
|---|---|
| TFLite subgraph 1개 | PASS |
| UINT8 RGB 입력 [1,320,320,3] | PASS |
| TFLite 출력 텐서 4개, 메타데이터도 4개 | PASS |
| 입력 메타데이터 수 일치 | PASS |
| `TFLite_Detection_PostProcess` custom opcode 존재 및 마지막 출력과 실제 연결 | PASS |
| 출력 메타데이터 이름: `location / category / score / number of detections` | 일치 |
| BoundingBoxProperties type=BOUNDARIES, coordinateType=RATIO | PASS |
| 출력 4개 FLOAT32 | PASS |
| category labelmap이 메타데이터에 연결된 파일 이름과 일치 | PASS |

**이는 MediaPipe ObjectDetector가 요구하는 정적 필수 구조와 일치한다는 근거**입니다. 본문 코드에서 `GetOutputTensorIndices`는 4개 출력의 위치/범주/점수/갯수를 확인하고, `GetBoundingBoxProperties`는 BOUNDARIES 및 RATIO를 요구합니다. C++ header는 DetectionPostProcess 기반 4개 출력 모델을 지원한다고 명시합니다. 이 검사로는 **실제 MediaPipe 1.1.1 바이너리 호환, Android ABI/JNI, 호출자 예외, 추론 지연·정확도, 이미지 픽셀 좌표 변환은 증명하지 못합니다.**

## 실제 실행 증거
- 변경된 공개 소스 파일은 `tools/kabiseo-model-contract/inspect_contract.py`와 독립 GitHub CI 파일뿐입니다. private app 원본/보호 경로는 byte diff 변경 0 확인.
- Commit: `8739810603832b2c8981687647e2899346d528b1`
- Windows 2025 CI: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42490217617
- Job: 128760745416, attempt 1, **completed/success**.
- 결과 보고서 artifact: id `13621570332`, 1,420 bytes, SHA256 `5cbbc7fbf4b667bf3096429adbc3d986a86a22cf1d3fa7ba1b4969a2176781db`.
- artifact에는 JSON 보고서만 포함; 모델 파일·개인 JH 코드 없음.
- 별도 TFLite/MediaPipe 코드 실행·Android Gradle·서명·APK·기기 접근·촬영·저장은 **0**.
- 외부 바이너리/모델의 과거 백신 검사를 반복 실행하지 않았으며 동일 해시를 통해 기존 증거와 연결. 전체 공급망·전이 의존성 및 v0.24 private 소스 실검사는 여전히 **REVIEW**.

## 근거 코드
- https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/cc/vision/object_detector/object_detector.h
- https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/cc/vision/object_detector/object_detector_graph.cc
- https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/cc/components/processors/detection_postprocessing_graph.cc
- https://github.com/google-ai-edge/mediapipe/blob/main/mediapipe/tasks/metadata/metadata_schema.fbs

## 남은 최초 미완료 작업
사용자의 private v0.24 `JH_Kabiseo_PhotoMaster_Reuse_v024_REVIEW_ONLY.zip`은 이전 턴에 제공됐지만 이번 실행에서도 container와 Python 실행환경이 오류를 반환해 읽지 못함. 원본 앱 소스나 이미 완료했던 PhotoMaster 메모리/timeout/갤러리 저장 수정이 실제 패치에 포함됐는지는 **미확인**이다. ZIP을 공개 GitHub에 복사하거나 기존 앱을 위험하게 덮어쓰지 않는다.

다음은 **private 소스 접근 회복 → 수정사항 및 실제 전이 의존성 대조 → 호환·보안 게이트 완성 → Android 전체 빌드/린트 → 기존 원본 인증서 서명·별도 승인 설치 → 휴대폰 촬영 E2E**. 카비서 앱은 여전히 **v0.24 검토용**, 사용자의 실제 휴대폰에는 자동 확대·자체 카메라가 설치되지 않았다.

`securityGateVerdict=REVIEW`; 출시/자동설치 금지, GPT 전달은 불필요, 얼굴/몸매 보정 제외. 사용자 재업로드·USB 재실행 요청 없음.
