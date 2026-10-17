/** Official supplier *read-only* connectors for the JH167 guided reservation module.
 * NO reservations, checkout, browser clicks or access to Android/Bridge are possible here.
 * ChatGPT app tool credentials are NOT accessible in this server process.
 * Backend credentials must be granted by the supplier to the JH server separately.
 */
import {createHash} from 'node:crypto';
import {safeHttpsUrl} from '../index.mjs';

const OFFICIAL_BOOKING_MCP = 'https://demandapi-mcp.booking.com/v1/sp/mcp/';
const OFFICIAL_SKYSCANNER_API = 'https://partners.api.skyscanner.net/apiservices/v3/flights/live/search';
const immutable = x => structuredClone(x);
const text = v => typeof v === 'string' ? v.trim() : '';
const digest = obj => createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0,24);
const code = (c) => Object.assign(new Error(c), {code:c});
const isMoney = v => typeof v === 'number' ? Number.isSafeInteger(v) && v >= 0 : typeof v === 'string' && /^\d+(?:\.\d{1,2})?$/.test(v);
const money = v => isMoney(v) ? String(v) : null;
const isValidDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const expectedUrl = (url, hosts) => safeHttpsUrl(url, hosts);
const allowedBooking = ['booking.com'];
const allowedSkyscanner = ['skyscnr.com','skyscanner.net'];

export function officialLiveSupplierStatus(env = process.env) {
  const booking = /^\d+$/.test(text(env.BOOKING_AFFILIATE_ID)) && Boolean(text(env.BOOKING_DEMAND_API_KEY));
  const flights = Boolean(text(env.SKYSCANNER_API_KEY));
  return [
    {id:'booking-demand-mcp', kind:'hotel', state:booking?'CREDENTIALS_CONFIGURED_NOT_LIVE_VERIFIED':'PARTNER_CREDENTIALS_REQUIRED',
      official_endpoint:OFFICIAL_BOOKING_MCP, credentials_present:booking},
    {id:'skyscanner-flights-live-api',kind:'flight',state:flights?'CREDENTIALS_CONFIGURED_NOT_LIVE_VERIFIED':'PARTNER_CREDENTIALS_REQUIRED',
      official_endpoint:OFFICIAL_SKYSCANNER_API,credentials_present:flights}
  ];
}

/** Actual official Booking.com MCP SDK transport, created only at the moment of live query.
 * Do not hard-code tool names without checking tools/list first. */
async function openBookingMcp({affiliateId,apiKey}) {
  const [{Client},{StreamableHTTPClientTransport}] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  ]);
  const client = new Client({name:'jh167-guided-reservation',version:'0.3.0'},{capabilities:{}});
  const transport = new StreamableHTTPClientTransport(new URL(OFFICIAL_BOOKING_MCP),{
    requestInit:{headers:{'x-booking-affiliate-id':affiliateId,
      'x-booking-authorization':apiKey}}
  });
  await client.connect(transport);
  return {
    async listTools(args={}) { return client.listTools(args); },
    async callTool(args) { return client.callTool(args); },
    async close() { await client.close(); }
  };
}

function unwrapMcpResult(result) {
  if (result?.isError===true) throw code('OFFICIAL_MCP_TOOL_ERROR');
  const structured=result?.structuredContent;
  if (structured && typeof structured==='object') return structured;
  const part=(result?.content||[]).find(x=>x.type==='text'&&typeof x.text==='string');
  if(!part) throw code('OFFICIAL_MCP_RESPONSE_UNREADABLE');
  try { return JSON.parse(part.text); } catch { throw code('OFFICIAL_MCP_RESPONSE_UNREADABLE'); }
}

/** Map current Booking MCP tool schema and only run if the required fields are understood. */
function accommodationArguments(schema, r, env) {
  if(!isValidDate(r.check_in)||!isValidDate(r.check_out)||r.check_out<=r.check_in||
     !Number.isInteger(r.adults)||r.adults<1||r.adults>20||
     !Number.isInteger(r.rooms)||r.rooms<1||r.rooms>10||!text(r.location)) throw code('INVALID_HOTEL_CONDITIONS');
  if(!schema || typeof schema!=='object' || !schema.properties) throw code('BOOKING_MCP_SCHEMA_UNAVAILABLE');
  const supplied={checkin_date:r.check_in,checkout_date:r.check_out,
    destination:text(r.location_en)||text(r.location), number_of_adults:r.adults,number_of_rooms:r.rooms,
    user_country_code:text(r.user_country_code)||text(env.BOOKING_USER_COUNTRY_CODE)||'kr',
    user_locale:text(r.user_locale)||'ko-KR'};
  if(/^[A-Z]{3}$/.test(text(r.currency))) supplied.currency=r.currency;
  const properties=schema.properties;
  for(const required of schema.required||[]) if(!(required in supplied) || !(required in properties))
    throw code('BOOKING_MCP_SCHEMA_CHANGED');
  const args={};
  for(const [k,v] of Object.entries(supplied)) if(k in properties) args[k]=v;
  for(const k of ['checkin_date','checkout_date','destination','number_of_adults','number_of_rooms','user_country_code']) {
    if(!(k in properties))throw code('BOOKING_MCP_SCHEMA_CHANGED');
  }
  return args;
}

export function createBookingDemandMcpSupplier({env=process.env,openClient=openBookingMcp,clock=()=>new Date(),maxResults=15}={}) {
  const affiliateId=text(env.BOOKING_AFFILIATE_ID),apiKey=text(env.BOOKING_DEMAND_API_KEY);
  if(!/^\d+$/.test(affiliateId)||!apiKey) return null;
  return {
    id:'booking-demand-mcp', kinds:['hotel'], allowed_booking_hosts:allowedBooking, trusted_live:true,
    async search(request,{mode}={}) {
      if(mode!=='READ_AVAILABILITY_ONLY'||request?.kind!=='hotel')throw code('READ_ONLY_SCOPE_REQUIRED');
      const {requirements:r}=request;
      const client=await openClient({affiliateId,apiKey});
      try {
        let cursor,tool=null;
        for(let i=0;i<5;i++){
          const page=await client.listTools(cursor?{cursor}:{});
          tool=(page.tools||[]).find(t=>t.name==='accommodations_search')||tool;
          cursor=page.nextCursor;
          if(tool||!cursor) break;
        }
        if(!tool)throw code('BOOKING_MCP_TOOL_NOT_ENABLED');
        const args=accommodationArguments(tool.inputSchema,r,env);
        const result=unwrapMcpResult(await client.callTool({name:tool.name,arguments:args}));
        const hotels=result.accommodations??result.result?.accommodations;
        if(!Array.isArray(hotels))throw code('BOOKING_MCP_RESPONSE_SCHEMA_CHANGED');
        const checked=immutable(r),at=clock().toISOString();
        return hotels.slice(0,maxResults).flatMap((h,index)=>{
          const url=expectedUrl(h?.url,allowedBooking);
          if(!url||!text(h?.name))return [];
          const total=money(h?.price?.book),currency=text(h?.price?.currency);
          return [{kind:'hotel',offer_id:String(h.id??index),title:h.name,availability:'AVAILABLE',
            checked_requirements:checked, observed_at:at,
            source_ref:`booking-mcp:accommodations_search:${digest([args,h.id,url,at])}`,
            booking_url:url, subtitle:text(h?.location?.city_name)||null,
            quote:total&&/^[A-Z]{3}$/.test(currency)?
              {total_amount:total,currency,price_basis:'requested_stay_or_party',includes_all_fees:null}:null
          }];
        });
      } finally { await client.close(); }
    }
  };
}

const factor={PRICE_UNIT_WHOLE:1n,PRICE_UNIT_CENTI:100n,PRICE_UNIT_MILLI:1000n,PRICE_UNIT_MICRO:1000000n};
/** Integer-safe price scale; unknown units must not be guessed. */
export function fromSkyscannerPrice(price) {
  const denom=factor[price?.unit];
  if(!denom || typeof price?.amount!=='string' || !/^\d+$/.test(price.amount))return null;
  const amount=BigInt(price.amount);
  const scaled=amount*100n/denom;
  const result=scaled/100n+'.'+String(scaled%100n).padStart(2,'0');
  return result.replace(/\.00$/,'');
}

function skyQuery(r,env){
  if(!isValidDate(r.departure_date)||!Number.isInteger(r.passengers)||r.passengers<1||r.passengers>8)
    throw code('INVALID_FLIGHT_CONDITIONS');
  const origin=text(r.origin_iata||r.origin).toUpperCase();
  const dest=text(r.destination_iata||r.destination).toUpperCase();
  if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(dest)||origin===dest)throw code('AIRPORT_IATA_REQUIRED');
  const mk=(from,to,date)=>({originPlaceId:{iata:from},destinationPlaceId:{iata:to},
    date:{year:Number(date.slice(0,4)),month:Number(date.slice(5,7)),day:Number(date.slice(8,10))}});
  const queryLegs=[mk(origin,dest,r.departure_date)];
  if(r.return_date){if(!isValidDate(r.return_date)||r.return_date<r.departure_date)throw code('INVALID_RETURN_DATE');
    queryLegs.push(mk(dest,origin,r.return_date));}
  return {query:{market:text(env.SKYSCANNER_MARKET)||'KR',locale:text(env.SKYSCANNER_LOCALE)||'ko-KR',
    currency:/^[A-Z]{3}$/.test(text(r.currency))?r.currency:'KRW',queryLegs,adults:r.passengers,
    cabinClass:({'economy':'CABIN_CLASS_ECONOMY','business':'CABIN_CLASS_BUSINESS','first':'CABIN_CLASS_FIRST'}[r.cabin_class]||'CABIN_CLASS_ECONOMY')}};
}

function normalizeSky(response, request, clock, cap=10) {
  const itineraries=response?.content?.results?.itineraries;
  if(!itineraries||typeof itineraries!=='object'||Array.isArray(itineraries))return [];
  const at=clock().toISOString(), req=immutable(request.requirements);
  const results=[];
  for(const [id,iti] of Object.entries(itineraries)){
    for(const [j,offer] of (iti?.pricingOptions||[]).entries()){
      const items=offer?.items;
      // Multiple payment links in a combined itinerary cannot be represented by a single safe booking link.
      if(!Array.isArray(items)||items.length!==1)continue;
      const url=expectedUrl(items[0]?.deepLink,allowedSkyscanner);
      if(!url)continue;
      const currency=text(response?.content?.query?.currency)||text(response?.query?.currency)||
        text(request.requirements.currency)||'KRW';
      const price=fromSkyscannerPrice(items[0]?.price||offer.price);
      results.push({offer_id:`${id}:${j}`,kind:'flight',title:`${req.origin} → ${req.destination} (${req.departure_date})`,
        availability:'AVAILABLE',checked_requirements:req,observed_at:at,
        source_ref:`skyscanner:live:${digest([response.sessionToken,id,j,at])}`,
        booking_url:url,
        quote:price&&/^[A-Z]{3}$/.test(currency)?{total_amount:price,currency,
          price_basis:'requested_stay_or_party',includes_all_fees:null}:null,
        terms:'항공사·대행사 운임과 수하물, 수수료는 결제 화면에서 재확인'});
      if(results.length>=cap)return results;
    }
  }
  return results;
}

export function createSkyscannerLiveSupplier({env=process.env,fetchImpl=globalThis.fetch,clock=()=>new Date(),pollLimit=2}={}) {
  const apiKey=text(env.SKYSCANNER_API_KEY);
  if(!apiKey) return null;
  return {id:'skyscanner-flights-live-api',kinds:['flight'],allowed_booking_hosts:allowedSkyscanner,trusted_live:true,
    async search(request,{mode}={}) {
      if(mode!=='READ_AVAILABILITY_ONLY'||request?.kind!=='flight')throw code('READ_ONLY_SCOPE_REQUIRED');
      const body=skyQuery(request.requirements,env);
      const fetchJSON=async(url,payload)=>{
        const response=await fetchImpl(url,{method:'POST',headers:{'x-api-key':apiKey,'Content-Type':'application/json'},
          body:JSON.stringify(payload),signal:AbortSignal.timeout(14000),redirect:'error'});
        if(!response?.ok)throw code('SKYSCANNER_HTTP_ERROR_'+String(response?.status??'UNKNOWN'));
        return response.json();
      };
      let result=await fetchJSON(OFFICIAL_SKYSCANNER_API+'/create',body);
      let offers=normalizeSky(result,request,clock);
      const token=result?.sessionToken;
      if(token&&/^[a-zA-Z0-9_\-]{1,600}$/.test(token)) {
        for(let i=0;i<pollLimit;i++){
          if(result.status==='RESULT_STATUS_COMPLETE')break;
          result=await fetchJSON(OFFICIAL_SKYSCANNER_API+'/poll/'+encodeURIComponent(token),{});
          if(result?.action!=='RESULT_ACTION_NOT_MODIFIED'){
            const more=normalizeSky(result,request,clock);
            if(result.action==='RESULT_ACTION_REPLACED')offers=more;
            else {const ids=new Set(offers.map(x=>x.offer_id));for(const o of more)if(!ids.has(o.offer_id))offers.push(o);}
          }
        }
      }
      return offers.slice(0,10);
    }
  };
}

/** Suppliers run in the JH SERVER, not in ChatGPT or the Android client. */
export function createOfficialLiveSuppliers(options={}) {
  return [createBookingDemandMcpSupplier(options.booking||options),
    createSkyscannerLiveSupplier(options.skyscanner||options)].filter(Boolean);
}

export function normalizeOfficialLiveForDisplay(provider, request, offers, atMs=Date.now()) {
  // Host-safe output for read-only discovery when the JH command is bound but no generation is
  // exposed by the deployed host. Never fake the JH generation/plan_revision.
  const allow=provider.allowed_booking_hosts;
  return (Array.isArray(offers)?offers:[]).slice(0,15).flatMap(o=>{
    const url=expectedUrl(o.booking_url,allow);
    const parsed=Date.parse(o.observed_at||'');
    const same=JSON.stringify(o.checked_requirements)===JSON.stringify(request.requirements);
    const fresh=Number.isFinite(parsed) && atMs-parsed>=-30000 && atMs-parsed<=120000;
    if(!url||!same||!fresh||!o.source_ref||o.kind!==request.kind)return [];
    const price=o.quote&&money(o.quote.total_amount)&&/^[A-Z]{3}$/.test(o.quote.currency||'')?
      {amount:o.quote.total_amount,currency:o.quote.currency,all_fees_confirmed:o.quote.includes_all_fees===true}:null;
    return [{title:o.title,offer_id:o.offer_id,provider_id:provider.id,availability:'PROVIDER_REPORTED_AVAILABLE',
      checked_requirements:immutable(o.checked_requirements),observed_at:o.observed_at,source_ref:o.source_ref,
      booking_url:url,quote:price,confirmed_booking:false,external_effect_status:'NOT_EXECUTED',
      note:'예약처 결제 직전 좌석·객실·수수료를 반드시 재확인'}];
  });
}
