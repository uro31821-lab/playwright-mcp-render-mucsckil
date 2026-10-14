/**
 * JH B9 General Work capability catalog (v1, 2026-10-13).
 * This is routing metadata only. None of these entries grants Android permission,
 * operates a payment button, creates a reservation or starts background work.
 * Tool identifiers below were checked against JH155's source. Provider actions are
 * not MCP tools; they require the existing JH owner/worker authorization path.
 */
export const FEATURE_CATALOG = Object.freeze({
  WEB_SEARCH: {ko:'웹 검색·자료 확인', channel:'BROWSER',read:['life_web_navigate','life_web_snapshot']},
  NEWS_SUMMARY: {ko:'뉴스·사건 요약',channel:'BROWSER_GPT',read:['life_web_navigate','life_web_snapshot']},
  TRANSLATION: {ko:'해외 사이트 번역',channel:'BROWSER_GPT',read:['life_web_navigate','life_web_snapshot']},
  SHOPPING_COMPARE: {ko:'쇼핑·가격·할인·배송비 비교',channel:'CHOICE',read:['life_choice_collect','life_choice_recommend','life_choice_total','life_choice_explain']},
  TRAVEL_SEARCH: {ko:'항공·호텔·관광지 검색 및 비교',channel:'CHOICE',read:['life_choice_collect','life_choice_recommend','life_choice_total']},
  RESTAURANT_SEARCH: {ko:'식당 찾기',channel:'EXISTING_FOOD_DISCOVERY',read:['life_open_service','life_web_snapshot']},
  RESERVATION: {ko:'예약 조건·신청·결과 확인',channel:'EXTERNAL_BOOKING',read:['life_route','life_choice_collect','life_web_snapshot']},
  ITINERARY_TOTAL: {ko:'일정·인원·총액 계산',channel:'CHOICE',read:['life_choice_total','life_choice_explain']},
  PAYMENT_GUIDE: {ko:'결제수단 확인·승인 후 결제',channel:'EXISTING_PAYMENT',read:['life_payment_options','life_payment_result','life_payment_verify_result']},
  BOOKTOON: {ko:'책툰·스캔·이어보기',channel:'EXISTING_PROVIDER',provider:['book_preview']},
  FOOD_MEAL: {ko:'음식·식사 분석·추천',channel:'EXISTING_PROVIDER',provider:['food_observe','food_advice']},
  MEMORIA: {ko:'메모리아 기억 검색·원문 조회',channel:'EXISTING_PROVIDER',provider:['memory.search','memory.fetch']},
  CROSS_APP: {ko:'앱 간 일반 업무·분할 화면',channel:'SECURE_ANDROID',read:['life_android_split_screen_assistant','life_android_secure_status']},
  REPORT: {ko:'자료 정리·근거 포함 보고',channel:'BROWSER_GPT',read:['life_web_snapshot','life_choice_explain']}
});
export const INTENTS=Object.freeze(Object.keys(FEATURE_CATALOG));

// Routing ownership, not a claim of connection/availability.
export const EXISTING_JH_PORTS=Object.freeze({
  BROWSER:'JH155 owner-setup/server-integration/server.mjs — life_web_*',
  CHOICE:'JH155 owner-setup/deployment/search-decision.mjs & search-decision-tools.mjs',
  PAYMENT:'JH155 owner-setup/payment/payment-host.mjs / payment-final.mjs',
  SECURE_ANDROID:'JH155 Secure56 + split-screen assistant (read/approval/cancellation fence)',
  PROVIDER:'JH155 owner-setup/server-worker/provider-session.mjs (GPT + Memoria actions)',
  CANCELLATION:'JH155 existing Orchestrator and B8 work-memory coordinator',
  RESULT:'JH155 existing result-verification-duplicate-guard and provider receipts'
});
