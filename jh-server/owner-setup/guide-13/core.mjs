/**
 * JH167 13-scenario GUIDE-FIRST facade, v1.0 data contract.
 * Deliberately no Android actions, provider calls, bookings, payments, messages, writes,
 * side effects or command-id generation. The host remains the only authority.
 */
export const PROTOCOL_VERSION='1.0';
export const EXTERNAL_EFFECT_STATUS='NOT_EXECUTED';
const MAX_REQUEST_LENGTH=2000;
const scenario=(id,key,title,port,manual,requires=[])=>Object.freeze({id,key,title,port,manual,requires});
export const SCENARIOS=Object.freeze([
 scenario(1,'NEWS','기사·근거·논문·관련 영상·제품','life_web_navigate','원문 링크를 찾지 못했거나 접근이 막힌 경우에만 기사 URL 제공',['VERIFIED_ORIGINAL_ARTICLE_URL','FULL_ARTICLE_BODY_READBACK']),
 scenario(2,'RESTAURANT','식당 추천·정보·예약','life_choice_collect','예약 전용 페이지에서 직접 날짜·시간·인원을 선택',['CURRENT_BUSINESS_AND_BOOKING_EVIDENCE']),
 scenario(3,'PRODUCT','상품 검색·비교·구매 링크 및 계좌 문구','life_choice_recommend','판매처 페이지에서 옵션·주소·결제를 직접 진행',['PRODUCT_AND_PRICE_SOURCE']),
 scenario(4,'MEMORIA','메모리아 검색·저장','memory.search','저장 또는 검색 결과를 실제 서비스에서 확인',['MEMORIA_CONNECTION']),
 scenario(5,'BOOKTOON','책툰 저장 그림 찾기','book_preview','확인된 저장 원본 링크를 직접 열기',['BOOKTOON_CONNECTION']),
 scenario(6,'FOOD','시킨대로 먹어 — 식품 영양 설명','food_observe','실제 섭취량·식품 라벨을 직접 확인',['SOURCE_NUTRITION_LABEL']),
 scenario(7,'VIDEO','유튜브·라프텔·티빙·넷플릭스 영상 검색','life_web_snapshot','확인된 영상·작품 링크에서 직접 시청',['MEDIA_SOURCE']),
 scenario(8,'BOOKING','항공·식당·영화·공연·스포츠·호텔 예약 가이드','life_reservation_link_assistant','예약처에서 직접 조건 입력·결제·확정',['CURRENT_PROVIDER_AVAILABILITY_OR_UNVERIFIED_LINK']),
 scenario(9,'MUSIC','유튜브 뮤직 곡·중복 확인','life_web_snapshot','연결되지 않았으면 재생목록에 직접 곡을 추가',['MUSIC_PLAYLIST_CONNECTION']),
 scenario(10,'MAIL','메일 검색·요약·답장 초안','gmail.search','발송·이동은 명시적 별도 명령으로만 진행',['MAIL_CONNECTION']),
 scenario(11,'HELP','화면·문서·오류 해결 가이드','life_android_screen_understand','공식 지원 페이지를 직접 열고 안내된 해결 단계를 수행',['FRESH_ERROR_OR_DOCUMENT_EVIDENCE']),
 scenario(12,'KAKAO_SELF','송금 정보 정리·카카오톡 나에게 보내기','life_android_screen_understand','전송 내용을 확인하고 카카오톡 나에게 직접 붙여넣기',['VERIFIED_DOCUMENT_FIELDS']),
 scenario(13,'SCREEN','오른쪽 화면·스크린샷 설명·번역','life_android_screen_understand','확인된 버튼을 직접 누른 뒤 새 화면에서 안내 이어받기',['VERIFIED_RIGHT_SCREEN'])
]);
/** News summaries are only complete after the original link AND full article have been read.
 * The client orchestrates its existing URL search/open tools. This read-only planner
 * does NOT fetch an article and MUST NOT claim to have done so.
 */
export const NEWS_FULL_ARTICLE_POLICY=Object.freeze({
  mode:'ORIGINAL_ARTICLE_FULL_BODY_FIRST',
  planner_does_not_fetch:true,
  resolve_link_from:['USER_SUPPLIED_ARTICLE_URL','VERIFIED_RIGHT_PANE_ARTICLE_TITLE_AND_ORIGIN','TRUSTED_WEB_SEARCH_FOR_EXACT_TITLE'],
  required_steps:[
    'Identify the article title from the current right screen or user-provided context; do not treat an adjacent tab or search suggestion as the article.',
    'Resolve and verify the original publication URL with a trusted web search/open result, using the page title and publisher. Do not invent a URL.',
    'Open that URL and read the complete article body, including lower sections, across the available trusted web tools. Preferred JH tools: life_web_navigate then life_web_snapshot; use ChatGPT web search/open when JH Playwright returns HTTP 403, CAPTCHA, empty or partial content.',
    'Verify that the fetched title and original URL correspond to the requested article and that the relevant full body/sections were accessible; separate the article claims from later independently verified facts.',
    'Only after full-body verification, summarize the entire article in Korean and include the confirmed source link. Preserve dates, numerical claims, key arguments, conclusions and important caveats.',
    'When URL or full body cannot be verified, label the result PARTIAL_SOURCE_ONLY and describe exactly what was read; never present visible screen excerpts as a complete article summary.'
  ],
  fallback_on_access_block:'TRY_INDEPENDENT_CHATGPT_WEB_SEARCH_OR_OPEN; OTHERWISE_REPORT_PARTIAL_SOURCE_ONLY',
  full_summary_requires:['CONFIRMED_ORIGINAL_URL','FULL_BODY_ACCESSIBLE','BODY_MATCHES_ARTICLE'],
  prohibited_full_sources:['VISIBLE_ANDROID_SCREEN_ONLY','SEARCH_SNIPPET_ONLY','BROWSER_403_CAPTCHA','UNVERIFIED_REPOST_OR_HEADLINE_ONLY'],
  output_contract:['SOURCE_URL','ARTICLE_TITLE','SOURCE_DATE_IF_AVAILABLE','KEY_POINTS','ARTICLE_SCOPE','VERIFICATION_LIMITS'],
  screen_role:'IDENTIFY_ARTICLE_AND_CONTEXT_NOT_FULL_TEXT',
  external_effect_status:'NOT_EXECUTED'
});
const byKey=new Map(SCENARIOS.map(x=>[x.key,x]));
const terms=[
 ['KAKAO_SELF',/카카오톡.*(?:나에게|송금|청구서)|(?:계좌번호|예금주|청구서).*(?:카톡|나에게)|송금.*나에게/i],
 ['FOOD',/시킨대로\s*먹어|(?:당뇨|식후혈당|식품\s*사진|영양성분|음식\s*사진).*(?:먹|섭취|탄수화물)|칼로리/i],
 ['BOOKTOON',/책툰|저장한\s*그림|저장된\s*그림/i],
 ['MEMORIA',/메모리아|메모리야|(?:기억|추억).*찾아|기억.*저장/i],
 ['MUSIC',/유튜브\s*뮤직|재생목록|플레이리스트|톱\s*30.*노래|새로운\s*노래/i],
 ['MAIL',/메일|이메일|gmail|답장\s*초안/i],
 ['BOOKING',/예약|예매|항공권|비행기표|호텔|숙소|택시\s*호출|카카오\s*t\b/i],
 ['RESTAURANT',/식당|맛집|레스토랑|오늘.*뭐\s*먹|메뉴\s*추천/i],
 ['PRODUCT',/상품|제품|구매|장바구니|최저가|배송비|사고\s*싶/i],
 ['VIDEO',/유튜브|라프텔|넷플릭스|티빙|영상|회차|애니/i],
 ['NEWS',/기사|뉴스|논문|근거\s*자료|뉴스토리아|외국어\s*기사/i],
 ['HELP',/오류|문제\s*해결|스크린샷|파일\s*형식|공식\s*사이트/i],
 ['SCREEN',/화면|번역|오른쪽|뭐야|무슨\s*뜻|어디\s*눌러|설명/i]
];
function ensureRequest(request){if(typeof request!=='string'||request.trim().length===0||request.length>MAX_REQUEST_LENGTH)throw Object.assign(new Error('INVALID_GUIDE_REQUEST'),{code:'INVALID_GUIDE_REQUEST'});return request.trim()}
export function identifyScenario(request,hint){
 const s=ensureRequest(request);
 if(hint!==undefined&&hint!==null){if(!byKey.has(hint))throw Object.assign(new Error('INVALID_SCENARIO_HINT'),{code:'INVALID_SCENARIO_HINT'});return byKey.get(hint)}
 return byKey.get(terms.find(([,re])=>re.test(s))?.[0]||'SCREEN');
}
export function distinguishRequest(request,previousMode='GUIDE'){
 const s=ensureRequest(request);
 // Even an explicit delegation is only reported. It cannot authorize a tool action.
 if(/^(다음|계속|그다음|했어|완료)$/i.test(s))return {mode:'GUIDE',meaning:'SAME_GOAL_FOLLOW_UP',executionAuthorized:false};
 if(/(?:어디|어떻게|방법|무슨\s*뜻|설명|보여줘|찾아줘|링크|추천|번역|정리|요약|뭐야|해야\s*해|할\s*수)/i.test(s))
   return {mode:'GUIDE',meaning:'EXPLAIN_OR_SEARCH',executionAuthorized:false};
 if(/(?:눌러\s*줘|클릭해\s*줘|입력해\s*줘|삭제해\s*줘|보내\s*줘|결제해\s*줘|예약\s*확정해\s*줘|예약해\s*줘|예약해|송금해\s*줘|추가해\s*줘)$/i.test(s))
   return {mode:'DELEGATION_REQUESTED',meaning:'HOST_REVIEW_REQUIRED',executionAuthorized:false};
 return {mode:'GUIDE',meaning:previousMode==='GUIDE'?'GUIDE_CONTINUATION':'GUIDE_BY_DEFAULT',executionAuthorized:false};
}
function validateHostContext(ctx){
 if(!ctx||ctx.protocol_version!==PROTOCOL_VERSION||typeof ctx.command_id!=='string'||!ctx.command_id.trim())throw Object.assign(new Error('HOST_COMMAND_REQUIRED'),{code:'HOST_COMMAND_REQUIRED'});
 if(ctx.generation!==undefined&&ctx.generation!==null&&(!Number.isSafeInteger(ctx.generation)||ctx.generation<0) ||
    ctx.plan_revision!==undefined&&ctx.plan_revision!==null&&(!Number.isSafeInteger(ctx.plan_revision)||ctx.plan_revision<0))
   throw Object.assign(new Error('HOST_GENERATION_REVISION_INVALID'),{code:'HOST_GENERATION_REVISION_INVALID'});
 // A read-only guide may honestly return null for an unavailable revision; it cannot perform a state transition.
 return {protocol_version:PROTOCOL_VERSION,command_id:ctx.command_id,generation:ctx.generation??null,plan_revision:ctx.plan_revision??null,document_id:ctx.document_id??null};
}
function safeUrl(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return null;
  const h=url.hostname.toLowerCase();if(!h||h==='localhost'||h.endsWith('.local')||/^\d+(?:\.\d+){3}$/.test(h)||h.includes('..')||url.hash&&url.hash.length>1000)return null;
  return url.href;
 }catch{return null}
}
/** Source links can ONLY be surfaced with the trusted host source attestations, never from raw page instructions. */
function verifiedLinks(links,attestedDomains){
 if(!Array.isArray(links)||!Array.isArray(attestedDomains))return [];
 const domains=new Set(attestedDomains.map(x=>String(x).toLowerCase()));
 return links.slice(0,30).flatMap(x=>{
  const url=safeUrl(x?.url);if(!url)return [];
  if(!domains.has(new URL(url).hostname.toLowerCase()))return [];
  return [{title:typeof x?.title==='string'?x.title.slice(0,150):'확인된 링크',url,verified_source:true,booking_page_verified:x?.booking_page_verified===true&&x?.booking_page_attested===true}]
 });
}
export function prepareGuide13({request,hint,hostContext,hostVerifiedSource=null,links=[],attestedDomains=[],previousMode='GUIDE'}={}){
 const scenario=identifyScenario(request,hint);const authority=validateHostContext(hostContext),instruction=distinguishRequest(request,previousMode);
 const currentSource=hostVerifiedSource?.verified===true && typeof hostVerifiedSource?.source_ref==='string' &&
   typeof hostVerifiedSource?.observed_at==='string'&&typeof hostVerifiedSource?.package==='string'
    ?{type:'CURRENT_RIGHT_SCREEN',source_ref:hostVerifiedSource.source_ref,observed_at:hostVerifiedSource.observed_at,package:hostVerifiedSource.package,partial:hostVerifiedSource.partial!==false}:null;
 const urlList=verifiedLinks(links,attestedDomains);
 const isBooking=scenario.key==='BOOKING'||scenario.key==='RESTAURANT';
 return {
  ok:true, ...authority,scenario:{id:scenario.id,key:scenario.key,title:scenario.title},
  request_mode:instruction.mode,follow_up_meaning:instruction.meaning,
  active_context_verified:!!currentSource,
  host_revision_status:authority.generation===null||authority.plan_revision===null?'UNKNOWN_READ_ONLY':'AVAILABLE',
  sources:currentSource?[currentSource]:[],
  link_candidates:urlList,
  suggested_existing_tool:scenario.port,
  required_capability:scenario.requires,
  next_user_action:scenario.manual,
  ...(scenario.key==='NEWS'?{article_workflow:{
    ...NEWS_FULL_ARTICLE_POLICY,
    source_url:null,
    original_link_verified:false,
    full_body_readback_verified:false,
    source_status:'AWAITING_LINK_RESOLUTION',
    summary_scope:'NOT_YET_DETERMINED',
    note:'This plan is NOT an article fetch or full-summary confirmation.'
  }}:{}),
  guide_only:true,execution_authorized:false,perform_action:false,
  availability_verified:false,available:isBooking?null:undefined,
  price:isBooking?null:undefined,
  total:isBooking?null:undefined,
  provider_inventory_connected:false,
  confirmation_verified:false,
  external_effect_status:EXTERNAL_EFFECT_STATUS,
  result:{status:'NOT_EXECUTED',evidence:null},
  safety_note:instruction.mode==='DELEGATION_REQUESTED'
    ?'사용자가 명시적으로 실행을 요청했지만 이 모듈은 실행하지 않습니다. 정확한 동작은 기존 JH 승인/실행 펜스로만 넘길 수 있습니다.'
    :'화면 설명과 사용 방법 안내만 제공합니다. 클릭·스크롤·예약·전송·결제는 수행하지 않았습니다.'
 };
}
/** Caller-supplied flags are not trusted: evidence must come from a privileged host callback. */
export function createGuide13HostBridge({getHostContext,readVerifiedRight,attestedDomains=[]}={}){
 if(typeof getHostContext!=='function')throw new Error('HOST_CONTEXT_PORT_REQUIRED');
 return Object.freeze({
  async plan({request,hint,previousMode='GUIDE',requireCurrentScreen=false}={}){
   const hostContext=await getHostContext();
   let hostVerifiedSource=null;
   if(requireCurrentScreen){
    if(typeof readVerifiedRight!=='function')return {ok:false,code:'HOST_VERIFIED_RIGHT_PANE_PORT_MISSING',external_effect_status:'NOT_EXECUTED'};
    const proof=await readVerifiedRight(request,hostContext?.command_id);
    if(proof?.verified!==true||proof?.command_id!==hostContext?.command_id||!proof.observation?.observed_at)
      return {ok:false,code:'SIGNED_RIGHT_PANE_SOURCE_UNVERIFIED',external_effect_status:'NOT_EXECUTED'};
    hostVerifiedSource={verified:true,source_ref:proof.source_ref,observed_at:proof.observation.observed_at,
      package:proof.observation.app,partial:proof.observation.partial};
   }
   return prepareGuide13({request,hint,hostContext,hostVerifiedSource,attestedDomains,previousMode});
  }
 });
}
