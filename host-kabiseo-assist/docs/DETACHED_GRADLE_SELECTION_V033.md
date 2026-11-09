# 카비서 후속 검증 0.33: Kotlin 충돌 요인과 보수적 대안

## 실제 확인한 핵심
- CameraX 1.5.2를 지정한 별도 Gradle 메타데이터 조회는 Kotlin stdlib 2.0.21을 선택한다. Kotlin 1.9.24를 직접 추가해도 2.0.21이 선택됐다.
- 부모 참조를 대조해 androidx.camera:camera-core:1.5.2가 Kotlin stdlib 2.0.21을 직접 요청함을 확인했다.
- CameraX 1.4.2로 바꾼 동일 검사는 Kotlin stdlib 1.8.22를 선택하며, Kotlin 1.9.24를 직접 추가하면 최종 선택 1.9.24가 된다.
- CameraX 1.4.2/Kotlin 1.9.24 가정의 메타데이터 그래프는 75개 모듈, 322개 연결, 미해결 0개, Protobuf 4.36.2 선택.

## 검증 근거
- CameraX 1.5.2: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42538230660
- Kotlin 2.0.21 직접 요구 출처: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42538437298
- CameraX 1.4.2 비교: https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/42538806613
- CameraX 1.4.2 결과 artifact 13640123907, SHA256 17d981cdef704b430591badf267c80c73d27c377facb18d78b61e7d5b7ab9051

## 절대 혼동 금지
- 검증 환경은 Windows 2025의 미리 설치된 Gradle 9.8.2, Android 플러그인 없는 임시 빈 프로젝트, Maven POM 메타데이터만 사용.
- 실제 비공개 JH Gradle 8.9, Android variant selection, Kotlin 컴파일 및 CameraX 실제 API 호출 호환은 미검증.
- CameraX 1.4.2는 1.5.3의 JPEG 촬영 오류 수정이 빠질 수 있다. 변경 전 사용자 단말 조건과 API 사용을 확인한다.
- 비공개 카비서 v0.24.2 ZIP 변경 없음. 모델도 아직 포함되지 않음.
- 외부 바이너리 보안은 REVIEW로 유지하므로 JH 전체 빌드, APK 서명/설치/실촬영은 시행하지 않는다.

## 다음 우선순위
비공개 v0.24.2의 실제 CameraX API 사용 목록과 CameraX 1.4.2 공개 API 비교 -> 보안 완료된 경우에만 별도의 비공개 검토 패치 -> 실기기 이전 원본 서명·데이터 보존 검증.
