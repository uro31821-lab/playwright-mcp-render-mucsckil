# JH167 Android-direct / 단계 2 — 서버 내부 Secure56 어댑터

**코드 저장 및 가상 검증용입니다. 실제 서비스 설치·Android APK 빌드·배포·실기기 조작은 하지 않습니다.**

## 중요한 원인
원본 JH 서버 \`safeJobView56\`은 Secure56 작업의 실제 \`id\`, \`secureSessionId\`, \`commandId\`를 MCP 호출자에게 주지 않습니다. 1단계 실행부가 이를 MCP 결과에서 읽는 방식은 실제 연결에 사용할 수 없습니다. 실제 JH 서버 프로세스의 서명 검증된 \`jobs\`와 \`exactEnvelope56\`를 사용해야 합니다.

## 새 구현
- \`host-port.mjs\`: 기존 JH 서버의 **로컬** \`mk\`(agent_snapshot), \`waitJob\`, \`exactEnvelope56\`, \`jobs.get\`, \`active56\`, \`jhRequireCommand56\`, \`devices\`, \`durableNativeHooks56\`를 **주입받아** 처리합니다. 이를 외부 계정/사용자 인자로 받지 않습니다.
- 기존 JH \`inspectSplitEvidence\`로 분할 화면의 실제 오른쪽 앱과 원래 ChatGPT 창을 검증합니다. 결과 화면이 불명확하거나 10초를 넘으면 실행하지 않습니다.
- \`computer_use_action_prepare\`는 **읽기 전용으로 실제 휴대폰의 승인/lease를 요청**합니다. 서명된 휴대폰 완료 결과에서 둘 다 확인되기 전에는 어떤 mutating job도 만들지 않습니다.
- \`computer_use_action_execute\`는 기존 \`exactEnvelope56\` 및 **기존 지속성 저널**만 사용합니다. 휴대폰의 인증 키/승인 토큰은 서버 반환값에 노출하지 않습니다.
- \`life_job_status\`에 해당하는 단계는 공개 MCP의 마스킹된 조회가 아니라 **동일 호스트 프로세스 내부의 original jobs.get(job_id)**를 읽습니다. 요청 재실행은 없습니다.

## 안전 경계
- \`enabled=false\` 기본값. 운영 코드 import, MCP 도구 등록, 서명 정책, 접근성 권한 또는 웹브라우저 경로 수정 **0건**.
- 인증/승인/중복방지/임시 화면 검증을 새 방식으로 재구현하지 않고 기존 경계를 재사용합니다.
- 최신 JH167 Android 원본 ZIP은 라이브러리에 있지만 원본 바이트를 이 환경으로 가져오는 권한 경로가 없어 **APK 병합과 기기 검증 불가**.
- 실제 JH APK가 \`computer_use_action_prepare\` 결과에서 반환하는 승인 토큰 키 이름 및 민감한 데이터의 phone-local 처리 방식은 아직 실기기 확인되지 않았습니다. **임의 토큰을 생성하거나 승인 대기 상태를 성공으로 바꾸지 않습니다.**
- 기존 Android 앱 자체를 실행하는 특화 도구는 아직 만들지 않았으며 추가 진입 로직 검증이 남아 있습니다.
- JH 서버의 현재 배포 런타임 내부 함수에 \`host-port.mjs\`를 실제 주입하는 연결 작업은 다음 단계입니다.

## 실행 게이트
1. 기존 Secure56 세션 및 같은 \`commandId\`가 실재할 것.
2. 서명 완료된 \`agent_snapshot\`에서 RIGHT 앱 \`inspectSplitEvidence\` 통과.
3. original \`durableNativeHooks56\` 안전 활성화.
4. original \`computer_use_action_prepare\`에서 서명된 phone lease/approval 확인.
5. 최소 시간 안에 한 번만 original \`computer_use_action_execute\` 요청.
6. 같은 original job ID를 읽어 장치 보고와 실제 화면 변경 검증을 구별.
7. 운영 반영 전에 최신 원서명 APK와 실기기 E2E 검증이 필요.

## 검증
GitHub Actions로 \`node --test jh-server/owner-setup/android-direct/*.test.mjs\` 수행. 가상 서명/휴대폰 모의 실험이며 실제 APK 검증을 뜻하지 않습니다.
