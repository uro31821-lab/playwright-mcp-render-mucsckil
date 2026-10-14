import {FEATURE_CATALOG,INTENTS} from './catalog.mjs';
import {boundedText,excludedSpecialty,requireCondition,safePublicUrl,EFFECTS} from './policy.mjs';
const includes=(s,terms)=>terms.some(t=>s.includes(t));
const SW=Object.freeze({WAIT:'WAIT_FOR_SOURCE',CONTEXT:'WAIT_FOR_CONTEXT',READY:'READY',HOST:'EXISTING_HOST_ONLY'});

/** Broad public search on a topic is allowed; specialty clinic management or stock *trading* is not. */
export function resolveGeneralIntent(request,hint){
 const r=boundedText(request);const excluded=excludedSpecialty(r);
 if(excluded)return {ok:false,code:excluded};
 if(hint!==undefined){requireCondition(INTENTS.includes(hint),'UNSUPPORTED_GENERAL_WORK_INTENT');return {ok:true,kind:hint,explicit:true};}
 const s=r.toLowerCase();
 if(includes(s,['책툰','책 스캔','페이지 이어보기','책 이어보기']))return {ok:true,kind:'BOOKTOON'};
 if(includes(s,['메모리아','memoria','기억 검색','기억 찾아']))return {ok:true,kind:'MEMORIA'};
 if(includes(s,['결제','카카오페이','삼성페이','카드결제','송금','결제수단']))return {ok:true,kind:'PAYMENT_GUIDE'};
 if(includes(s,['예약','예매','booking','reservation','reserve']))return {ok:true,kind:'RESERVATION'};
 if(includes(s,['총액','전체 비용','일정 합계','예상 비용']))return {ok:true,kind:'ITINERARY_TOTAL'};
 if(includes(s,['시킨대로 먹어','식사','음식 사진','칼로리','먹는 순서','혈당 식단','식단 추천']))return {ok:true,kind:'FOOD_MEAL'};
 if(includes(s,['맛집','식당 찾','식당 검색','먹을 곳','레스토랑 검색']))return {ok:true,kind:'RESTAURANT_SEARCH'};
 if(includes(s,['항공권','호텔','숙소','여행','관광지','비행기표','렌터카']))return {ok:true,kind:'TRAVEL_SEARCH'};
 if(includes(s,['가격비교','가격 비교','배송비','할인','쇼핑','구매 비교','상품 비교']))return {ok:true,kind:'SHOPPING_COMPARE'};
 if(includes(s,['번역','외국 사이트','해외 사이트','translate','영어 사이트','일본어 사이트']))return {ok:true,kind:'TRANSLATION'};
 if(includes(s,['뉴스','시사','오늘 사건','사건 요약','기사 요약']))return {ok:true,kind:'NEWS_SUMMARY'};
 if(includes(s,['보고서','자료 정리','리포트','요약 보고']))return {ok:true,kind:'REPORT'};
 if(includes(s,['분할 화면','오른쪽 앱','다른 앱','앱 전환','화면 조작','지금 화면']))return {ok:true,kind:'CROSS_APP'};
 return {ok:true,kind:'WEB_SEARCH'};
}
function step(id,title,tool,args,effect=EFFECTS.READ,{state=SW.READY,target='SERVER',approval='NONE',sourceRequirement='OBSERVED_CURRENT_SOURCE',authority='EXISTING_JH'}={}){
 return {id,title,tool,args,effect,state,target,approval,sourceRequirement,authority};
}
function reasoning(id,title,{state=SW.WAIT,sourceRequirement='VERIFIED_SOURCE_TEXT'}={}){
 return step(id,title,null,{},EFFECTS.ANALYZE,{state,sourceRequirement,authority:'GPT_EXISTING_CONVERSATION'});
}
function provider(id,title,action,argumentsRequired=[],{state=SW.HOST}={}){
 return step(id,title,action,{argumentsRequired},EFFECTS.READ,{state,authority:'EXISTING_PROVIDER_WORKER',sourceRequirement:'UPSTREAM_PROVIDER_CONFIGURED'});
}
const queryUrl=q=>'https://search.naver.com/search.naver?query='+encodeURIComponent(q);
function webSteps(q,url,kind){
 const u=url?safePublicUrl(url):queryUrl(q);
 const lang=kind==='TRANSLATION'?'해외 페이지 원문을 읽어 문장별 한국어 번역 (원문·번역 구분)':kind==='NEWS_SUMMARY'?'기사가 다루는 사건·발생일·출처·불확실성 구분하여 요약':'읽은 페이지에서 근거·날짜를 확인하고 답변';
 return [step('open','브라우저로 원문 열기','life_web_navigate',{url:u},EFFECTS.NAVIGATE,{sourceRequirement:'USER_REQUESTED_URL_OR_SEARCH_ENGINE'}),
 step('read','현재 페이지 접근성 트리 읽기','life_web_snapshot',{},EFFECTS.READ),
 reasoning('answer',lang)];
}
const collect=q=>step('collect','검색된 후보 페이지 자료 수집','life_choice_collect',{query:q},EFFECTS.NAVIGATE,{sourceRequirement:'FRESH_LINKS_AND_SNAPSHOTS'});
const compare=()=>step('compare','후보별 조건·가격·평점·거리 비교','life_choice_recommend',{},EFFECTS.ANALYZE,{state:SW.WAIT,sourceRequirement:'EXISTING_JH_CHOICE_SCHEMA_CONFIRMED_SOURCE'});
const total=()=>step('total','인원·수량·세금·수수료·할인 반영하여 총액 계산','life_choice_total',{},EFFECTS.READ,{state:SW.WAIT,sourceRequirement:'ACTUAL_ITEM_PRICE_LINES_AND_EXTRAS_CHECKED'});
const explain=()=>step('explain','추천 이유와 차선책의 차액 설명','life_choice_explain',{},EFFECTS.READ,{state:SW.CONTEXT,sourceRequirement:'EXISTING_JH_DECISION_ID'});
function reservationSteps(q){
 const restaurant=/(?:식당|맛집|레스토랑|restaurant|dining)/i.test(q);
 return [step('route','예약 서비스 경계 확인','life_route',{request:q},EFFECTS.READ),
   collect(q),reasoning('conditions','예약 날짜·인원·변경/취소 조건·수수료·최종 가용 여부 확인'),
   step('handoff','실제 예약 제공자의 확정 단계로 인계',restaurant?'life_open_service':null,restaurant?{service:'캐치테이블'}:{},EFFECTS.PREPARE,{state:SW.CONTEXT,sourceRequirement:restaurant?'CONFIRMED_RESTAURANT_BOOKING_PROVIDER':'EXISTING_RESERVATION_PROVIDER_0_8',authority:restaurant?'EXISTING_BROWSER':'EXISTING_RESERVATION_PROVIDER'}),
   step('commit','예약 확정 버튼 — 사용자 승인 필수',null,{},EFFECTS.EXTERNAL_COMMIT,{state:SW.CONTEXT,approval:'EXPLICIT',authority:'EXISTING_BOOKING_AUTHORITY',sourceRequirement:'EXACT_PROVIDER_CONFIRMATION_AND_LIVE_PRICE'}),
   step('verify','실제 예약번호·판매처/예약처 완료 내역 확인',null,{},EFFECTS.READ,{state:SW.CONTEXT,sourceRequirement:'BOOKING_PROVIDER_CONFIRMATION'})];
}
function paymentSteps(options){
 const id=options?.paymentId;
 const active=typeof id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(id);
 return [step('options','판매처가 제공하는 마스킹된 결제수단 읽기','life_payment_options',active?{payment_id:id}:{},EFFECTS.READ,{state:active?SW.READY:SW.CONTEXT,sourceRequirement:'EXISTING_PAYMENT_ID_WITH_MERCHANT_DETAILS'}),
 step('select','안전한 방식 선택(지불 아님)','life_payment_select_method',{},EFFECTS.PREPARE,{state:SW.CONTEXT,sourceRequirement:'REAL_PROVIDER_OPTION_ID'}),
 step('approval','기존 JH의 사용자 직접 승인 링크 요청','life_payment_request_approval',active?{payment_id:id}:{},EFFECTS.PREPARE,{state:active?SW.READY:SW.CONTEXT,approval:'EXPLICIT',sourceRequirement:'MERCHANT_ORDER_AMOUNT_PAYMENT_METHOD'}),
 step('verify','결제 실행 없이 영수증·거래번호 재확인','life_payment_verify_result',active?{payment_id:id}:{},EFFECTS.READ,{state:active?SW.READY:SW.CONTEXT,sourceRequirement:'EXISTING_JH_RESULT_VERIFIER'}),
 step('result','결제 상태 그대로 반환(UNKNOWN은 완료 아님)','life_payment_result',active?{payment_id:id}:{},EFFECTS.READ,{state:active?SW.READY:SW.CONTEXT})];
}
function restSteps(){return [step('open','기존 시킨대로 먹어 화면 열기','life_open_service',{service:'시킨대로 먹어'},EFFECTS.NAVIGATE,{sourceRequirement:'EXISTING_FOOD_DISCOVERY_SITE'}),step('read','식당 검색 결과 확인','life_web_snapshot',{},EFFECTS.READ),reasoning('compare','식당·메뉴 후보와 근거 비교 (실제 예약은 별도)')];}
function crossAppSteps(q){return [step('start','왼쪽 GPT + 오른쪽 앱 분할 확인·읽기','life_android_split_screen_assistant',{mode:'START',goal:q},EFFECTS.READ,{target:'ANDROID_RIGHT',sourceRequirement:'SECURE56_AND_OS_SCREEN_CONSENT'}),reasoning('explain','오른쪽 화면 내용 분석·요약'),step('followup','사용자 후속 명령을 기존 JH 승인/취소 펜스에 전달','life_android_split_screen_assistant',{mode:'FOLLOW_UP'},EFFECTS.PREPARE,{target:'ANDROID_RIGHT',state:SW.CONTEXT,sourceRequirement:'EXACT_CONTEXT_ID_AND_USER_COMMAND'})];}
function specialitySteps(kind){
 switch(kind){
  case 'BOOKTOON':return [provider('preview','기존 책툰 페이지/사진 읽어 미리보기','book_preview',['PAGES']),reasoning('organize','페이지 번호·순서·이어보기 확인'),step('save','사용자 요청 시 기존 책툰/Drive 저장 권한에 인계',null,{},EFFECTS.PREPARE,{state:SW.CONTEXT,sourceRequirement:'EXISTING_BOOKTOON_AND_DRIVE_STORAGE_AUTHORITY'})];
  case 'FOOD_MEAL':return [provider('observe','기존 사진/음식 설명 분석 (사진 없으면 확인 불가)','food_observe',['MEAL']),provider('advice','확인된 재료·양 기준 식사 순서/선택 안내','food_advice',['MEAL','HEALTH']),reasoning('answer','확실한 관찰과 추정 분리·혈당 수치 등 미관측값 생성 금지')];
  case 'MEMORIA':return [provider('search','기존 Memoria v3 검색','memory.search',['QUERY']),provider('fetch','검색된 기억 ID의 원문 재조회','memory.fetch',['SEARCH_RESULT_ID']),reasoning('answer','기억 원문·출처·현재/과거를 구분하여 정리')];
  default:return [];
 }
}
/** This creates a typed plan only. Host's existing orchestration owns execution. */
export function planGeneralWork({request,intent,options={},workflowId,generation,userStarted=false}={}){
 const route=resolveGeneralIntent(request,intent);if(!route.ok)return {ok:false,status:'EXCLUDED',code:route.code,enabled:false};
 requireCondition(options&&typeof options==='object'&&!Array.isArray(options),'OPTIONS_OBJECT_REQUIRED');
 if(workflowId!==undefined)requireCondition(typeof workflowId==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(workflowId),'INVALID_WORKFLOW_ID');
 if(generation!==undefined)requireCondition(Number.isSafeInteger(generation)&&generation>=0,'INVALID_GENERATION');
 const q=boundedText(request);const kind=route.kind;
 let steps=[];
 if(['WEB_SEARCH','NEWS_SUMMARY','TRANSLATION'].includes(kind))steps=webSteps(q,options.url,kind);
 else if(['SHOPPING_COMPARE','TRAVEL_SEARCH'].includes(kind))steps=[collect(q),compare(),total(),explain()];
 else if(kind==='RESTAURANT_SEARCH')steps=restSteps();
 else if(kind==='RESERVATION')steps=reservationSteps(q);
 else if(kind==='ITINERARY_TOTAL')steps=[total(),explain(),reasoning('schedule','날짜·시간대·이동시간·확정/예상 금액 구분')];
 else if(kind==='PAYMENT_GUIDE')steps=paymentSteps(options);
 else if(['BOOKTOON','FOOD_MEAL','MEMORIA'].includes(kind))steps=specialitySteps(kind);
 else if(kind==='CROSS_APP')steps=crossAppSteps(q);
 else if(kind==='REPORT')steps=[step('read','현재 브라우저/사이트 원문 읽기','life_web_snapshot',{},EFFECTS.READ),reasoning('report','출처·관찰시각·미확인 값을 포함해 근거별 자료 정리')];
 requireCondition(steps.length>0,'INTENT_WITHOUT_STEPS');
 const plan={ok:true,status:'PLANNED',kind,title:FEATURE_CATALOG[kind].ko,workflowId:workflowId||null,generation:generation??null,
  channel:FEATURE_CATALOG[kind].channel,steps,started:userStarted===true,
  handoffOnly:true,usesExistingJH:true,noAutomaticCommit:true,noAutomaticResume:true,
  hostRequirements:['EXISTING_ORCHESTRATOR','B8_CANCEL_FENCE','SOURCE_EVIDENCE','EXISTING_APPROVAL_GATE','EXISTING_RESULT_VERIFIER'],
  completionRule:'EFFECT_CONFIRMED_ONLY'};
 // No background initiation. Even planning returns no side effects.
 return plan;
}
export {SW};
