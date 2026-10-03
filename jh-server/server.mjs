
import { createServer } from "node:http";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);
const BROWSER_MCP = "http://life-browser-agent.railway.internal:8931/mcp";

const devices = new Map();
const queues = new Map();
const jobs = new Map();
let seq = 0;
let activeDeviceId = null;
let browserSessionId = null;
let browserInitialized = false;
let lastRegisterDiag={seen:false};
const recentJobs=new Map();
const recentWeb=new Map();
const DEDUPE_MS=8000;
const JOB_TTL_MS=90*1000;
const COMPLETED_JOB_RETENTION_MS=10*60*1000;
const SECURE56_VERSION=56;
const SECURE56_SESSION_MS=30*60*1000;
const SECURE56_JOB_MS=45*1000;
const SECURE56_FRAME_MS=45*1000;
const SECURE56_MAX_FRAME=2*1024*1024;
const SECURE56_TOOL_CATALOG_DIGEST="a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1";
function sha56(v){return createHash("sha256").update(typeof v==="string"?v:Buffer.from(v)).digest("hex");}
function hmac56(secret,msg){return createHmac("sha256",secret).update(msg).digest("hex");}
function eqHex56(a,b){try{if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));}catch{return false;}}
function mcpCallerAuthorized56(req){
  const auth=String(req.headers["authorization"]||"");
  if(!auth.startsWith("Bearer "))return false;
  const got=auth.slice(7);
  const expected=String(process.env.LIFE_HUB_TOKEN||"");
  if(expected.length>=24){
    try{
      const a=Buffer.from(expected,"utf8"),b=Buffer.from(got,"utf8");
      if(a.length===b.length&&timingSafeEqual(a,b))return true;
    }catch{}
  }
  return oauthAccessAuthorized56(got);
}
function token56(n=18){return randomBytes(n).toString("base64url");}
function validToken56(v){return typeof v==="string"&&/^[A-Za-z0-9_-]{16,160}$/.test(v);}
function validHex56(v){return typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);}
function stable56(v){
  if(v===null||v===undefined)return "null";
  if(Array.isArray(v))return "["+v.map(stable56).join(",")+"]";
  if(typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable56(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
const PUBLIC_BASE_URL=String(process.env.PUBLIC_BASE_URL||"").replace(/\/+$/,"");
const OAUTH_SCOPE56="jh.secure";
const OAUTH_ACCESS_MS56=60*60*1000;
const OAUTH_REFRESH_MS56=30*24*60*60*1000;
const oauthCodes56=new Map();
const oauthAccess56=new Map();
const oauthRefresh56=new Map();
function purgeOAuth56(){
  const now=Date.now();
  for(const [k,v] of oauthCodes56)if(now>v.expiresAt)oauthCodes56.delete(k);
  for(const [k,v] of oauthAccess56)if(now>v.expiresAt)oauthAccess56.delete(k);
  for(const [k,v] of oauthRefresh56)if(now>v.expiresAt)oauthRefresh56.delete(k);
}
function oauthAccessAuthorized56(token){
  if(typeof token!=="string"||token.length<20)return false;
  purgeOAuth56();
  const x=oauthAccess56.get(sha56("oauth-access|"+token));
  return !!x&&x.expiresAt>Date.now()&&x.scope===OAUTH_SCOPE56;
}
function validChatGptClient56(v){
  return v==="https://chatgpt.com/oauth/client.json"||/^https:\/\/chatgpt\.com\/oauth\/[A-Za-z0-9_-]+\/client\.json$/.test(String(v||""));
}
function validChatGptRedirect56(v){
  return v==="https://chatgpt.com/connector_platform_oauth_redirect"||/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(String(v||""));
}
function validOAuthResource56(v){return v===PUBLIC_BASE_URL||v===PUBLIC_BASE_URL+"/mcp";}
function escHtml56(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function oauthAuthorizeValid56(p){
  return p.response_type==="code"&&validChatGptClient56(p.client_id)&&validChatGptRedirect56(p.redirect_uri)&&
    p.code_challenge_method==="S256"&&typeof p.code_challenge==="string"&&/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)&&
    validOAuthResource56(p.resource);
}
function oauthTokenResponse56(){
  const access="at56_"+token56(32),refresh="rt56_"+token56(32),now=Date.now();
  oauthAccess56.set(sha56("oauth-access|"+access),{expiresAt:now+OAUTH_ACCESS_MS56,scope:OAUTH_SCOPE56});
  oauthRefresh56.set(sha56("oauth-refresh|"+refresh),{expiresAt:now+OAUTH_REFRESH_MS56,scope:OAUTH_SCOPE56});
  return {access_token:access,token_type:"Bearer",expires_in:Math.floor(OAUTH_ACCESS_MS56/1000),refresh_token:refresh,scope:OAUTH_SCOPE56};
}
const SERVER_IDENTITY_DIGEST56=sha56((PUBLIC_BASE_URL||"https://unset.invalid")+"/mcp|jh-secure-bridge56");
const secureStates56=new Map();
const frameWaiters56=new Map();
function state56(deviceId){let s=secureStates56.get(deviceId);if(!s){s={active:null,pending:new Map()};secureStates56.set(deviceId,s);}purge56(s);return s;}
function wipeSession56(s){try{s?.secret?.fill(0);}catch{}}
function purge56(s){const now=Date.now();if(s.active&&now>s.active.expiresAt){wipeSession56(s.active);s.active=null;}for(const [k,p] of s.pending){if(now>p.expiresAt){wipeSession56(p);s.pending.delete(k);}}}
function active56(deviceId){const s=secureStates56.get(deviceId);if(!s)return null;purge56(s);return s.active;}
function seen56(set,nonce){if(set.has(nonce))return false;set.add(nonce);while(set.size>512)set.delete(set.values().next().value);return true;}
function sessionDigest56(x){return sha56(x.deviceDigest+"|"+SERVER_IDENTITY_DIGEST56+"|PUBLIC_HTTPS_PROXY|unified-dev-checkpoint.56|"+SECURE56_TOOL_CATALOG_DIGEST+"|56|"+x.sessionId+"|"+x.expiresAt);}
function payloadDigest56(p){return sha56(stable56(p||{}));}
function signJob56(j,p){
  const a=active56(j.targetDeviceId);if(!a)return j;
  const nonce=token56(),expiresAt=Date.now()+SECURE56_JOB_MS,pd=payloadDigest56(p);
  Object.assign(j,{secureSessionId:a.sessionId,secureNonce:nonce,secureExpiresAt:expiresAt,securePayloadDigest:pd,secureMac:hmac56(a.secret,a.sessionId+"|"+j.id+"|"+j.type+"|"+nonce+"|"+expiresAt+"|"+pd)});
  return j;
}
function safeJobView56(j){
  if(!j)return {error:"not found"};
  if(!j.secureSessionId)return j;
  return {idDigest:sha56(j.id),type:j.type,status:j.status,result:j.result??null,error:j.error??null,completedAt:j.completedAt??null,targetDeviceDigest:j.targetDeviceDigest??null};
}
function secureResult56(j){return textResult(safeJobView56(j));}
function computerPayload56(a={}){
  const p={taskId:String(a.task_id||""),effect:String(a.effect||"READ_ONLY"),action:String(a.action||"").toUpperCase(),index:Number(a.index||0),viewportWidth:Number(a.viewport_width||0),viewportHeight:Number(a.viewport_height||0),scrollX:Number(a.scroll_x||0),scrollY:Number(a.scroll_y||0),waitMs:Number(a.wait_ms||0),dataClass:String(a.data_class||"NONE").toUpperCase(),maxActionsInCall:Number(a.max_actions_in_call||20)};
  for(const [sk,dk] of [["x","x"],["y","y"],["text_digest","textDigest"],["text_value","textValue"],["based_on_screenshot_digest","basedOnScreenshotDigest"],["current_screenshot_digest","currentScreenshotDigest"],["screen_grant_token","screenGrantToken"],["action_approval_grant_token","actionApprovalGrantToken"],["request_token","requestToken"],["run_digest","runDigest"]])if(a[sk]!==undefined&&a[sk]!==null&&String(a[sk])!=="")p[dk]=a[sk];
  if(Array.isArray(a.keys))p.keys=a.keys.slice(0,4).map(String);
  if(Array.isArray(a.drag_path))p.dragPath=a.drag_path.slice(0,32).map(q=>({x:Number(q.x),y:Number(q.y)}));
  return p;
}
function exactEnvelope56(mcpToolName,jobType,secureRequestedEffect,args,extra={}){
  const d=chooseDevice(args?.device_id||null);if(!d)return {error:"no_active_android_device"};
  const meta=devices.get(d);if(!meta||meta.secureBridgeVersion!==56||!active56(d))return {error:"secure_bridge_device_not_active",deviceDigest:meta?.deviceDigest||null};
  const taskDigest=String(args?.task_digest||"");if(!validHex56(taskDigest))return {error:"task_digest_required"};
  const cred=String(args?.data_class||"NONE").toUpperCase()==="SECRET";
  if(cred)return {error:"credential_class_never_crosses_secure_bridge"};
  const p={...computerPayload56(args),...extra,mcpToolName,taskDigest,targetDeviceDigest:meta.deviceDigest,secureRequestedEffect,secureInvocationExpiresAt:Date.now()+SECURE56_JOB_MS,containsCredential:false};
  return {deviceId:d,p,job:mk(jobType,p,d)};
}
function secureCall56(mcpToolName,jobType,effect,args,extra={}){
  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));
  return waitJob(x.job,15000).then(secureResult56);
}
function cleanFrameWaiters56(){const now=Date.now();for(const [k,w] of frameWaiters56){if(now>w.expiresAt){frameWaiters56.delete(k);try{w.resolve(null);}catch{}}}}
function createFrameWaiter56(deviceId,taskDigest){cleanFrameWaiters56();if(frameWaiters56.size>=4)return null;const lease=token56(24),expiresAt=Date.now()+SECURE56_FRAME_MS;let resolve;const promise=new Promise(r=>{resolve=r;});frameWaiters56.set(lease,{deviceId,taskDigest,expiresAt,resolve});return {lease,expiresAt,promise};}
async function awaitFrame56(w,ms=15000){const timeout=new Promise(r=>setTimeout(()=>r(null),ms));const frame=await Promise.race([w.promise,timeout]);frameWaiters56.delete(w.lease);return frame;}

function cleanupJobs(){
  const now=Date.now();
  for(const [id,j] of jobs){
    const born=Number(j.createdAtMs||j.startedAtMs||now);
    if((j.status==="queued"||j.status==="in_progress") && now-born>JOB_TTL_MS){j.status="expired";j.error="job_timeout";j.completedAt=new Date().toISOString();}
    if((j.status==="complete"||j.status==="error"||j.status==="expired") && j.completedAt && now-Date.parse(j.completedAt)>COMPLETED_JOB_RETENTION_MS)jobs.delete(id);
  }
  for(const [d,q] of queues)queues.set(d,q.filter(id=>jobs.get(id)?.status==="queued"));
}
function cacheGet(m,k){const x=m.get(k);if(!x)return null;if(Date.now()-x.t>DEDUPE_MS){m.delete(k);return null;}return x.v;}
function cacheSet(m,k,v){m.set(k,{t:Date.now(),v});return v;}

function reg(d,m={}) {
  devices.set(d,{...(devices.get(d)||{}),...m,lastSeen:Date.now()});
  if(!queues.has(d)) queues.set(d,[]);
}
function recentDevices(maxAgeMs=90000){
  const now=Date.now();
  return [...devices.entries()]
    .filter(([,m])=>now-(m?.lastSeen||0)<=maxAgeMs)
    .sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));
}
function chooseDevice(explicit=null){
  if(explicit && devices.has(explicit)) return explicit;
  if(activeDeviceId && devices.has(activeDeviceId)){
    const m=devices.get(activeDeviceId);
    if(Date.now()-(m?.lastSeen||0)<=90000) return activeDeviceId;
  }
  const recent=recentDevices();
  return recent.length?recent[0][0]:null;
}
function mk(type,p={},deviceId=null) {
  const targetDeviceId=chooseDevice(deviceId);
  const key=targetDeviceId+"|"+type+"|"+JSON.stringify(p||{});
  const old=cacheGet(recentJobs,key); if(old) return old;
  const now=Date.now();
  const id="job_"+(++seq), j={id,type,status:"queued",targetDeviceId,createdAtMs:now,expiresAtMs:now+JOB_TTL_MS,...p};
  signJob56(j,p);
  jobs.set(id,j);
  if(targetDeviceId){
    if(!queues.has(targetDeviceId)) queues.set(targetDeviceId,[]);
    queues.get(targetDeviceId).push(id);
  } else {
    j.status="error";
    j.error="no active Android device";
  }
  return cacheSet(recentJobs,key,j);
}
async function waitJob(j,ms=30000){
  const end=Date.now()+ms;
  while(Date.now()<end){
    cleanupJobs();
    const x=jobs.get(j.id);
    if(x && ["complete","error","expired"].includes(x.status))return x;
    await new Promise(r=>setTimeout(r,300));
  }
  cleanupJobs();
  return jobs.get(j.id);
}
function textResult(v){
  return {content:[{type:"text",text:typeof v==="string"?v:JSON.stringify(v)}]};
}
function jobResult(j){
  return textResult(safeJobView56(j));
}

async function parseMcp(res){
  const body=await res.text();
  if(!res.ok) throw new Error("browser MCP "+res.status+" "+body.slice(0,200));
  const ct=res.headers.get("content-type")||"";
  if(ct.includes("text/event-stream")){
    const lines=body.split(/\r?\n/).filter(x=>x.startsWith("data:"));
    if(!lines.length) return {};
    return JSON.parse(lines[lines.length-1].slice(5).trim());
  }
  return body ? JSON.parse(body) : {};
}
async function browserRpc(method,params={},retry=true){
  if(method!=="initialize" && !browserInitialized) await ensureBrowser();
  const headers={
    "content-type":"application/json",
    "accept":"application/json, text/event-stream",
    "mcp-protocol-version":"2025-03-26"
  };
  if(browserSessionId) headers["mcp-session-id"]=browserSessionId;
  const res=await fetch(BROWSER_MCP,{
    method:"POST",
    headers,
    body:JSON.stringify({jsonrpc:"2.0",id:Math.floor(Math.random()*1000000)+1,method,params})
  });
  if((res.status===404||res.status===400) && retry && method!=="initialize"){
    browserSessionId=null; browserInitialized=false;
    await ensureBrowser();
    return browserRpc(method,params,false);
  }
  const sid=res.headers.get("mcp-session-id");
  if(sid) browserSessionId=sid;
  return parseMcp(res);
}
async function ensureBrowser(){
  if(browserInitialized) return;
  const headers={
    "content-type":"application/json",
    "accept":"application/json, text/event-stream"
  };
  const res=await fetch(BROWSER_MCP,{
    method:"POST",headers,
    body:JSON.stringify({
      jsonrpc:"2.0",id:1,method:"initialize",
      params:{
        protocolVersion:"2025-03-26",
        capabilities:{},
        clientInfo:{name:"korean-life-hub",version:"1.0.0"}
      }
    })
  });
  const sid=res.headers.get("mcp-session-id");
  if(sid) browserSessionId=sid;
  await parseMcp(res);
  const h={
    "content-type":"application/json",
    "accept":"application/json, text/event-stream",
    "mcp-protocol-version":"2025-03-26"
  };
  if(browserSessionId) h["mcp-session-id"]=browserSessionId;
  await fetch(BROWSER_MCP,{
    method:"POST",headers:h,
    body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized",params:{}})
  });
  browserInitialized=true;
}
async function browserTool(name,args={}){
  const key=name+"|"+JSON.stringify(args||{});
  const old=cacheGet(recentWeb,key); if(old) return old;
  const r=await browserRpc("tools/call",{name,arguments:args});
  if(r?.error) throw new Error(r.error.message||"browser tool failed");
  return cacheSet(recentWeb,key,r?.result ?? r);
}

function createMcp(){
  const server=new McpServer({name:"JH",version:"1.4.0-fix4-oauth"});

  server.registerTool("life_status",{
    title:"JH status",
    description:"Diagnostic only. Avoid during normal open/search flows to reduce rate-limit risk.",
    inputSchema:{}
  },async()=>{
    let browser="unknown";
    try{ await ensureBrowser(); browser="ready"; }catch(e){ browser="error: "+e.message; }
    return textResult({version:"1.4.0-fix4-oauth",browser,registeredAndroidDevices:devices.size,secureBridgeVersion:56});
  });

  server.registerTool("life_route",{
    title:"Choose execution route",
    description:"Optional classifier only. Do not call before ordinary open/search requests. Directly call the execution tool to minimize MCP requests.",
    inputSchema:{request:z.string()}
  },async({request})=>{
    const raw=String(request||"");
    const s=raw.toLowerCase();
    const reservationHints=["예약","예매","예약해","예약 진행","book ","booking","reserve","reservation"];
    const restaurantHints=["맛집","식당","음식점","레스토랑","restaurant","dining","뭐 먹","먹을 곳","먹을곳"];
    const nativeHints=["카카오톡","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];
    const isReservation=reservationHints.some(k=>s.includes(k));
    const isRestaurant=restaurantHints.some(k=>s.includes(k));
    const owner=isReservation&&isRestaurant?"restaurant_reservation":(!isReservation&&isRestaurant?"sikindaero_search":(isReservation?"reservation_0_8":(nativeHints.some(k=>s.includes(k))?"android":"web")));
    const rule=owner==="sikindaero_search"
      ?"Restaurant discovery/search only: use 시킨대로 먹어 (https://sikindaero-meogeo.uro3182.chatgpt.site). Do NOT perform reservations inside 시킨대로 먹어."
      :owner==="restaurant_reservation"
      ?"Restaurant booking only: perform the actual reservation through Naver Reservation or Catchtable. Prefer the service that supports the selected restaurant; if both support it, either is valid. Do not route restaurant booking to 시킨대로 먹어."
      :isReservation
      ?"Use 한국형 생활 예약 0.8 MCP for non-restaurant reservation/booking workflow. Do not duplicate booking execution in this hub."
      :(owner==="web"?"Use Playwright as the primary web execution engine: navigate -> snapshot -> interact -> re-snapshot.":"Use Android only when the requested action requires a native app.");
    return textResult({owner,rule,request:raw});
  });

  server.registerTool("life_open_service",{
    title:"Open a service",
    description:"ONE-CALL tool for simple service-open requests. Do not call status or route first. Browser-capable services use Playwright; native-only services use the selected Android device.",
    inputSchema:{service:z.string()}
  },async({service})=>{
    const raw=String(service||"").trim();
    const s=raw.toLowerCase();
    const webMap=[
      [["라프텔","laftel"],"https://laftel.net"],
      [["유튜브","youtube"],"https://www.youtube.com"],
      [["네이버 메일","네이버메일","메일함"],"https://mail.naver.com/"],
      [["시킨대로 먹어","시킨대로먹어","식당 검색","맛집 검색"],"https://sikindaero-meogeo.uro3182.chatgpt.site"],
      [["캐치테이블","catchtable"],"https://app.catchtable.co.kr/"],
      [["네이버 예약","네이버예약"],"https://search.naver.com/search.naver?query=%EB%84%A4%EC%9D%B4%EB%B2%84%20%EC%98%88%EC%95%BD"],
      [["네이버 지도","네이버지도"],"https://map.naver.com/"],
      [["네이버 웹툰","네이버웹툰"],"https://comic.naver.com/"],
      [["네이버","naver"],"https://www.naver.com"],
      [["다음","daum"],"https://www.daum.net"],
      [["여기어때"],"https://www.goodchoice.kr"],
      [["야놀자"],"https://www.yanolja.com"],
      [["넷플릭스","netflix"],"https://www.netflix.com"],
      [["티빙","tving"],"https://www.tving.com"]
    ];
    if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k))){
      const j=mk("open_url",{target:"카카오T",url:"카카오T"});
      return textResult({route:"android",service:raw,queued:true,jobId:j.id,registeredDevices:devices.size});
    }
    for(const [keys,url] of webMap){
      if(keys.some(k=>s.includes(k))){
        return textResult({route:"playwright",service:raw,url,result:await browserTool("browser_navigate",{url})});
      }
    }
    return textResult({route:"unknown",service:raw,instruction:"Use life_web_navigate with a known web URL when browser-capable; use life_android_open only if the service is truly native-app-only."});
  });

  server.registerTool("life_naver_mail",{
    title:"Naver Mail — Playwright only",
    description:"Use this for ANY Naver Mail request, including opening mail, reading folders, deleting mail, emptying Trash, searching mail, or other mailbox actions. This tool NEVER uses Android foreground/accessibility. It opens https://mail.naver.com/ in the persistent Playwright browser and reads the page so the workflow can continue even while ChatGPT is the phone foreground app.",
    inputSchema:{}
  },async()=>{
    const url="https://mail.naver.com/";
    const navigation=await browserTool("browser_navigate",{url});
    const snapshot=await browserTool("browser_snapshot",{});
    return textResult({route:"playwright",service:"네이버 메일",url,navigation,snapshot});
  });

  server.registerTool("life_web_navigate",{
    title:"Open website",
    description:"PRIMARY web route. Navigate the persistent Playwright browser to a URL. Prefer this for hotel, booking, shopping, search, maps, YouTube, and other browser-capable services. Do NOT use t.kakao.com as a browser destination; Kakao T is treated as a native-app route.",
    inputSchema:{url:z.string()}
  },async({url})=>{
    const u=String(url||"");
    if(/(^|\\.)t\\.kakao\\.com/i.test((()=>{try{return new URL(u).hostname}catch{return ""}})())){
      const j=mk("open_url",{target:"카카오T",url:"카카오T"});
      return textResult({routed:"android",reason:"t.kakao.com is not used as a normal browser destination",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId,registeredDevices:devices.size});
    }
    return textResult(await browserTool("browser_navigate",{url:u}));
  });

  server.registerTool("life_web_snapshot",{
    title:"Read web page",
    description:"Read the current Playwright page accessibility tree after navigation. Use this instead of screenshots for normal web interaction.",
    inputSchema:{target:z.string().optional(),depth:z.number().optional()}
  },async(args)=>textResult(await browserTool("browser_snapshot",args||{})));

  server.registerTool("life_web_click",{
    title:"Click web element",
    description:"Click a web element in the persistent Playwright browser using a target/ref or unique selector from the snapshot.",
    inputSchema:{
      target:z.string(),
      element:z.string().optional(),
      doubleClick:z.boolean().optional()
    }
  },async(args)=>textResult(await browserTool("browser_click",args)));

  server.registerTool("life_web_type",{
    title:"Type in web page",
    description:"Type into a web form in the persistent Playwright browser. Use the exact target returned by life_web_snapshot, then re-read the page.",
    inputSchema:{
      target:z.string(),
      text:z.string(),
      element:z.string().optional(),
      submit:z.boolean().optional(),
      slowly:z.boolean().optional()
    }
  },async(args)=>textResult(await browserTool("browser_type",args)));

  server.registerTool("life_web_select",{
    title:"Select web option",
    description:"Select one or more values from a dropdown in the persistent Playwright browser using the exact target from the latest snapshot.",
    inputSchema:{
      target:z.string(),
      values:z.array(z.string()),
      element:z.string().optional()
    }
  },async(args)=>textResult(await browserTool("browser_select_option",args)));

  server.registerTool("life_web_press_key",{
    title:"Press browser key",
    description:"Press a keyboard key in the Playwright browser, such as Enter, Escape, ArrowDown, or Tab.",
    inputSchema:{key:z.string()}
  },async(args)=>textResult(await browserTool("browser_press_key",args)));

  server.registerTool("life_web_wait",{
    title:"Wait for web page",
    description:"Wait briefly for a Playwright page or dynamic result to update, then use snapshot again.",
    inputSchema:{time:z.number()}
  },async(args)=>textResult(await browserTool("browser_wait",args)));

  server.registerTool("life_web_back",{
    title:"Go back in web page",
    description:"Go back one step in the persistent Playwright browser history.",
    inputSchema:{}
  },async()=>textResult(await browserTool("browser_navigate_back",{})));

  server.registerTool("life_web_screenshot",{
    title:"Capture web screenshot",
    description:"Capture a screenshot for visual verification. Use life_web_snapshot for actionable element references.",
    inputSchema:{}
  },async()=>textResult(await browserTool("browser_take_screenshot",{})));

  server.registerTool("life_android_devices",{
    title:"List Android devices",
    description:"List recently connected Android Bridge devices and show which device JH will target. JH sends Android jobs to exactly one selected device, never all devices.",
    inputSchema:{}
  },async()=>{
    const list=[...devices.entries()].map(([deviceId,m])=>({
      deviceId,
      lastSeen:m?.lastSeen||0,
      ageSeconds:Math.round((Date.now()-(m?.lastSeen||0))/1000),
      active:deviceId===chooseDevice()
    })).sort((a,b)=>a.ageSeconds-b.ageSeconds);
    return textResult({selectedDeviceId:chooseDevice(),configuredActiveDeviceId:activeDeviceId,devices:list});
  });

  server.registerTool("life_android_select_device",{
    title:"Select Android device",
    description:"Select exactly one Android Bridge device for screenshots, UI reads, clicks, typing, and app launches. Use a deviceId returned by life_android_devices.",
    inputSchema:{device_id:z.string()}
  },async({device_id})=>{
    if(!devices.has(device_id)) return textResult({ok:false,error:"device not found",deviceId:device_id});
    activeDeviceId=device_id;
    return textResult({ok:true,activeDeviceId});
  });

  server.registerTool("life_android_select_latest",{
    title:"Select latest Android device",
    description:"Select the most recently active Android Bridge device as the target for all Android actions.",
    inputSchema:{}
  },async()=>{
    const recent=recentDevices();
    if(!recent.length) return textResult({ok:false,error:"no recent Android device"});
    activeDeviceId=recent[0][0];
    return textResult({ok:true,activeDeviceId});
  });

  server.registerTool("life_android_open_and_snapshot",{
    title:"Open Android target and read foreground screen",
    description:"Native-app mobile workflow starter only. Do NOT use for Naver Mail or normal websites; those must use Playwright. Opens a native Android app on the selected device and then reads its accessibility screen.",
    inputSchema:{target:z.string(),url:z.string().optional()}
  },async({target,url})=>{
    const raw=String(target||url||"").trim().toLowerCase();
    if(["네이버 메일","네이버메일","메일함","naver mail","mail.naver.com"].some(k=>raw.includes(k))){
      const dest="https://mail.naver.com/";
      const navigation=await browserTool("browser_navigate",{url:dest});
      const snapshot=await browserTool("browser_snapshot",{});
      return textResult({route:"playwright",forced:true,reason:"Naver Mail is web-only in JH; Android foreground is not required.",url:dest,navigation,snapshot});
    }
    const openJob=mk("open_url",{target,url:url||target});
    if(openJob.status!=="queued") return jobResult(openJob);
    const opened=await waitJob(openJob,15000);
    let snap=null;
    for(let i=0;i<4;i++){
      const sj=mk("agent_snapshot",{},openJob.targetDeviceId);
      snap=await waitJob(sj,8000);
      const content=snap?.result;
      if(content && JSON.stringify(content).length>80) break;
      await new Promise(r=>setTimeout(r,350));
    }
    return textResult({opened,targetDeviceId:openJob.targetDeviceId,snapshot:snap});
  });

  server.registerTool("life_android_step_and_snapshot",{
    title:"Act on Android foreground screen and read result",
    description:"Preferred follow-up for mobile UI work. Perform one accessibility action on the current foreground app, then immediately read the updated screen in the same MCP call. This lets ChatGPT continue a multi-step phone workflow while the target app stays in front.",
    inputSchema:{
      action:z.string(),
      text:z.string().optional(),
      value:z.string().optional()
    }
  },async(args)=>{
    const stepJob=mk("agent_step",args);
    if(stepJob.status!=="queued") return jobResult(stepJob);
    const acted=await waitJob(stepJob,10000);
    let snap=null;
    for(let i=0;i<3;i++){
      const sj=mk("agent_snapshot",{},stepJob.targetDeviceId);
      snap=await waitJob(sj,7000);
      if(snap?.result && JSON.stringify(snap.result).length>80) break;
      await new Promise(r=>setTimeout(r,300));
    }
    return textResult({acted,targetDeviceId:stepJob.targetDeviceId,snapshot:snap});
  });

  server.registerTool("life_android_open",{
    title:"Open service",
    description:"Compatibility route. Browser-capable services, especially Naver Mail, are always rerouted to Playwright even if this tool is selected. Android is only for truly native-app-only functions such as Kakao T app control.",
    inputSchema:{target:z.string(),url:z.string().optional()}
  },async({target,url})=>{
    const raw=String(target||url||"").trim();
    const s=raw.toLowerCase();
    if(["last_work_screen","마지막 작업 화면","아까 화면","마지막 작업화면"].includes(s)){const j=mk("open_url",{target:"last_work_screen",url:""});return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}
    if(["chrome","browser","브라우저"].includes(s) && !url){const j=mk("open_url",{target:"chrome",url:""});return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}
    if((s.includes("앱")||s.includes("native")) && !url){const j=mk("open_url",{target:raw,url:""});return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}
    const webMap=[
      [["라프텔","laftel"],"https://laftel.net"],
      [["유튜브","youtube"],"https://www.youtube.com"],
      [["네이버 메일","네이버메일","메일함","naver mail"],"https://mail.naver.com/"],
      [["네이버 지도","네이버지도"],"https://map.naver.com/"],
      [["네이버 웹툰","네이버웹툰"],"https://comic.naver.com/"],
      [["네이버","naver"],"https://www.naver.com"],
      [["다음","daum"],"https://www.daum.net"],
      [["여기어때"],"https://www.goodchoice.kr"],
      [["야놀자"],"https://www.yanolja.com"],
      [["넷플릭스","netflix"],"https://www.netflix.com"],
      [["티빙","tving"],"https://www.tving.com"]
    ];
    for(const [keys,dest] of webMap){
      if(keys.some(k=>s.includes(k))){
        return textResult({route:"playwright",service:raw,url:dest,result:await browserTool("browser_navigate",{url:dest})});
      }
    }
    const u=String(url||"");
    if(/^https?:\/\//i.test(u) && !/t\.kakao\.com/i.test(u)){
      return textResult({route:"playwright",service:raw,url:u,result:await browserTool("browser_navigate",{url:u})});
    }
    const j=mk("open_url",{target:raw,url:u||raw});
    return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId,registeredDevices:devices.size});
  });

  const cuSchema56={
    device_id:z.string().optional(),task_digest:z.string(),run_digest:z.string().optional(),
    effect:z.enum(["READ_ONLY","REVERSIBLE_WRITE","IRREVERSIBLE"]).optional(),
    action:z.enum(["CLICK","DOUBLE_CLICK","SCROLL","TYPE","WAIT","KEYPRESS","DRAG","MOVE","SCREENSHOT"]),
    index:z.number().optional(),x:z.number().optional(),y:z.number().optional(),viewport_width:z.number().optional(),viewport_height:z.number().optional(),
    scroll_x:z.number().optional(),scroll_y:z.number().optional(),wait_ms:z.number().optional(),keys:z.array(z.string()).optional(),
    drag_path:z.array(z.object({x:z.number(),y:z.number()})).optional(),text_digest:z.string().optional(),text_value:z.string().optional(),
    data_class:z.enum(["NONE","PUBLIC","NON_SENSITIVE","PERSONAL","SENSITIVE","SECRET"]).optional(),
    based_on_screenshot_digest:z.string().optional(),current_screenshot_digest:z.string().optional(),
    screen_grant_token:z.string().optional(),screen_consent_digest:z.string().optional(),
    action_approval_grant_token:z.string().optional(),local_action_approval_digest:z.string().optional(),
    max_actions_in_call:z.number().optional()
  };
  server.registerTool("life_android_secure_status",{title:"Secure Android bridge status",description:"Read-only checkpoint56 status for the selected Android device. Requires an activated device-bound secure session.",inputSchema:{device_id:z.string().optional(),task_digest:z.string()}},async(args)=>secureCall56("life_android_secure_status","secure_device_status","READ_ONLY",args));
  server.registerTool("life_android_computer_inspect",{title:"Inspect Android Computer Use target",description:"Read-only exact Computer Use inspection. Does not click, type, scroll, or capture pixels.",inputSchema:cuSchema56},async(args)=>secureCall56("life_android_computer_inspect","computer_use_inspect","READ_ONLY",args));
  server.registerTool("life_android_computer_prepare",{title:"Prepare one Android Computer Use action",description:"Read-only planning for exactly one Android Computer Use action. Returns a short-lived action lease or a local approval/consent boundary.",inputSchema:cuSchema56},async(args)=>secureCall56("life_android_computer_prepare","computer_use_action_prepare","READ_ONLY",args,{screenConsentDigest:String(args.screen_consent_digest||""),localActionApprovalDigest:String(args.local_action_approval_digest||"")}));
  server.registerTool("life_android_action_approval_request",{title:"Request local approval for one Android action",description:"Creates a phone-local approval prompt for the exact prepared action. The server cannot approve it.",inputSchema:cuSchema56},async(args)=>secureCall56("life_android_action_approval_request","computer_use_action_approval_request","LOCAL_PROMPT",args));
  server.registerTool("life_android_action_approval_status",{title:"Read local Android action approval status",description:"Read-only status of a phone-local one-shot action approval.",inputSchema:{device_id:z.string().optional(),task_digest:z.string(),request_token:z.string()}},async(args)=>secureCall56("life_android_action_approval_status","computer_use_action_approval_status","READ_ONLY",args));
  server.registerTool("life_android_screen_consent_request",{title:"Request local screen sharing consent",description:"Creates a phone-local task-scoped screen sharing prompt. No pixels are captured until the user approves.",inputSchema:{device_id:z.string().optional(),task_digest:z.string(),run_digest:z.string(),max_frames:z.number().optional(),ttl_ms:z.number().optional()}},async(args)=>secureCall56("life_android_screen_consent_request","computer_use_screen_consent_request","LOCAL_PROMPT",args,{runDigest:String(args.run_digest||""),maxFrames:Number(args.max_frames||24),ttlMs:Number(args.ttl_ms||600000)}));
  server.registerTool("life_android_screen_consent_status",{title:"Read local screen consent status",description:"Read-only status for a task-scoped phone-local screen consent request.",inputSchema:{device_id:z.string().optional(),task_digest:z.string(),request_token:z.string()}},async(args)=>secureCall56("life_android_screen_consent_status","computer_use_screen_consent_status","READ_ONLY",args));
  server.registerTool("life_android_execute_computer_action",{title:"Execute one approved Android Computer Use action",description:"Executes exactly one prepared action on the current work window. Consequential/personal-data actions require a phone-local one-shot approval grant. SECRET data is never accepted.",inputSchema:{...cuSchema56,lease_token:z.string(),local_action_approval_digest:z.string().optional()}},async(args)=>secureCall56("life_android_execute_computer_action","computer_use_action_execute","MUTATION",args,{leaseToken:String(args.lease_token||""),localActionApprovalDigest:String(args.local_action_approval_digest||"")}));
  server.registerTool("life_android_capture_work_window",{
    title:"Capture the approved Android work window",
    description:"Captures one task-scoped work-window frame after phone-local screen consent. Pixels use a one-shot frame upload path and are never stored in the job-completion relay.",
    inputSchema:{...cuSchema56,run_digest:z.string(),screen_grant_token:z.string(),screen_consent_digest:z.string(),lease_token:z.string()}
  },async(args)=>{
    const d=chooseDevice(args.device_id||null),meta=d?devices.get(d):null;
    if(!d||!meta||meta.secureBridgeVersion!==56||!active56(d))return textResult({ok:false,code:"secure_bridge_device_not_active"});
    if(!validHex56(String(args.task_digest||""))||!validHex56(String(args.run_digest||""))||!validHex56(String(args.screen_consent_digest||"")))return textResult({ok:false,code:"capture_scope_invalid"});
    const w=createFrameWaiter56(d,String(args.task_digest));if(!w)return textResult({ok:false,code:"frame_waiter_budget_exceeded"});
    const x=exactEnvelope56("life_android_capture_work_window","computer_use_capture_frame","READ_ONLY",args,{runDigest:String(args.run_digest),leaseToken:String(args.lease_token),screenGrantToken:String(args.screen_grant_token),screenConsentDigest:String(args.screen_consent_digest),frameUploadLease:w.lease});
    if(x.error){frameWaiters56.delete(w.lease);return textResult({ok:false,code:x.error});}
    const [jr,frame]=await Promise.all([waitJob(x.job,15000),awaitFrame56(w,15000)]);
    const metaOut=safeJobView56(jr);if(!frame)return textResult({ok:false,code:"secure_frame_missing",job:metaOut});
    const fd=sha56(frame),data=frame.toString("base64");frame.fill(0);
    return {content:[{type:"text",text:JSON.stringify({ok:true,job:metaOut,frameDigest:fd,persisted:false})},{type:"image",data,mimeType:"image/png"}]};
  });

  server.registerTool("life_android_snapshot",{
    title:"Read Android UI",
    description:"Read Android accessibility UI for native-app-only workflows.",
    inputSchema:{}
  },async()=>{
    const j=mk("agent_snapshot");
    return jobResult(await waitJob(j));
  });

  server.registerTool("life_android_step",{
    title:"Control Android UI",
    description:"Perform a native Android accessibility action after reading the Android UI.",
    inputSchema:{
      action:z.string(),
      text:z.string().optional(),
      value:z.string().optional()
    }
  },async(args)=>{
    const j=mk("agent_step",args);
    return jobResult(await waitJob(j));
  });

  server.registerTool("open_on_android",{title:"Open Android target (compat)",description:"FIX3 compatibility alias. Preserves last_work_screen target-only.",inputSchema:{target:z.string(),url:z.string().optional()}},async({target,url})=>{const raw=String(target||"").trim(),low=raw.toLowerCase(),u=String(url||"");const last=["last_work_screen","마지막 작업 화면","아까 화면","마지막 작업화면"].includes(low);const j=mk("open_url",{target:last?"last_work_screen":raw,url:last?"":u});return textResult({queued:j.status==="queued",jobId:j.id,url:last?"last_work_screen":(u||raw),registeredDevices:devices.size});});
  server.registerTool("device_status",{title:"Android device status (compat)",description:"FIX3 compatibility alias.",inputSchema:{}},async()=>{const r=recentDevices();return textResult({registeredDevices:r.length,secureActive:r.filter(([,m])=>m?.secureActive).length});});
  server.registerTool("android_snapshot",{title:"Android snapshot (compat)",description:"FIX3 compatibility alias.",inputSchema:{}},async()=>{const j=mk("agent_snapshot");return jobResult(await waitJob(j));});
  server.registerTool("android_step",{title:"Android step (compat)",description:"FIX3 compatibility alias.",inputSchema:{action:z.string(),text:z.string().optional(),value:z.string().optional()}},async(args)=>{const j=mk("agent_step",args);return jobResult(await waitJob(j));});
  server.registerTool("job_status",{title:"Android job status (compat)",description:"FIX3 compatibility alias.",inputSchema:{job_id:z.string()}},async({job_id})=>{cleanupJobs();return jobResult(jobs.get(job_id));});

  server.registerTool("life_job_status",{
    title:"Android job status",
    description:"Read a queued Android job result.",
    inputSchema:{job_id:z.string()}
  },async({job_id})=>jobResult(jobs.get(job_id)));

  return server;
}

const httpServer=createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");

  if(req.method==="GET" && url.pathname==="/diag/register"){
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify(lastRegisterDiag));
    return;
  }

  if(req.method==="GET" && url.pathname==="/health"){
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({ok:true,version:"1.4.0-fix4-oauth",secureBridgeVersion:56,mcpCallerAuth:"oauth21_pkce",devices:devices.size,browserSession:!!browserSessionId}));
    return;
  }

  if(req.method==="POST" && url.pathname==="/device/register"){
    let b=""; for await (const ch of req) b+=ch;
    const j=JSON.parse(b||"{}");
    if(!j.deviceId){res.writeHead(400).end("deviceId required");return;}
    const secureIntent=Number(j.secureBridgeVersion)===56 || (!!j.deviceDigest && !!j.clientNonce && !!j.toolCatalogDigest);
    lastRegisterDiag={seen:true,at:new Date().toISOString(),secureIntent,secureBridgeVersion:Number(j.secureBridgeVersion||0),hasDeviceDigest:!!j.deviceDigest,hasClientNonce:!!j.clientNonce,hasClientTime:!!j.clientTime,hasToolCatalogDigest:!!j.toolCatalogDigest,keyCount:Object.keys(j).length,mode:"received"};
    console.log("JH_REGISTER_DIAG",JSON.stringify({secureIntent,secureBridgeVersion:Number(j.secureBridgeVersion||0),hasDeviceDigest:!!j.deviceDigest,hasClientNonce:!!j.clientNonce,hasClientTime:!!j.clientTime,hasToolCatalogDigest:!!j.toolCatalogDigest,keyCount:Object.keys(j).length}));
    if(!secureIntent){
      const old=secureStates56.get(j.deviceId);if(old){wipeSession56(old.active);for(const [,p] of old.pending)wipeSession56(p);secureStates56.delete(j.deviceId);}
      devices.set(j.deviceId,{...(devices.get(j.deviceId)||{}),bridgeVersion:j.bridgeVersion||null,secureBridgeVersion:null,secureActive:false,deviceDigest:null,lastSeen:Date.now()});
      if(!queues.has(j.deviceId))queues.set(j.deviceId,[]);
      res.writeHead(200,{"content-type":"application/json"});lastRegisterDiag={...lastRegisterDiag,mode:"legacy"};
      console.log("JH_REGISTER_RESULT",JSON.stringify({mode:"legacy"}));
      res.end(JSON.stringify({ok:true,deviceId:j.deviceId,secureBridgeVersion:null}));return;
    }
    const deviceDigest=String(j.deviceDigest||""),clientNonce=String(j.clientNonce||""),clientTime=Number(j.clientTime||0);
    if(!validHex56(deviceDigest)||deviceDigest!==sha56("jh56|"+j.deviceId)||String(j.toolCatalogDigest||"")!==SECURE56_TOOL_CATALOG_DIGEST||!validToken56(clientNonce)||Math.abs(Date.now()-clientTime)>120000){res.writeHead(400).end("secure registration invalid");return;}
    const st=state56(j.deviceId),a=st.active;
    if(a){const prev=String(j.previousSessionId||""),mac=String(j.rotationMac||""),expected=hmac56(a.secret,"register|"+a.sessionId+"|"+a.deviceDigest+"|"+clientNonce+"|"+clientTime);if(prev!==a.sessionId||!eqHex56(mac,expected)){res.writeHead(409,{"content-type":"application/json"}).end(JSON.stringify({ok:false,code:"rotation_auth_required"}));return;}}
    while(st.pending.size>=3){const k=st.pending.keys().next().value;wipeSession56(st.pending.get(k));st.pending.delete(k);}
    const sessionId="s56_"+token56(18),secret=randomBytes(32),expiresAt=Date.now()+SECURE56_SESSION_MS;
    const pending={sessionId,secret,expiresAt,deviceDigest,seenActivate:new Set()};pending.sessionDigest=sessionDigest56(pending);st.pending.set(sessionId,pending);
    reg(j.deviceId,{bridgeVersion:j.bridgeVersion||null,deviceDigest,secureBridgeVersion:56,lastSeen:Date.now()});
    res.writeHead(200,{"content-type":"application/json"});
    lastRegisterDiag={...lastRegisterDiag,mode:"secure",hasSessionId:true,hasSecret:true,hasSessionDigest:true};
    console.log("JH_REGISTER_RESULT",JSON.stringify({mode:"secure",hasSessionId:true,hasSecret:true,hasSessionDigest:true}));
    res.end(JSON.stringify({ok:true,deviceId:j.deviceId,secureBridgeVersion:56,transport:"PUBLIC_HTTPS_PROXY",serverIdentityDigest:SERVER_IDENTITY_DIGEST56,toolCatalogDigest:SECURE56_TOOL_CATALOG_DIGEST,secureSessionId:sessionId,secureSessionSecret:secret.toString("base64url"),secureExpiresAt:expiresAt,sessionDigest:pending.sessionDigest}));
    return;
  }

  if(req.method==="POST" && url.pathname==="/device/activate"){
    let b=""; for await (const ch of req) b+=ch;
    const body=JSON.parse(b||"{}"),deviceId=String(body.deviceId||"");const st=secureStates56.get(deviceId);if(!st){res.writeHead(404).end("secure session not found");return;}purge56(st);
    const sid=String(req.headers["x-jh-session"]||""),dev=String(req.headers["x-jh-device"]||""),nonce=String(req.headers["x-jh-nonce"]||""),exp=Number(req.headers["x-jh-expires"]||0),mac=String(req.headers["x-jh-mac"]||"");
    const cand=st.pending.get(sid)||(st.active&&st.active.sessionId===sid?st.active:null);
    if(!cand||dev!==cand.deviceDigest||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(cand.secret,"activate|"+sid+"|"+dev+"|"+nonce+"|"+exp))||!seen56(cand.seenActivate||(cand.seenActivate=new Set()),nonce)||String(body.sessionDigest||"")!==cand.sessionDigest){res.writeHead(401).end("secure activation invalid");return;}
    if(st.active?.sessionId!==sid){wipeSession56(st.active);st.active={...cand,seenPoll:new Set(),seenComplete:new Set(),seenFrame:new Set(),seenActivate:new Set()};}
    for(const [k,p] of st.pending){if(k!==sid)wipeSession56(p);}st.pending.clear();
    const m=devices.get(deviceId)||{};devices.set(deviceId,{...m,secureActive:true,lastSeen:Date.now()});
    res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify({ok:true,code:"secure_bridge_activated",sessionDigest:st.active.sessionDigest}));return;
  }

  if(req.method==="GET" && url.pathname==="/device/poll"){
    const d=url.searchParams.get("deviceId");if(!d){res.writeHead(400).end("deviceId required");return;}
    const dm=devices.get(d);
    if(dm?.secureBridgeVersion===56){
      const a=active56(d),sid=String(req.headers["x-jh-session"]||""),dev=String(req.headers["x-jh-device"]||""),nonce=String(req.headers["x-jh-nonce"]||""),exp=Number(req.headers["x-jh-expires"]||0),mac=String(req.headers["x-jh-mac"]||"");
      if(!a||sid!==a.sessionId||dev!==a.deviceDigest||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,"poll|"+sid+"|"+dev+"|"+nonce+"|"+exp))||!seen56(a.seenPoll,nonce)){res.writeHead(401).end("secure poll required");return;}
      devices.set(d,{...dm,lastSeen:Date.now()});
    } else {if(!devices.has(d))reg(d);else devices.set(d,{...devices.get(d),lastSeen:Date.now()});}
    cleanupJobs();const q=queues.get(d)||[];while(q.length&&jobs.get(q[0])?.status!=="queued")q.shift();if(!q.length){res.writeHead(204).end();return;}
    const next=jobs.get(q.shift());if(!next){res.writeHead(204).end();return;}next.status="in_progress";next.startedAtMs=Date.now();
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(next));return;
  }

  const jobMatch=url.pathname.match(/^\/job\/([^/]+)$/);
  if(req.method==="GET" && jobMatch){
    cleanupJobs();const j=jobs.get(jobMatch[1]);if(!j){res.writeHead(404).end("not found");return;}
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(safeJobView56(j)));return;
  }

  const completeMatch=url.pathname.match(/^\/job\/([^/]+)\/complete$/);
  if(req.method==="POST" && completeMatch){
    let chunks=[],total=0;for await(const ch of req){const q=Buffer.from(ch);total+=q.length;if(total>1024*1024){res.writeHead(413).end("result too large");return;}chunks.push(q);}
    const raw=Buffer.concat(chunks),j=jobs.get(completeMatch[1]);if(!j){raw.fill(0);res.writeHead(404).end("not found");return;}
    if(j.status==="expired"){raw.fill(0);res.writeHead(409).end("job expired");return;}
    if(j.secureSessionId){
      const a=active56(j.targetDeviceId),sid=String(req.headers["x-jh-session"]||""),dev=String(req.headers["x-jh-device"]||""),nonce=String(req.headers["x-jh-nonce"]||""),exp=Number(req.headers["x-jh-expires"]||0),rd=String(req.headers["x-jh-result-digest"]||""),mac=String(req.headers["x-jh-mac"]||""),actual=sha56(raw);
      if(!a||sid!==j.secureSessionId||sid!==a.sessionId||dev!==a.deviceDigest||rd!==actual||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,"complete|"+sid+"|"+j.id+"|"+dev+"|"+nonce+"|"+exp+"|"+rd))||!seen56(a.seenComplete,nonce)){raw.fill(0);res.writeHead(401).end("secure completion invalid");return;}
    }
    let body;try{body=JSON.parse(raw.toString("utf8")||"{}");}catch{raw.fill(0);res.writeHead(400).end("invalid json");return;}raw.fill(0);
    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();
    for(const k of ["textValue","actionApprovalGrantToken","screenGrantToken","localActionApprovalDigest","screenConsentDigest","secureMac","secureNonce","securePayloadDigest"])delete j[k];
    res.writeHead(200,{"content-type":"application/json"});res.end('{"ok":true}');return;
  }

  const frameMatch=url.pathname.match(/^\/device\/frame\/([^/]+)$/);
  if(req.method==="POST" && frameMatch){
    cleanFrameWaiters56();const lease=frameMatch[1],w=frameWaiters56.get(lease);if(!w){res.writeHead(404).end("frame waiter not found");return;}
    const a=active56(w.deviceId),sid=String(req.headers["x-jh-session"]||""),dev=String(req.headers["x-jh-device"]||""),nonce=String(req.headers["x-jh-nonce"]||""),exp=Number(req.headers["x-jh-expires"]||0),task=String(req.headers["x-jh-task-digest"]||""),fd=String(req.headers["x-jh-frame-digest"]||""),mac=String(req.headers["x-jh-mac"]||"");
    const cl=Number(req.headers["content-length"]||0);if(cl>SECURE56_MAX_FRAME){frameWaiters56.delete(lease);res.writeHead(413).end("frame too large");return;}
    let chunks=[],total=0;for await(const ch of req){const q=Buffer.from(ch);total+=q.length;if(total>SECURE56_MAX_FRAME){frameWaiters56.delete(lease);chunks.forEach(x=>x.fill(0));res.writeHead(413).end("frame too large");return;}chunks.push(q);}
    const frame=Buffer.concat(chunks);chunks.forEach(x=>x.fill(0));const actual=sha56(frame),msg="frame|"+sid+"|"+lease+"|"+dev+"|"+nonce+"|"+exp+"|"+task+"|"+fd+"|"+frame.length;
    if(!a||sid!==a.sessionId||dev!==a.deviceDigest||task!==w.taskDigest||fd!==actual||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,msg))||!seen56(a.seenFrame,nonce)){frame.fill(0);frameWaiters56.delete(lease);res.writeHead(401).end("secure frame invalid");return;}
    frameWaiters56.delete(lease);w.resolve(frame);res.writeHead(202,{"content-type":"application/json"}).end('{"ok":true}');return;
  }

  if(req.method==="OPTIONS" && url.pathname==="/mcp"){
    res.writeHead(204,{
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":"content-type, mcp-session-id, authorization",
      "Access-Control-Expose-Headers":"Mcp-Session-Id"
    });res.end();return;
  }

  if(req.method==="GET" && url.pathname==="/.well-known/oauth-protected-resource"){
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify({resource:PUBLIC_BASE_URL,authorization_servers:[PUBLIC_BASE_URL],scopes_supported:[OAUTH_SCOPE56],resource_documentation:PUBLIC_BASE_URL+"/health"}));return;
  }

  if(req.method==="GET" && (url.pathname==="/.well-known/oauth-authorization-server"||url.pathname==="/.well-known/openid-configuration")){
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify({
      issuer:PUBLIC_BASE_URL,
      authorization_response_iss_parameter_supported:true,
      authorization_endpoint:PUBLIC_BASE_URL+"/oauth/authorize",
      token_endpoint:PUBLIC_BASE_URL+"/oauth/token",
      client_id_metadata_document_supported:true,
      token_endpoint_auth_methods_supported:["none"],
      code_challenge_methods_supported:["S256"],
      scopes_supported:[OAUTH_SCOPE56],
      response_types_supported:["code"],
      grant_types_supported:["authorization_code","refresh_token"]
    }));return;
  }

  if(req.method==="GET" && url.pathname==="/oauth/authorize"){
    const p=Object.fromEntries(url.searchParams.entries());
    if(!oauthAuthorizeValid56(p)){res.writeHead(400,{"content-type":"text/plain; charset=utf-8"}).end("Invalid OAuth request");return;}
    const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>JHMCP Secure Bridge 연결</title><body style="font-family:sans-serif;max-width:520px;margin:48px auto;padding:0 20px">'+
      '<h2>JHMCP Secure Bridge</h2><p>ChatGPT가 이 개인 Secure Bridge에 연결하도록 허용합니다.</p>'+
      '<p>휴대폰 Secure Bridge의 로컬 승인과 별개이며, 이 승인은 ChatGPT MCP 연결에만 사용됩니다.</p>'+
      '<form method="post" action="/oauth/authorize">'+
      Object.entries(p).map(([k,v])=>'<input type="hidden" name="'+escHtml56(k)+'" value="'+escHtml56(v)+'">').join("")+
      '<button type="submit" style="font-size:18px;padding:12px 18px">ChatGPT 연결 승인</button></form></body>';
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(html);return;
  }

  if(req.method==="POST" && url.pathname==="/oauth/authorize"){
    let b="";for await(const ch of req)b+=ch;if(b.length>16384){res.writeHead(413).end("too large");return;}
    const p=Object.fromEntries(new URLSearchParams(b).entries());
    if(!oauthAuthorizeValid56(p)){res.writeHead(400,{"content-type":"text/plain; charset=utf-8"}).end("Invalid OAuth request");return;}
    purgeOAuth56();
    const code="ac56_"+token56(24);
    oauthCodes56.set(code,{clientId:p.client_id,redirectUri:p.redirect_uri,challenge:p.code_challenge,resource:p.resource,expiresAt:Date.now()+5*60*1000});
    const dest=new URL(p.redirect_uri);dest.searchParams.set("code",code);if(p.state)dest.searchParams.set("state",p.state);dest.searchParams.set("iss",PUBLIC_BASE_URL);
    res.writeHead(302,{"location":dest.toString(),"cache-control":"no-store"}).end();return;
  }

  if(req.method==="POST" && url.pathname==="/oauth/token"){
    let b="";for await(const ch of req)b+=ch;if(b.length>16384){res.writeHead(413).end("too large");return;}
    const p=Object.fromEntries(new URLSearchParams(b).entries());
    res.setHeader("content-type","application/json");res.setHeader("cache-control","no-store");
    purgeOAuth56();
    if(p.grant_type==="authorization_code"){
      const rec=oauthCodes56.get(String(p.code||""));
      const verifier=String(p.code_verifier||"");
      const challenge=createHash("sha256").update(verifier).digest("base64url");
      if(!rec||rec.expiresAt<Date.now()||rec.clientId!==p.client_id||rec.redirectUri!==p.redirect_uri||rec.challenge!==challenge||!validOAuthResource56(p.resource)){
        res.writeHead(400).end(JSON.stringify({error:"invalid_grant"}));return;
      }
      oauthCodes56.delete(String(p.code));
      res.writeHead(200).end(JSON.stringify(oauthTokenResponse56()));return;
    }
    if(p.grant_type==="refresh_token"){
      const key=sha56("oauth-refresh|"+String(p.refresh_token||""));
      const rec=oauthRefresh56.get(key);
      if(!rec||rec.expiresAt<Date.now()||!validChatGptClient56(p.client_id)){res.writeHead(400).end(JSON.stringify({error:"invalid_grant"}));return;}
      oauthRefresh56.delete(key);
      res.writeHead(200).end(JSON.stringify(oauthTokenResponse56()));return;
    }
    res.writeHead(400).end(JSON.stringify({error:"unsupported_grant_type"}));return;
  }

  if(url.pathname.startsWith("/.well-known/")){
    res.writeHead(404).end("Not Found"); return;
  }

  if(url.pathname==="/mcp" && ["POST","GET","DELETE"].includes(req.method||"")){
    if(!mcpCallerAuthorized56(req)){
      res.setHeader("WWW-Authenticate",'Bearer resource_metadata="'+PUBLIC_BASE_URL+'/.well-known/oauth-protected-resource", scope="'+OAUTH_SCOPE56+'", error="invalid_token", error_description="OAuth connection required"');
      res.writeHead(401,{"content-type":"application/json","cache-control":"no-store"}).end(JSON.stringify({error:"mcp_caller_auth_required"}));return;
    }
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Expose-Headers","Mcp-Session-Id");
    const server=createMcp();
    const transport=new StreamableHTTPServerTransport({
      sessionIdGenerator:undefined,
      enableJsonResponse:true
    });
    res.on("close",()=>{try{transport.close();server.close();}catch{}});
    try{
      await server.connect(transport);
      await transport.handleRequest(req,res);
    }catch(e){
      if(!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(PORT,"0.0.0.0");
