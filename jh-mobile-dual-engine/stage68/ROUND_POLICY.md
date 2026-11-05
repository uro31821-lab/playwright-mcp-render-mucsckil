# JH168 Stage68 — 3회 양경로 실기기 검증·탈락 규칙

## 목적
Stage67에서 동일 기능별로 준비한 Android / Playwright Mobile 두 구현을 실제 휴대폰에서 경쟁 검증해 하나만 남긴다.

## 대상
- NATIVE_SELECT
- NESTED_VERTICAL_SCROLL
- HORIZONTAL_SCROLL
- BACK
- PRESS_KEY
- WAIT_CONDITION
- SCREENSHOT
- RETURN_TO_CHROME_FROM_OTHER_APP

## 공통 회차 규칙
각 기능은 매 회차마다 Android와 Playwright Mobile을 모두 동일 조건에서 검증한다.

1. Android 성공 + Playwright Mobile 실패
   - Android 채택
   - 해당 기능의 Playwright Mobile 구현 폐기
   - 이후 회차에서 제외

2. Playwright Mobile 성공 + Android 실패
   - Playwright Mobile 채택
   - 해당 기능의 Android 구현 폐기
   - 이후 회차에서 제외

3. 둘 다 성공
   - 실기기 readback 신뢰도, Secure56 연동성, 유지비용, 기존 JH 통합성 순으로 하나만 채택
   - 동률이면 Android 우선
   - 반대 구현 폐기
   - 이후 회차에서 제외

4. 둘 다 실패
   - 해당 기능만 다음 회차로 이월
   - 실패 원인을 각각 기록하고 두 구현을 수정
   - UNKNOWN / PENDING / FAILED_AFTER_EFFECT 는 자동 재시도 금지

## 회차
- 1회차: 8개 전체 시작. 성공 확정 기능 제거. 양쪽 실패 기능만 수정 후 2회차.
- 2회차: 1회차 양쪽 실패 기능만 재검증. 성공 확정 기능 제거. 양쪽 실패 기능만 수정 후 3회차.
- 3회차: 2회차 양쪽 실패 기능만 재검증.
- 3회차 종료 후에도 양쪽 실패한 기능만 MANUAL 확정.

## 성공 판정
CI 통과나 데스크톱 DOM 성공만으로 실기기 성공으로 판정하지 않는다.
반드시 실제 소유 휴대폰에서:
- 실행 요청이 정확한 기능과 대상에 바인딩됨
- 실제 동작이 1회 실행됨
- 실행 후 상태를 다시 읽어 결과가 확인됨
- 다른 화면/창/기능에 오작동하지 않음
을 모두 만족해야 VERIFIED_PASS다.

## 종료 조건
각 기능은 다음 셋 중 하나로만 종료한다.
- KEEP_ANDROID
- KEEP_PLAYWRIGHT_MOBILE
- MANUAL_AFTER_ROUND_3

## 다음 과정
3회 검증이 끝나면:
1. 살아남은 구현만 운영 경로에 반영
2. 폐기된 반대 구현과 임시 실험 코드 제거
3. 수동 확정 기능을 명시적 MANUAL 경로로 고정
4. 전체 9개 기존 web alias / 모바일 통합 회귀시험
5. 실제 JH 단일 작업에서 Android·웹 전환 연속 E2E 검증
