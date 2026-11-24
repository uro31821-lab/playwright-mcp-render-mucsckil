# JH 카비서 × 편비서 — 간단한 GPT 이미지 자동 생성 규칙

2026-11-21 사용자 재확정: **복잡한 서버 개발이 아니라 ChatGPT가 자체적으로 생성 문장을 작성한 뒤 기본 image_gen으로 바로 왼쪽에 1장 생성하면 된다.**

## 사용자가 원하는 실제 동작

참고사진 + 원하는 분위기 입력 → 카비서가 주담당, 편비서 자동 협력 → GPT가 이미지 생성 프롬프트 내부 작성 → ChatGPT 기본 이미지 생성 도구 실제 호출 → 왼쪽 GPT에 구도 예시 1장 + 유치원생 수준의 쉬운 카메라 움직임 3줄.

오른쪽 카비서로 이미지 파일을 자동 전송하는 기능 **한 가지만 사용하지 않는다.** 기존 카비서 실제 촬영·사용자 직접 AUTO·줌·격자·수평계는 유지한다. 별도 유료 이미지 API·복사 붙여넣기·원격 셔터 없음.

## 이번 패치의 단순화
- 기존 JH228 Secure56 stage, 다운로더, signed APPLY, Host UI receipt 등 **별도 image-transfer 개발을 사용하지 않는다**.
- 기존 PR #203의 `left-preview-route.mjs`와 테스트는 삭제했다. 전용 이미지 전송 포트나 별도 백엔드가 전혀 없다.
- 현 브랜치의 핵심 결과는 `jh-plugin-overlay/skills/jh-camera-left-preview/SKILL.md` 한 파일이다.
- JH 플러그인에 등록하려면 기존 **1.34.137** 원본 manifest 2개에 **짧은 defaultPrompt 1개만 추가**하고, 이미 있는 assistant-hub/카비서/편비서 스킬에 촬영 구도 이미지 생성 협력만 예외로 안내한다.
- 이를 검증하고 원본 22개 defaultPrompt를 보존하는 **실패 시 중단형 로컬 패치 생성기** `build_jh_simple_left_preview.py`와 인계 ZIP은 대화 첨부에 제공한다.

## 실제 실행/등록 상태
- GitHub의 prompt-only 정적 검사 = 코드를 살펴보고 안전 문구가 있다는 뜻일 뿐 이미지 생성 실행 성공 아님.
- 실제 내장 image_gen 호출·현재 사진으로 시안 생성·왼쪽 표시의 실사용 시험은 아직 미완료.
- Plugin Creator `update_plugin`은 여러 번 올바른 형식의 후보를 받아들이지 않고 **invalid arguments**를 반환하므로 실제 JH 등록 성공 없음. 위험하게 구형 22개 prompt를 덮어쓰지 않았다.
- JH plugin ID `plugins_6ac116dadd588191ba4712ffe090534b`, 버전 `1.34.137` 그대로. Android/JH227, Render LIVE, Secure56, 인증서·개인 원장 수정 없음.
- PR #202는 자동 이미지 파일 전송 후보로서 종료·미병합 유지. 이 PR #203은 **왼쪽 GPT 생성 규칙 전용**으로 Draft 유지.

## 완료 기준
현재 사용자가 촬영용 REFERENCE 사진과 분위기를 올렸을 때, GPT 이미지 생성 도구가 **실제로** 예시 1장을 왼쪽에 표시하고 짧은 3줄을 함께 보여줄 것. 실제 도구가 실행되지 않으면 완료라고 하지 않는다.
