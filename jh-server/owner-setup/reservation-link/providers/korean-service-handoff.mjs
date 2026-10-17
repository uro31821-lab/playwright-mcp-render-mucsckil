/**
 * JH167 preferred Korean provider handoff (guide-only).
 * Links below are OFFICIAL SERVICE ENTRY POINTS, not bookable product/ride links.
 * An app-store page is a user-driven fallback, NEVER proof that an app was launched.
 * No network requests, clicks, app opens, payment, personal-data forwarding, or claims of stock.
 * The existing JH Secure command/approval/result contract is unchanged (protocol 1.0).
 */
export const KOREAN_HANDOFF_PROTOCOL = '1.0';
export const KOREAN_HANDOFF_KINDS = Object.freeze(['hotel','flight','taxi','rail','bus','rental_car']);
export const KOREAN_HANDOFF_SERVICES = Object.freeze(['yeogi','kakao_t']);

const SOURCES = Object.freeze({
  yeogi: Object.freeze({
    id: 'yeogi', name: '여기어때', kinds: Object.freeze(['hotel','flight']),
    web_url: 'https://www.yeogi.com/',
    app_store_url: 'https://play.google.com/store/apps/details?id=kr.goodchoice.abouthere',
    basis_url: 'https://www.yeogi.com/',
    web_kind: 'OFFICIAL_SITE_HOME',
    api_note: 'JH 서버에 여기어때 소비자 예약 재고/운임 API가 연결되어 있지 않습니다. 기존 JH 브라우저 시험에서는 Cloudflare 403으로 자동 접근이 차단되었습니다.'
  }),
  kakao_t: Object.freeze({
    id: 'kakao_t', name: '카카오 T', kinds: Object.freeze(['taxi','flight','rail','bus','rental_car']),
    web_url: 'https://www.kakaomobility.com/service-kakaot/taxi',
    app_store_url: 'https://play.google.com/store/apps/details?id=com.kakao.taxi',
    basis_url: 'https://www.kakaomobility.com/service-kakaot/taxi',
    web_kind: 'OFFICIAL_SERVICE_INFO',
    api_note: 'JH 서버에 개인 택시 실시간 배차·요금/좌석 재고 API가 연결되어 있지 않습니다. 카카오 T의 길찾기·퀵/배송·비즈니스 API를 일반 택시 예약 API로 대체하지 않습니다.'
  })
});
const HELP = Object.freeze({
  yeogi: Object.freeze({
    hotel:'여기어때 공식 사이트/앱을 직접 여세요 → 목적지·날짜·인원·객실수를 입력 → 실제 객실·총액·취소 조건을 확인 → 직접 예약·결제하세요.',
    flight:'여기어때 공식 사이트/앱에서 항공권을 직접 검색하세요 → 출발/도착·날짜·인원·수하물·총액을 확인 → 직접 예약·결제하세요.'
  }),
  kakao_t: Object.freeze({
    taxi:'카카오 T 공식 앱을 직접 여세요 → 택시 호출 또는 택시예약을 선택 → 출발지·도착지·시간·차종·요금을 확인 → 직접 호출/예약 버튼을 누르세요.',
    flight:'카카오 T 공식 앱의 항공권 항목을 직접 찾으세요 → 구간·일자·인원·운임·수수료를 확인 → 직접 예약·결제하세요.',
    rail:'카카오 T 공식 앱의 기차 항목을 직접 찾으세요 → 출발지·도착지·날짜·인원·좌석을 확인 → 직접 예매·결제하세요.',
    bus:'카카오 T 공식 앱의 시외버스 항목을 직접 찾으세요 → 노선·시간·좌석·금액을 확인 → 직접 예매·결제하세요.',
    rental_car:'카카오 T 공식 앱의 렌터카 항목을 직접 찾으세요 → 기간·차종·조건·보험·총액을 확인 → 직접 예약·결제하세요.'
  })
});

function card(v,kind,index){
  return {
    priority:index+1,
    provider_id:v.id, provider_name:v.name, provider_type:'USER_DIRECT_HANDOFF',
    service_url:v.web_url,android_app_store_url:v.app_store_url,
    url_verified_as:v.web_kind,
    app_package_name:v.id==='kakao_t'?'com.kakao.taxi':'kr.goodchoice.abouthere',
    app_launch_verified:false,
    // No provider response means no offer, and no evidence to call this a booking page.
    booking_page_verified:false, availability_verified:false, provider_inventory_connected:false,
    available:null,price:null,price_currency:null,fees_confirmed:false,
    observed_at:null, source_ref:v.basis_url,
    external_effect_status:'NOT_EXECUTED',no_auto_click:true,no_auto_reservation:true,
    instructions_ko:HELP[v.id][kind] || '공식 사이트/앱을 직접 열고 이용하려는 서비스를 선택해 주세요. 날짜·인원·가격 및 조건을 실제 화면에서 확인하세요.',
    limitations_ko:v.api_note,
    handoff:{who:'USER',action:'OPEN_OFFICIAL_PROVIDER',page_or_app_selection:'USER',
      final_checkout:'USER',result_verification:'PROVIDER_RECEIPT_REQUIRED'},
  };
}
/** Preferred local handoff, *not* a source of availability.
 * An unknown kind or provider fails closed. Request conditions are never sent or copied
 * into a URL, especially not location/address, date, traveler identity or payment data.
 */
export function koreanServiceHandoff({service=null,kind=null}={}) {
  if(service !== null && !KOREAN_HANDOFF_SERVICES.includes(service))
    return {ok:false,code:'UNKNOWN_KOREAN_SERVICE',external_effect_status:'NOT_EXECUTED'};
  if(kind !== null && !KOREAN_HANDOFF_KINDS.includes(kind))
    return {ok:false,code:'UNSUPPORTED_KOREAN_SERVICE_KIND',external_effect_status:'NOT_EXECUTED'};
  const selected=(service?[SOURCES[service]]:Object.values(SOURCES))
    .filter(s=>!kind || s.kinds.includes(kind));
  const services=selected.map((s,i)=>card(s,kind,i));
  return {
    ok:true, protocol_version:KOREAN_HANDOFF_PROTOCOL,
    provider_connection:'OFFICIAL_LINK_ONLY', live_inventory_status:'NOT_CONNECTED',
    partner_credentials_status:'NOT_CONFIGURED', provider_status:'MANUAL_HANDOFF',
    preferred_provider_order:services.map(s=>s.provider_id),
    selected_kind:kind,services,missing_kind_support:services.length===0,
    headline:services.length?'여기어때·카카오 T 우선 안내 — 예약/배차 가능 여부는 미확인':'해당 종류의 우선 연결 가능한 공식 서비스 없음',
    external_effect_status:'NOT_EXECUTED', booking_confirmed:false,
    note:'공식 서비스 진입점만 제공했습니다. 특정 객실·항공편·택시의 남은 수량·가격·결제 성공을 확인한 것이 아닙니다.'
  };
}
