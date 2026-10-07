// Bounded authenticated server-to-client channel for Playwright heartbeat.
// Only ping responses are sent; no server-initiated tools, approvals or sampling.
const ENDPOINT='https://playwright-mcp-yzcy.onrender.com/mcp';
const VERSIONS=new Set(['2025-03-26','2025-06-18','2025-11-25']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>{throw new Error(code);};
export function withBrowserEvents(base,{
 endpoint=process.env.JH_BROWSER_MCP_URL,token=process.env.JH_BROWSER_MCP_TOKEN,
 fetchImpl=globalThis.fetch,headerTimeoutMs=8000,lifetimeMs=600000,maxFrameBytes=65536
}={}){
 if(!base||typeof base.request!=='function')fail('browser_events_transport_required');
 let channel=null,sessionId=null,generation=0,lost=false;
 const close=()=>{generation++;const old=channel;channel=null;old?.close();lost=true;};
 const config=()=>{
  if(endpoint!==ENDPOINT)fail('browser_endpoint_configuration_required');
  if(typeof token!=='string'||token.length<24||token.length>512||!/^[\x21-\x7e]+$/.test(token))fail('browser_service_credential_required');
  if(!Number.isSafeInteger(headerTimeoutMs)||headerTimeoutMs<1||headerTimeoutMs>30000||!Number.isSafeInteger(lifetimeMs)||lifetimeMs<1||lifetimeMs>600000||!Number.isSafeInteger(maxFrameBytes)||maxFrameBytes<64||maxFrameBytes>65536)fail('browser_event_limits_invalid');
 };
 const open=(sid,version)=>{
  config();
  if(typeof sid!=='string'||!/^[\x21-\x7e]{1,512}$/.test(sid)||!VERSIONS.has(version))fail('browser_event_binding_invalid');
  const epoch=generation,controller=new AbortController();
  const h={accept:'text/event-stream',authorization:`Bearer ${token}`,'mcp-session-id':sid,'mcp-protocol-version':version};
  let reader,ended=false,total=0,frames=0,buffer='',windowAt=Date.now(),windowCount=0;
  const seen=new Set();
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  void ready.catch(()=>{});
  const timer=setTimeout(()=>controller.abort(),lifetimeMs);timer.unref?.();
  const headersTimer=setTimeout(()=>controller.abort(),headerTimeoutMs);headersTimer.unref?.();
  const stop=()=>{ended=true;clearTimeout(timer);clearTimeout(headersTimer);controller.abort();rejectReady(new Error('browser_event_channel_closed'));if(reader)void reader.cancel().catch(()=>{});};
  const recordFailure=()=>{if(epoch===generation)lost=true;stop();};
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('browser_event_channel_closed')),{once:true}));
  const active=()=>!ended&&!controller.signal.aborted&&epoch===generation&&!lost;
  const processFrame=async(raw)=>{
   if(++frames>4096)fail('browser_event_budget_exceeded');
   if(Date.now()-windowAt>=60000){windowAt=Date.now();windowCount=0;}
   if(++windowCount>60)fail('browser_event_budget_exceeded');
   if(Buffer.byteLength(raw)>maxFrameBytes)fail('browser_event_frame_too_large');
   const data=raw.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).replace(/^ /,'')).join('\n');
   if(!data.trim())return;
   let message;try{message=JSON.parse(data);}catch{fail('browser_event_invalid');}
   if(!object(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||Object.hasOwn(message,'result')||Object.hasOwn(message,'error'))fail('browser_event_invalid');
   if(!Object.hasOwn(message,'id')){
    if(message.method==='notifications/tools/list_changed')return;
    fail('browser_event_notification_unsupported');
   }
   if(message.method!=='ping'||(message.params!==undefined&&(!object(message.params)||Object.keys(message.params).some(k=>k!=='_meta'))))fail('browser_event_request_unsupported');
   const id=message.id;
   if(!((typeof id==='string'&&id.length>0&&id.length<=128)||(Number.isSafeInteger(id)&&Math.abs(id)<=1e12)))fail('browser_event_invalid');
   const key=typeof id+':'+id;
   if(seen.has(key)||seen.size>=4096)fail('browser_event_duplicate');
   seen.add(key);
   if(!active())fail('browser_event_channel_closed');
   const ack=await base.request({method:'POST',headers:{...h,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,result:{}})});
   if(!active()||![202,204].includes(ack.status)||(await ack.text()).trim()!=='')fail('browser_event_reply_failed');
  };
  const pump=async()=>{
   try{
    // Start the event stream without blocking POST initialization. Some proxies
    // flush its headers only with the first server ping, triggered by a tool.
    const response=await Promise.race([fetchImpl(ENDPOINT,{method:'GET',headers:h,redirect:'error',signal:controller.signal}),aborted]);
    clearTimeout(headersTimer);
    if(response.status!==200){void response.body?.cancel().catch(()=>{});fail('browser_event_channel_unavailable');}
    if((response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='text/event-stream'||!response.body)fail('browser_event_stream_invalid');
    if(response.headers.has('mcp-session-id')&&response.headers.get('mcp-session-id')!==sid)fail('browser_event_binding_invalid');
    if(!active())fail('browser_event_binding_invalid');
    reader=response.body.getReader();resolveReady();
    const decoder=new TextDecoder('utf-8',{fatal:true});
    while(active()){
     const part=await Promise.race([reader.read(),aborted]);
     if(part.done)fail('browser_event_channel_closed');
     total+=part.value.byteLength;
     if(total>4*1024*1024)fail('browser_event_budget_exceeded');
     buffer+=decoder.decode(part.value,{stream:true});
     let match;
     while((match=/\r?\n\r?\n/.exec(buffer))){const raw=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);await processFrame(raw);}
     if(Buffer.byteLength(buffer)>maxFrameBytes)fail('browser_event_frame_too_large');
    }
   }catch{recordFailure();}finally{stop();}
  };
  channel={close:stop,active,ready};
  void pump();
 };
 return {
  close,
  async request(options={}){
   let message;try{message=JSON.parse(options.body);}catch{fail('browser_request_invalid');}
   if(!object(message)||typeof message.method!=='string')fail('browser_request_invalid');
   if(message.method==='initialize'){close();lost=false;sessionId=null;}
   else{
    if(lost)fail('browser_event_channel_closed');
    if(sessionId!==null&&new Headers(options.headers).get('mcp-session-id')!==sessionId)fail('browser_event_binding_invalid');
    if(sessionId!==null&&message.method!=='notifications/initialized'&&!channel?.active())fail('browser_event_channel_closed');
   }
   const epoch=generation;
   let response;
   try{response=await base.request(options);}catch(e){close();throw e;}
   if(epoch!==generation)fail('browser_event_binding_invalid');
   if(message.method==='initialize'){sessionId=response.headers.get('mcp-session-id');return response;}
   if(message.method==='notifications/initialized'&&sessionId!==null){
    if(![202,204].includes(response.status))return response;
    open(sessionId,new Headers(options.headers).get('mcp-protocol-version'));
   }else if(sessionId!==null){
    // A completed action cannot be reported healthy with an unvalidated GET.
    // Failure never replays the action; the prior session controller handles it.
    if(message.method==='tools/call')await channel.ready;
    if(!channel.active()){close();fail('browser_event_channel_closed');}
   }
   return response;
  }
 };
}
