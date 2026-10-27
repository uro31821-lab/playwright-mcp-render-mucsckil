# 휴대폰 영상 → ChatGPT 결과 링크

Gemini에서 이미 만든 영상을 저장한 뒤 전용 페이지에서 파일 하나를 선택하면
검증된 MP4/WebM 다운로드 링크를 돌려준다. Google 로그인, API 과금,
휴대폰 전체 파일 접근, JH 중계 서버 변경, 새 APK 설치가 필요하지 않다.

## 사용 흐름

1. 인증된 MCP의 `browser_video_transfer_create({task_id})`를 호출한다.
   `task_id`는 현재 승인된 작업을 나타내는 32자리 소문자 hex 값이며 재시도 때 유지한다.
2. `uploadUrl`을 해당 사용자에게 표시한다. 휴대폰에서 저장한 영상 하나를 선택하고
   **영상 보내기**를 누르면 다운로드 링크가 생성된다.
3. `browser_video_transfer_status({task_id,transfer_id})`에서 `READY`와 `downloadUrl`을
   확인해 ChatGPT 답변에 링크로 표시한다. `WAITING`/`UPLOADING`은 완료가 아니다.

기존 JH 연결에 새 MCP 도구가 노출되지 않는 경우에도 동작한다.
기존 `life_web_navigate`로 **이 서버의** `/video-transfer/?task=<task_id>`를 열면
인증된 `browser_navigate` 응답에 `videoTransfer`와 두 링크가 추가된다.
응답에서 실제 반환된 `resultUrl`을 기존 `life_web_navigate`로 열고
`life_web_snapshot`으로 완료 문구와 **영상 다운로드** 링크를 읽을 수 있다.
이는 영상 전달을 위한 서버 페이지이며 Gemini 서버 로그인으로 돌아가는 경로가 아니다.

## 범위와 제한

- 자동화된 부분: 수신, 실제 영상 형식/메타데이터 검사, 해시 계산, 링크 생성, 결과 조회.
- 휴대폰 앱은 격리되어 있으므로 Gemini의 저장과 최초 파일 선택은 사용자 조작이 필요하다.
  서버가 휴대폰 파일을 몰래 읽거나 ChatGPT 입력창에 자동 첨부하지 않는다.
- 최대 64 MiB, 최대 10분의 MP4/WebM, 동시에 보관하는 작업 최대 4개(예약 한도 256 MiB).
- 업로드 링크 2시간, 결과 링크 발급 시점부터 24시간. 같은 작업의 링크는 재호출해도 바뀌지 않는다.
- 링크 소지자는 해당 파일에 접근할 수 있다. 사용자 본인에게만 제공한다.
- `/var/data/jh-video-results`에 보관하며 같은 키와 디스크로 재시작하면 이어진다.
  만료된 작업은 정기적으로 정리한다. 브라우저 프로필 파일은 수정하지 않는다.
- `MCP_TOKEN`은 서버에만 있고 HMAC 서명에 사용된다. 휴대폰에 키를 전달하지 않는다.
  키를 교체하면 기존 링크는 무효화된다.
- ffprobe는 stdin pipe 프로토콜과 영상 컨테이너만 허용한다. 임의 URL 다운로드는 없다.
- 성공 응답을 잃으면 상태를 조회한다. 완료 파일은 재업로드로 덮어쓰지 않는다.

## 운영

기존 `JH_OWNER_VIEW=1` 환경에서 활성화된다. 같은 유료 서비스와 디스크를 사용한다.
`JH_VIDEO_ROOT`는 테스트/관리자 지정 경로이며 기본값은 위의 전용 디렉터리다.
영상 원문·원래 파일명·링크 비밀값은 로그에 남기지 않는다.

검증: `node --test render-video-transfer.test.mjs render-video-mcp.test.mjs render-video-browser.test.mjs`
실제 브라우저 검증에는 Chromium, ffmpeg, ffprobe가 필요하며 배포 Docker 이미지에 포함된다.
