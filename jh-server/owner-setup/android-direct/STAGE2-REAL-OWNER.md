## 2단계 추가: 실제 JH167 런타임 삽입점 검증

- \`review-owner-patch.mjs\`는 기존 공식 빌더가 **실제로 조립한** Durable/Secure56/JH167 서버 소스에 대해서만 보호된 후보 함수를 추가한다.
- 기존 \`mk\`, \`exactEnvelope56\`, \`jhRequireCommand56\`, \`active56\`, \`jobs.get\`, \`durableNativeHooks56\`를 동일 서버 프로세스 내부에서 연결하는 점을 검증한다.
- 기존 MCP 등록, Android 브릿지 작업서명, 서버 비밀번호, 승인 정책, 운영 시작 파일에는 변화가 없다.
- 후보 함수는 \`NODE_ENV=test\`, \`JH_OWNER_DEFER_LISTEN=1\`, \`JH_ANDROID_DIRECT_CANDIDATE=CI_SYNTHETIC_ONLY\`, Render 미실행의 **모든 조건**을 만족해야 생성된다. 서버 실행 중 또는 운영 환경에서는 불가하다.
- CI에서는 실제 JH167 빌더 출력의 소스가 변하지 않았는지, 후보 런타임 문법 및 import가 가능한지 검증한다. **실제 휴대폰 명령은 전송하지 않는다.**
