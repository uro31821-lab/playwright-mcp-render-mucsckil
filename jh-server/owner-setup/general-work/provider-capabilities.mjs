/**
 * JH GPT-FIRST: capability discovery ONLY. No provider calls or reservations.
 * Installed connectors must be checked on each request. Search results never
 * prove live inventory or a checkout URL. protocol_version remains 1.0.
 */
const CAPABILITIES = Object.freeze({
  FLIGHT: [
    ['mcp__Trip_com__search_flights', 'FLIGHT_FARES'],
    ['mcp__Skyscanner__flights_live_prices_create_search', 'FLIGHT_FARES'],
  ],
  SHOPPING: [['web.product_query', 'PRODUCT_LISTINGS']],
  RESTAURANT: [
    ['web.availability_query', 'LIVE_RESTAURANT_SEARCH'],
    ['web.businesses_query', 'BUSINESS_INFO_ONLY'],
  ],
  HOTEL: [
    ['mcp__Booking_com__accommodations_search_v2', 'HOTEL_OFFERS'],
    ['mcp__Trip_com__search_hotels', 'HOTEL_OFFERS'],
  ],
  CINEMA: [['web.search_query', 'OFFICIAL_SHOWTIMES_ONLY']],
  PERFORMANCE: [['web.search_query', 'OFFICIAL_EVENT_INFO_ONLY']],
  SPORTS_EVENT: [['web.search_query', 'OFFICIAL_TICKET_INFO_ONLY']],
  SPORTS_FACILITY: [['web.search_query', 'OFFICIAL_FACILITY_INFO_ONLY']],
  HOSPITAL: [['web.search_query', 'OFFICIAL_APPOINTMENT_INFO_ONLY']],
  ACTIVITY: [
    ['mcp__Booking_com__attractions_search', 'ACTIVITY_OFFERS'],
    ['mcp__Trip_com__search_attractions', 'ACTIVITY_OFFERS'],
  ],
  OTHER: [['web.search_query', 'OFFICIAL_INFO_ONLY']],
});
const forbidden = new Set(['patientName','patientId','dateOfBirth','birthDate','residentId','diagnosis','symptoms','insuranceNumber','cardNumber','password','otp']);
export function planProviderCapabilities({bookingType, connectedActions, constraints={}}={}){
  if(!Object.hasOwn(CAPABILITIES, bookingType)) throw Object.assign(Error('BOOKING_TYPE_UNSUPPORTED'),{code:'BOOKING_TYPE_UNSUPPORTED'});
  if(!Array.isArray(connectedActions)||connectedActions.some(s=>typeof s!=='string')) throw Object.assign(Error('AVAILABLE_ACTIONS_REQUIRED'),{code:'AVAILABLE_ACTIONS_REQUIRED'});
  if(!constraints||typeof constraints!=='object'||Array.isArray(constraints)) throw Object.assign(Error('CONSTRAINTS_INVALID'),{code:'CONSTRAINTS_INVALID'});
  if(bookingType==='HOSPITAL' && Object.keys(constraints).some(k=>forbidden.has(k)))throw Object.assign(Error('SENSITIVE_SEARCH_FIELDS_FORBIDDEN'),{code:'SENSITIVE_SEARCH_FIELDS_FORBIDDEN'});
  const enabled = new Set(connectedActions);
  const routes=CAPABILITIES[bookingType].map(([action,scope])=>({action,scope,connected:enabled.has(action),readOnly:true}));
  const selected=routes.find(r=>r.connected)||null;
  return Object.freeze({schema:'JH_GPT_FIRST_PROVIDER_CAPABILITY_V1',protocol_version:'1.0',
    bookingType,sourceVerified:false,liveAvailabilityVerified:false,finalPriceVerified:false,
    providerCheckoutSupported:false,bookingConfirmed:false,paymentCompleted:false,
    operation:'PROVIDER_SEARCH_PLANNING_ONLY',effect:'NOT_EXECUTED',
    status:selected?'SEARCH_SOURCE_IDENTIFIED':'NO_CONNECTED_SOURCE',
    selectedAction:selected?.action||null,sourceScope:selected?.scope||null,
    routes,requiredFollowup:selected?null:'공식 예약처 링크를 확인하거나 검색 서비스를 연결해야 합니다.',
  });
}
export {CAPABILITIES as BOOKING_PROVIDER_CAPABILITY_MAP};
