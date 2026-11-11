# G Glass (지글라스) — OpenAI API 기존 크레딧 사용 기준

**최신 사용자 확정: 2026-11-11. 이전 '무료 지급 크레딧만 사용·구매분 차감 금지' 규칙을 대체한다.**

## 확정 허용 범위
1. 기본 AI 엔진은 **GPT API**다. 안경에서 요청한 사진과 질문을 GPT API에 연결하되, 휴대전화의 ChatGPT 앱 화면은 열어둘 필요가 없어야 한다.
2. 먼저 사용되는 **무료 지급 API 크레딧** 사용을 허용한다.
3. 무료분이 소진되면 **이미 구매하여 API 계정에 남아 있는 선불 크레딧까지 계속 사용을 허용한다.** 이미 구매한 잔액의 사용은 새 결제 승인 요청과 다르다.
4. **자동충전, 추가 크레딧 구매, 신규 카드 청구, 후불 초과 사용은 승인하지 않았다.** 자동충전 OFF 및 기존 크레딧 범위 밖 과금 방지 게이트를 유지한다.
5. **무료 + 구매 크레딧이 모두 소진되었거나 사용 가능한 잔액·결제 설정을 신뢰성 있게 확인할 수 없는 경우 새 API 요청을 중단한다.** 소진 알림은 "현재 사용 가능한 API 크레딧이 없어 분석을 중지했습니다"처럼 말한다. 무료분만 소진되었다는 이유로 사용을 중지하지 않는다.
6. 오프라인 AI로 자동 변경하지 않는다. 서버 API Key 보호, JH Secure56, 기기 신원, 환자/제3자 이미지 보호, 요청 최대 비용 및 한 번의 사진 촬영당 한 번의 GPT 분석을 지킨다.

## 실제 API 청구에 관한 최신 공식 근거
- OpenAI 공식 [혜택 대상 구독자의 API 크레딧](https://help.openai.com/ko-kr/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions): 같은 조직에 무료·구매한 크레딧이 있으면 무료분을 먼저 쓰고 구매분으로 계속 처리함.
- OpenAI 공식 [선불 API 결제 설정](https://help.openai.com/ko-kr/articles/8264644-setting-up-and-managing-prepaid-api-billing): **자동충전은 별도 설정**이며, **크레딧이 소진돼도 처리 지연으로 음수 잔액이 발생할 수 있음**. 잔액 0에 기댄 실시간 하드 차단을 보장할 수 없음.
- 선불 크레딧에는 만료일이 있으므로 현재 잔액과 만료일을 실시간 또는 충분히 신선한 신뢰 가능한 출처에서 확인해야 한다.
- **결제 방식을 검증하지 않은 후불 계정 또는 자동충전 ON 설정**에서는 API를 시작하지 않는다. 모델별 비용 예측 및 충분한 여유 크레딧 설정, 동시 요청의 예약·중복 방지, 처리 지연 위험을 별도 관리해야 한다.

## 과거 화면 보고는 현재 값이 아니다
- 과거 안내된 월 $200 무료 혜택, 약 $190 사용 가능, 자동충전 꺼짐 등은 해당 시점의 보고다. **현재 무료 잔액·구매 잔액·유효기간·자동충전 여부는 이 문서 갱신 과정에서 실시간 조회하지 않았다.**
- 구매 잔액의 크기 또는 잔여 총액을 추정하지 않는다.

## 실행 계약 (개발용)
```
if (!ownerVerified || !secure56DeviceSession || !verifiedPrepaidAccount ||
    !autoRechargeConfirmedOff || !freshBalanceReadback || !billingSafetyMarginVerified) {
   BLOCK_API();
} else if (freeRemaining + alreadyPurchasedRemaining >=
           maxCostOfNextRequest + outstandingReservations + safetyReserve) {
   REQUEST_GPT_ONCE();
} else {
   BLOCK_API();
}
```
이 계약은 의도된 보수적 정책이며, **실제 계정/결제 확인 및 과금 위험 통제 기능을 구현·검증한 상태는 아니다**. 두 크레딧의 우선 차감은 OpenAI의 청구 정책을 따른다. 앱은 차감 순서를 임의로 조작하지 않는다.

## 미완료와 적용 범위
- 무료 지급분 + 이미 구매한 잔액 구분·현재 사용 가능한 금액·만료일 검증: **NOT_RUN**
- API 조직/프로젝트 결제 방식·자동충전 OFF 신뢰 가능한 확인: **NOT_RUN**
- 동시 요청 예약, 최대 비용 예측, 소진 전 안전 여유, API 청구 지연 검증: **NOT_RUN**
- 실제 GPT API 연결, 잔액 차감, G Glass 실기기 음성·사진 → GPT → 음성: **NOT_RUN**
- 문서·개발 코드 변경만으로 자동충전 OFF나 기존 구매 잔액 사용권이 실제 설정되었다고 말하지 않는다.
