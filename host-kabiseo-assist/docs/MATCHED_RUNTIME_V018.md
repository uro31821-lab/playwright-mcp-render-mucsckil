# 카비서 v0.18 — 실행 버전 일치 검증 통과 / 보안 검토 보류

2026-11-06 재개 작업. 기존 v0.17의 Node22/운영 로그 Node26 차이를 실제 Node26.13.0 실행으로 검증했습니다. 서버 기능 소스, Android 소스, 운영 설정은 변경하지 않았습니다.

## 이번 실제 통과
GitHub head `d73ba65143fbac32052434cd5f43cddd6354b03d`, run42227487821/job127924559532/attempt1은 completed/success입니다. 공식 Node 배포본의 고정된 공개키 서명, 서명된 체크섬과 다운로드 바이트 일치, TAR 구조, 실제 실행할 단일 ELF의 로컬 ClamAV 검사를 통과한 뒤에만 실행했습니다. unused npm/헤더/폰트는 추출·실행·업로드하지 않았습니다.

기존 관찰 프로필 통합검사11묶음(잘못된 프로필12개 거부 포함)이 실제 v26.13.0에서 통과했습니다. 최종 runtimeVersionMatched=true, profileMismatches=[]입니다. 실행 버전 차이는 해소됐으며 운영 버전을 낮추지 않았습니다. 원본 runtime 해시가 운영 로그와 일치하는 검사와 부모5010파일 보존도 통과했습니다.

원래 시작 함수는 시험 환경에서 기존 STORAGE_SECRET_PAIR_REQUIRED까지 진행해 멈췄습니다. 실제 저장된 소유자 설정·키·저장소까지 포함한 운영 시작 성공이나 물리폰 카메라 검증이 아닙니다. 다른 OS/플랫폼까지 동일하다고 주장하지 않습니다.

첫 run42227129347은 FreshClam의 runner-home 로그 권한 오류로 Node 실행 전에 중단됐습니다. /tmp의 전용 clamav 소유 폴더로 해결했고 보안기능 해제·검사 생략·광범위 권한 부여는 하지 않았습니다. 설치 후 NotifyClamd 설정 경고가 있었지만 실제 standalone clamscan이 exit0으로 완료됐습니다. 기존 dependency/Node 경고도 남겨 두었습니다.

## 새 보안 정보와 현재 판정
공식 Node 공지: https://nodejs.org/en/blog/vulnerability/november-2026-security-releases

2026-11-06 확인한 공지는 26.x/24.x/22.x의 HIGH 문제를 수정하는 버전이 2026-11-11 또는 그 직후 공개될 예정이라고 안내합니다. 구체적 문제와 JH에 대한 실제 영향은 아직 확인되지 않았습니다. 기존 서비스가 침해됐다고 단정하지 않습니다.

파일 출처·서명·백신 검사는 소프트웨어 취약점에 대한 안전 판정이 아닙니다. 완료된 CI의 좁은 SAFE 영수증과 기능 PASS는 역사 증거로 보존하되, 추가 실행/출시의 현재 판정은 REVIEW/security_hold로 갱신했습니다. 해당 실행 파일을 더 실행하는 canonical workflow는 보류합니다. 기존 운영 서버를 임의로 끄거나 업그레이드하지 않습니다.

정책 commit `062aceb7b094238b7499774e5aee7464023dde88`, run42228738019: Python 검사11개(기존7+정책4) 통과. policy job127928824356은 success, target runtime job127928893950은 skipped입니다. 이 정책시험 성공을 새 Node 실행 성공으로 계산하지 않습니다. 허용조건이 충족되지 않으면 다운로드/실행 job 자체에 진입하지 않습니다.

## 증거와 재사용
전체 실행 결과는 MATCHED_RUNTIME_V018_RESULT.json에 기록했습니다. runtime artifact13505623423(6078bytes, JSON/log4개)의 원격 업로드 해시는 7362ede762ce6ee8b9a03588a3b45f7eefef7a44e2b80abb44826ec9a9ab297a입니다. 로컬 ClientError로 다운로드 후 독립 재검사는 하지 않았습니다.

기존 profile helper 내부의 newExternalRuntimeDownloaded=false는 그 helper의 범위입니다. 바깥 workflow는 공식 Node 바이너리를 내려받아 검증 후 실행했으므로 전체 작업에서 다운로드가 없었다고 해석하지 않습니다. 원본 로그는 덮어쓰지 않습니다.

Android v0.13 전체 빌드/1301시험/lint0오류·56경고는 이전 증거로 보존합니다. 원본 JH77_LOCATION_ONCE_FIX2.zip과 기존 서명·설치 흐름을 유지합니다. 이번 APK 재빌드/서명/설치/운영배포/사진읽기/휴대폰명령은 모두 0입니다.

## 다음 미완료 경계
공식 수정판 또는 구체적 영향 정보에 근거한 보안 검토를 먼저 해소해야 추가 runtime 실행·출시 검증으로 넘어갈 수 있습니다. 자동 감시·자동 업데이트는 설정하지 않았습니다. 비실행 소스 검토와 기기 확인 절차 정리는 별도로 진행할 수 있으나, REVIEW를 무시해 runtime integration/build/sign/install로 넘기지 않습니다. 실제 소유자 저장소 시작, 신뢰된 manifest 전달, 승인된 배포·업데이트, 촬영 화면 등록·자동 확대·종료 및 원상복원 실기기 검증은 미완료입니다.
