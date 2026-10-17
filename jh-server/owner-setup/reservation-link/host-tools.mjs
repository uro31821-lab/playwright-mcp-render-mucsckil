/** Read-only JH167 adapter for the independently tested v0.2 reservation module.
 * Host owns command_id, authentication, signed-screen readback and approved domains.
 * Caller offers are DISCOVERY HINTS; this tool never treats them as live availability.
 */
import {BOOKING_KINDS,getMissingFields,safeHttpsUrl} from './index.mjs';
import {renderBookingLinks} from './markdown.mjs';
import {buildReadOnlyScreenGuide} from './screen-guide.mjs';
import {createOfficialLiveSuppliers,officialLiveSupplierStatus,normalizeOfficialLiveForDisplay} from './providers/official-live.mjs';
import {koreanServiceHandoff,KOREAN_HANDOFF_KINDS,KOREAN_HANDOFF_SERVICES} from './providers/korean-service-handoff.mjs';

const MAX_LINKS=12;
const clean=s=>typeof s==='string'?s.trim():'';
const isHost=h=>/^(?=.{4,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(h);
export function hostAllowlist(raw){
  const values=(typeof raw==='string'?raw:'').split(',').map(x=>x.trim().toLowerCase())
    .filter(x=>x&&!x.startsWith('*.')&&isHost(x));
  return [...new Set(values)].slice(0,40);
}

/** Candidate URLs are NOT provider observations, even when supplied as "available". */
export function reviewDiscoveryLinks({kind,requirements={},links=[]}={}, allowedBookingHosts=[]){
  if(!BOOKING_KINDS.includes(kind)||!requirements||typeof requirements!=='object'||Array.isArray(requirements))
    return {ok:false,code:'RESERVATION_REQUIREMENTS_INVALID',external_effect_status:'NOT_EXECUTED'};
  if(!Array.isArray(links)||links.length>MAX_LINKS)
    return {ok:false,code:'RESERVATION_LINK_COUNT_INVALID',external_effect_status:'NOT_EXECUTED'};
  const missing_fields=getMissingFields({kind,requirements});
  const seen=new Set(),accepted=[],rejected=[];
  for (let i=0;i<links.length;i++){
    const hint=links[i];
    const title=clean(hint?.title).slice(0,160);
    const url=safeHttpsUrl(hint?.booking_url,allowedBookingHosts);
    if(!title||!url){rejected.push({index:i,reason:!allowedBookingHosts.length?'BOOKING_HOST_ALLOWLIST_NOT_CONFIGURED':'UNVERIFIED_BOOKING_URL'});continue;}
    if(seen.has(url))continue;
    seen.add(url);
    accepted.push({title,booking_url:url,status_label:'가능 여부 미확인 — 예약처에서 직접 확인',
      price_label:'가격·수수료 미확인',cancellation:'취소 조건 예약처 확인 필요',
      deposit:'예약금 예약처 확인 필요',observed_at:null,
      availability:'UNKNOWN',external_effect_status:'NOT_EXECUTED'});
  }
  const view={kind,requirements,available:[],check_on_site:accepted,other_dates:[],
    availability_verified:false,provider_errors:[],
    headline:missing_fields.length?'조건 확인 필요 — 예약 가능 여부 미확인':
      '예약 가능 여부 미확인 — 예약 페이지에서 직접 확인',
    external_effect_status:'NOT_EXECUTED'};
  return {ok:true,kind,missing_fields,availability_verified:false,available:[],
    check_on_site:accepted,other_dates:[],rejected,provider_connection:'NOT_CONNECTED',
    external_effect_status:'NOT_EXECUTED',manual_only:true,
    markdown:renderBookingLinks(view),
    note:'입력 후보는 실시간 공급자 조회 결과가 아닙니다. 정확한 예약 페이지인지 및 실제 잔여석은 사용자·기존 JH 검색/공급자 확인이 필요합니다.'};
}

export function registerReservationLinkTools({registerOAuthTool,z,textResult,getHostContext,readVerifiedRight,allowedBookingHosts=[],liveProviders=null,liveProviderStatus=null}){
  if(typeof registerOAuthTool!=='function'||typeof textResult!=='function'||typeof getHostContext!=='function'||
     typeof readVerifiedRight!=='function'||!z)throw Error('RESERVATION_HOST_PORTS_REQUIRED');
  const allowlist=[...allowedBookingHosts];
  // Server side only: provider credentials never go to ChatGPT/Android and are never logged.
  const activeSuppliers=Array.isArray(liveProviders)?liveProviders:createOfficialLiveSuppliers();
  const providerStatus=typeof liveProviderStatus==='function'?liveProviderStatus:officialLiveSupplierStatus;
  const req=z.object({
    location:z.string().max(180).optional(),date:z.string().max(10).optional(),
    time:z.string().max(5).optional(),time_window:z.string().max(80).optional(),
    party_size:z.number().int().min(1).max(100).optional(),
    check_in:z.string().max(10).optional(),check_out:z.string().max(10).optional(),
    adults:z.number().int().min(1).max(100).optional(),rooms:z.number().int().min(1).max(100).optional(),
    origin:z.string().max(160).optional(),destination:z.string().max(160).optional(),
    origin_iata:z.string().max(3).optional(),destination_iata:z.string().max(3).optional(),
    location_en:z.string().max(160).optional(),user_locale:z.string().max(12).optional(),
    user_country_code:z.string().max(2).optional(),cabin_class:z.enum(['economy','business','first']).optional(),
    departure_date:z.string().max(10).optional(),return_date:z.string().max(10).optional(),
    passengers:z.number().int().min(1).max(100).optional(),
    specialty:z.string().max(100).optional(),currency:z.string().max(3).optional(),
    max_total_amount:z.string().max(30).optional(),max_price_per_person:z.string().max(30).optional()
  }).strict();
  const fail=e=>({ok:false,code:typeof e?.code==='string'?e.code:'RESERVATION_READ_ONLY_ERROR',
    external_effect_status:'NOT_EXECUTED'});
  registerOAuthTool('life_reservation_link_assistant',{
    title:'예약 링크 비서 — 확인용 페이지 링크만 안내',
    description:'가이드형 예약: 기존 검색 도구로 찾은 페이지 후보를 안전한 HTTPS/서버 승인 도메인 기준으로 점검하고 예약 가능 미확인 링크로 안내합니다. 실시간 공급자 API 미연결 상태이므로 빈자리·가격·예약을 확인했다고 표시하지 않습니다. 사용자가 직접 입력·예약·결제합니다. 새로운 앱 실행, 클릭, 결제, 저장을 수행하지 않습니다. 현재 JH 예약 검색은 life_choice_collect 등 기존 도구를 이용하고 링크 점검만 이 도구로 합니다.',
    inputSchema:{kind:z.enum(BOOKING_KINDS),requirements:req,
      links:z.array(z.object({title:z.string().min(1).max(160),booking_url:z.string().max(2048)}).strict()).max(MAX_LINKS)},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async args=>{
    try{
      const ctx=getHostContext(); if(!ctx?.command_id) return textResult({ok:false,code:'HOST_COMMAND_REQUIRED',external_effect_status:'NOT_EXECUTED'});
      const answer=reviewDiscoveryLinks(args,allowlist);
      return textResult({...answer,command_id:ctx.command_id,protocol_version:'1.0',
        priority_handoff: (args.kind==='hotel'||args.kind==='flight')?
          koreanServiceHandoff({kind:args.kind}):null});
    }catch(e){return textResult(fail(e));}
  });
  registerOAuthTool('life_reservation_screen_guide',{
    title:'예약 화면 설명 — 실제 오른쪽 화면 읽기만',
    description:'JH 서명된 오른쪽 분할 화면에 실제 표시된 문구와 항목만 설명합니다. ANSWER_ONLY 전용으로 클릭/입력/스크롤/이동을 절대 수행하지 않습니다. 읽기 증거가 없으면 화면 내용을 추측하지 않습니다.',
    inputSchema:{question:z.string().min(1).max(1000)},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async ({question})=>{
    try{
      const ctx=getHostContext(); if(!ctx?.command_id)return textResult({ok:false,code:'HOST_COMMAND_REQUIRED',external_effect_status:'NOT_EXECUTED'});
      const read=await readVerifiedRight(question,ctx.command_id);
      const observation=read?.verified===true?read.observation:null;
      const guide=buildReadOnlyScreenGuide({question,observation});
      return textResult({ok:true,...guide,source_verified:read?.verified===true,
        ...(read?.verified===true?{evidence:read.evidence||[]}:{reason:read?.code||'RIGHT_PANE_UNVERIFIED'}),
        command_id:ctx.command_id,protocol_version:'1.0'});
    }catch(e){return textResult(fail(e));}
  });

  // Korean providers have verified official entry points, but no direct JH inventory API.
  // This guide never attempts site automation or Kakao T taxi dispatch.
  registerOAuthTool('life_reservation_regional_handoff',{
    title:'여기어때·카카오T 공식 서비스 연결 — 직접 예약·호출 가이드',
    description:'한국 숙박/이동 우선 공급자 여기어때·카카오T의 검증된 공식 사이트·Android 앱 진입점만 제공합니다. JH 공급자 API나 실시간 재고는 미연결이며, 가격/가용성/예약 또는 택시 호출을 확인했다고 주장하지 않습니다. 사용자가 직접 열고 실행합니다.',
    inputSchema:{service:z.enum(KOREAN_HANDOFF_SERVICES).optional(),
      kind:z.enum(KOREAN_HANDOFF_KINDS).optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async (args={})=>{
    try{const ctx=getHostContext();if(!ctx?.command_id)return textResult(fail({code:'HOST_COMMAND_REQUIRED'}));
      const handoff=koreanServiceHandoff({service:args.service??null,kind:args.kind??null});
      return textResult({...handoff,command_id:ctx.command_id});
    }catch(e){return textResult(fail(e));}
  });
  registerOAuthTool('life_reservation_provider_status',{
    title:'숙박·항공 실시간 공급자 연결 상태',
    description:'Booking.com 공식 Demand MCP 및 Skyscanner Live API의 서버 연결 조건을 조회합니다. ChatGPT의 공급자 앱 연결과 서버 API 연결은 다릅니다. 비밀키 값을 공개하지 않습니다.',
    inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async ()=>{
    try{const ctx=getHostContext();if(!ctx?.command_id)return textResult(fail({code:'HOST_COMMAND_REQUIRED'}));
      return textResult({ok:true,protocol_version:'1.0',command_id:ctx.command_id,
        providers:providerStatus(),active_supplier_ids:activeSuppliers.map(x=>x.id),
        note:'CREDENTIALS_CONFIGURED_NOT_LIVE_VERIFIED는 서버 실조회 성공을 의미하지 않습니다.',
        external_effect_status:'NOT_EXECUTED'});
    }catch(e){return textResult(fail(e));}
  });
  registerOAuthTool('life_reservation_live_search',{
    title:'실시간 호텔·항공권 공급자 조회 — 링크 안내만',
    description:'JH 서버에 정식 제휴키가 설정된 경우 공식 Booking.com MCP 또는 Skyscanner 항공 가격 API를 읽기 전용 호출합니다. 키가 없으면 공급자 미연결 상태를 표시합니다. 가격·객실/좌석은 조회 시점 정보이므로 최종 사이트에서 재확인. 예약·결제/클릭 없음.',
    inputSchema:{kind:z.enum(['hotel','flight']),requirements:req},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
  },async ({kind,requirements})=>{
    try{
      const ctx=getHostContext();if(!ctx?.command_id)return textResult(fail({code:'HOST_COMMAND_REQUIRED'}));
      const matches=activeSuppliers.filter(x=>x.kinds.includes(kind));
      if(!matches.length)return textResult({ok:true,protocol_version:'1.0',command_id:ctx.command_id,
        kind,provider_connection:'NOT_CONNECTED',available:[],provider_errors:[],
        note:'서버 제휴키 미설정. ChatGPT에 연결된 Booking.com/Trip.com 공급자 앱으로 검색은 별도 가능.',
        priority_handoff:koreanServiceHandoff({kind}),
        external_effect_status:'NOT_EXECUTED'});
      const request={kind,requirements};
      // Read-only supplier calls can still stall. Expire bounded results, never auto-replay.
      const timeout=ms=>new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(
        new Error('PROVIDER_READ_TIMEOUT'),{code:'PROVIDER_READ_TIMEOUT'})),ms));
      const settled=await Promise.allSettled(matches.map(x=>Promise.race([
        x.search(structuredClone(request),{mode:'READ_AVAILABILITY_ONLY',command_id:ctx.command_id}),
        timeout(25000)
      ])));
      const current=getHostContext();
      if(current?.command_id!==ctx.command_id)return textResult({ok:false,code:'COMMAND_CHANGED',
        external_effect_status:'NOT_EXECUTED'});
      const available=[],errors=[];
      for(let i=0;i<settled.length;i++){
        const result=settled[i],supplier=matches[i];
        if(result.status==='rejected') {errors.push({provider_id:supplier.id,
          code:typeof result.reason?.code==='string'?result.reason.code:'SUPPLIER_READ_FAILED'});continue;}
        available.push(...normalizeOfficialLiveForDisplay(supplier,request,result.value));
      }
      return textResult({ok:true,protocol_version:'1.0',command_id:ctx.command_id,kind,
        provider_connection:errors.length&&available.length===0?'QUERY_FAILED':'SOURCE_RESPONSE_RECEIVED',
        available,provider_errors:errors,checked_requirements:requirements,
        inventory_note:'조회 시점 공급자 판매 제안이며 실시간 좌석/객실과 총액은 예약처 결제 직전에 재확인.',
        priority_handoff:koreanServiceHandoff({kind}),
        confirmed_booking:false,external_effect_status:'NOT_EXECUTED'});
    }catch(e){return textResult(fail(e));}
  });
  return {toolNames:['life_reservation_link_assistant','life_reservation_screen_guide',
    'life_reservation_regional_handoff','life_reservation_provider_status','life_reservation_live_search'],effects:'READ_ONLY',
    providersConnected:activeSuppliers.length>0};
}
