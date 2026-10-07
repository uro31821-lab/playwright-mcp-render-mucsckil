// One authenticated, session-bound SSE listener. Only protocol pings are answered.
// No browser actions, request replay, credentials in output, or session sharing.
const ENDPOINT = 'https://playwright-mcp-yzcy.onrender.com/mcp';
const VERSIONS = new Set(['2025-03-26','2025-06-18','2025-11-25']);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function createBrowserHeartbeat({transport, endpoint=process.env.JH_BROWSER_MCP_URL,
  token=process.env.JH_BROWSER_MCP_TOKEN, fetchImpl=globalThis.fetch,
  idleMs=15000, lifetimeMs=600000}={}) {
  return ({sessionId,version,onEnd}) => {
    if(endpoint!==ENDPOINT || typeof token!=='string' || !/^[\x21-\x7e]{24,512}$/.test(token))
      throw Error('browser_heartbeat_configuration_required');
    if(typeof sessionId!=='string'||!/^[\x21-\x7e]{1,512}$/.test(sessionId)||!VERSIONS.has(version)
      ||typeof onEnd!=='function'||typeof transport?.request!=='function'
      ||!Number.isSafeInteger(idleMs)||idleMs<10||idleMs>30000
      ||!Number.isSafeInteger(lifetimeMs)||lifetimeMs<idleMs||lifetimeMs>600000)
      throw Error('browser_heartbeat_binding_invalid');
    const controller=new AbortController();
    let closed=false,reader=null,idleTimer=null,lifetimeTimer=null;
    let events=0,minuteStart=Date.now(),minuteEvents=0;
    const headers=Object.freeze({'content-type':'application/json',
      accept:'application/json, text/event-stream','mcp-session-id':sessionId,
      'mcp-protocol-version':version});
    const close=()=>{
      if(closed)return;closed=true;clearTimeout(idleTimer);clearTimeout(lifetimeTimer);
      controller.abort();if(reader)void reader.cancel().catch(()=>{});
    };
    const finish=code=>{if(closed)return;close();onEnd(code);};
    const touch=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>finish('browser_heartbeat_idle'),idleMs);idleTimer.unref?.();};
    const frame=async text=>{
      const data=text.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
      if(!data.trim())return;
      if(++events>20000)throw Error('heartbeat_limit');
      if(Date.now()-minuteStart>60000){minuteStart=Date.now();minuteEvents=0;}
      if(++minuteEvents>120)throw Error('heartbeat_rate');
      const message=JSON.parse(data);
      if(!object(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'
        ||Object.hasOwn(message,'result')||Object.hasOwn(message,'error'))throw Error('heartbeat_envelope');
      if(!Object.hasOwn(message,'id'))return; // Notifications never authorize work.
      if(!(Number.isSafeInteger(message.id)||(typeof message.id==='string'&&message.id.length>0&&message.id.length<=128)))throw Error('heartbeat_id');
      if(closed)return;
      const ping=message.method==='ping' && (message.params===undefined || (object(message.params)&&Object.keys(message.params).length===0));
      const body={jsonrpc:'2.0',id:message.id,...(ping?{result:{}}:{error:{code:-32601,message:'Method not supported'}})};
      const response=await transport.request({method:'POST',headers,body:JSON.stringify(body)});
      if(closed)return;
      if(![202,204].includes(response.status)||(await response.text()).trim()!=='')throw Error('heartbeat_reply_rejected');
    };
    const consume=async()=>{
      try{
        // Do not await this connection before tools/call: the server can send its
        // first SSE byte only after a browser backend starts and emits its ping.
        const response=await fetchImpl(ENDPOINT,{method:'GET',headers:{...headers,accept:'text/event-stream',authorization:`Bearer ${token}`},redirect:'error',signal:controller.signal});
        if(closed){void response.body?.cancel().catch(()=>{});return;}
        if(!response.ok||!response.body||(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='text/event-stream'
          ||(response.headers.has('mcp-session-id')&&response.headers.get('mcp-session-id')!==sessionId)){
          void response.body?.cancel().catch(()=>{});throw Error('heartbeat_stream_rejected');
        }
        reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
        for(;;){
          const part=await reader.read();if(closed)return;if(part.done)throw Error('heartbeat_stream_ended');
          touch();pending+=decoder.decode(part.value,{stream:true});
          if(Buffer.byteLength(pending)>65536)throw Error('heartbeat_frame_limit');
          let match;
          while((match=/\r?\n\r?\n/.exec(pending))){
            const text=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);
            if(Buffer.byteLength(text)>16384)throw Error('heartbeat_frame_limit');await frame(text);if(closed)return;
          }
        }
      }catch{finish('browser_heartbeat_connection_lost');}
    };
    touch();lifetimeTimer=setTimeout(()=>finish('browser_heartbeat_lifetime'),lifetimeMs);lifetimeTimer.unref?.();
    void consume();
    return Object.freeze({close,active:()=>!closed});
  };
}
