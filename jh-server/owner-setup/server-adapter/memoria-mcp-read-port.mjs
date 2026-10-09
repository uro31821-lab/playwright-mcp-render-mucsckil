/** Server-only, bounded Streamable HTTP client for TWO existing Memoria Cloud v3 tools.
 * Operator supplies the exact HTTPS endpoint and a separate current credential. No write, login,
 * account discovery, dynamic tool execution, redirect, reconnection or automatic retry.
 * Supports JSON and finite SSE request replies. A disconnected stream needs host reconciliation.
 */
import {createHash,randomUUID} from 'node:crypto';
import {ProviderError,check,reject,strictJson,stable,checkedResult,unwrapTool,MAX_REPLY} from './provider-json.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const VERSIONS=new Set(['2025-11-25','2025-06-18','2025-03-26']);
function definitions(tools){
 const result={};
 for(const name of ['search_memory','fetch_memory']){
  const matches=tools.filter(t=>t?.name===name);check(matches.length===1,'memory_tool_missing_or_duplicate');
  const t=matches[0],s=t.inputSchema,p=s?.properties;
  check(s?.type==='object'&&p&&typeof p==='object'&&!Array.isArray(p),'memory_tool_schema');
  const fields=name==='search_memory'?['limit','query']:['memory_id'],required=name==='search_memory'?'query':'memory_id';
  check(Object.keys(p).sort().join('|')===fields.sort().join('|')&&p[required]?.type==='string','memory_tool_schema');
  check(Array.isArray(s.required)&&s.required.includes(required)&&s.required.every(k=>fields.includes(k)),'memory_tool_schema');
  if(name==='search_memory')check(p.limit?.type==='integer','memory_tool_schema');
  check(t.annotations?.readOnlyHint!==false&&t.annotations?.destructiveHint!==true,'memory_tool_effect_changed');
  check(typeof t.description==='string'&&t.description.length<=4000,'memory_tool_description');
  // Names are a compiled read allow-list confirmed against the connected V3 source. Hints alone grant nothing.
  result[name]={name,description:t.description,fields,digest:hash(stable(t))};
 }
 return result;
}
export function createMemoriaReadPort({endpoint,authorization,current,fetchImpl=globalThis.fetch,clock=Date.now,timeoutMs=12000,maxRequests=64}={}){
 let u;try{u=new URL(endpoint);}catch{reject('memory_https_endpoint');}
 check(u.protocol==='https:'&&u.username===''&&u.password===''&&u.hash===''&&u.search===''&&u.href===endpoint&&
   typeof authorization==='function'&&typeof current==='function','memory_https_endpoint');
 check(Number.isInteger(timeoutMs)&&timeoutMs>=10&&timeoutMs<=30000&&Number.isInteger(maxRequests)&&maxRequests>=4&&maxRequests<=128,'memory_limits');
 let version=null,session=null,catalog=null,authDigest=null,calls=0,closed=false,broken=false;
 const aborters=new Set();
 function guard(){check(!closed&&!broken&&current()===true,'memory_not_current');}
 async function rpc(method,params,notification=false){
  guard();check(calls++<maxRequests,'memory_request_budget');
  const auth=authorization();check(typeof auth==='string'&&/^Bearer [!-~]{16,4096}$/.test(auth)&&!/\s/.test(auth.slice(7)),'memory_auth_required');
  const ah=hash(auth);if(authDigest!==null)check(ah===authDigest,'memory_credential_changed');else authDigest=ah;
  const id=notification?null:randomUUID(),message={jsonrpc:'2.0',...(id?{id}:{}),method,...(params===undefined?{}:{params})};
  const headers={'content-type':'application/json',accept:'application/json, text/event-stream',authorization:auth,'accept-encoding':'identity'};
  if(version)headers['MCP-Protocol-Version']=version;if(session)headers['Mcp-Session-Id']=session;
  const controller=new AbortController();aborters.add(controller);let timer;
  try{
   const task=(async()=>{
    const r=await fetchImpl(endpoint,{method:'POST',headers,body:JSON.stringify(message),redirect:'error',signal:controller.signal});
    check(!r.redirected&&(!r.url||r.url===endpoint),'memory_redirect');
    if(r.status===401||r.status===403)reject('memory_provider_auth_failed');
    if(r.status===429)reject('memory_rate_limited');
    check(notification?r.status===202:r.status===200,'memory_http_failed');
    const sid=r.headers.get('mcp-session-id');
    if(sid){check(/^[\x21-\x7e]{1,512}$/.test(sid)&&(!session||session===sid),'memory_session_changed');session=sid;}
    if(notification){
     const reader=r.body?.getReader();
     if(reader){try{const chunk=await reader.read();check(chunk.done===true,'memory_notification_body');}
     finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
     return null;
    }
    const mime=r.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    check(['application/json','text/event-stream'].includes(mime),'memory_content_type');
    check(!r.headers.get('content-encoding')||r.headers.get('content-encoding')==='identity','memory_content_encoding');
    const length=r.headers.get('content-length');if(length!==null)check(/^\d+$/.test(length)&&+length<=MAX_REPLY,'memory_payload_limit');
    const reader=r.body?.getReader();check(reader,'memory_body_missing');const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;guard();size+=value.length;check(size<=MAX_REPLY,'memory_payload_limit');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    check(length===null||+length===size,'memory_truncated');const bytes=Buffer.concat(chunks);
    let raw;
    if(mime==='application/json')raw=strictJson(bytes);
    else{
     let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{reject('memory_utf8');}
     const events=text.replace(/\r\n/g,'\n').split('\n\n');check(events.at(-1)==='','memory_sse_incomplete');
     const replies=[];
     for(const event of events.slice(0,-1)){
      const lines=event.split('\n');check(lines.every(l=>l===''||l[0]===':'||/^(data|event|id|retry):/.test(l)),'memory_sse_field');
      const data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(!data.trim())continue;
      const item=strictJson(data);
      // Notifications/requests, including tool-list change/sampling, are not silently ignored.
      check(item.jsonrpc==='2.0'&&item.id===id&&!Object.hasOwn(item,'method'),'memory_unsolicited_message');replies.push(item);
     }
     check(replies.length===1,'memory_sse_response_count');raw=replies[0];
    }
    check(raw?.jsonrpc==='2.0'&&raw.id===id&&!Object.hasOwn(raw,'method')&&!Object.hasOwn(raw,'error')&&Object.hasOwn(raw,'result'),'memory_rpc_response');
    return raw.result;
   })();
   const deadline=new Promise((_,no)=>{timer=setTimeout(()=>{controller.abort();no(new ProviderError('memory_outcome_unknown_timeout'));},timeoutMs);});
   const result=await Promise.race([task,deadline]);guard();check(hash(authorization()??'')===authDigest,'memory_credential_changed');return result;
  }catch(e){broken=true;if(e instanceof ProviderError)throw e;reject('memory_outcome_unknown_transport');}
  finally{clearTimeout(timer);controller.abort();aborters.delete(controller);}
 }
 async function list(){
  const tools=[];let cursor;const seen=new Set();
  for(let page=0;page<4;page++){
   const raw=await rpc('tools/list',cursor?{cursor}:{});checkedResult({...raw,nextCursor:null});
   check(Array.isArray(raw.tools)&&raw.tools.length<=256,'memory_catalog_invalid');tools.push(...raw.tools);check(tools.length<=256,'memory_catalog_limit');
   if(raw.nextCursor==null||raw.nextCursor==='')return definitions(tools);
   check(typeof raw.nextCursor==='string'&&raw.nextCursor.length<=512&&!seen.has(raw.nextCursor),'memory_catalog_cursor');seen.add(raw.nextCursor);cursor=raw.nextCursor;
  }reject('memory_catalog_incomplete');
 }
 async function assertCatalog(){guard();check(catalog,'memory_prepare_required');const now=await list();check(stable(now)===stable(catalog),'memory_tool_definition_changed');}
 return Object.freeze({
  async prepare(){
   guard();check(!catalog,'memory_prepare_replay');
   const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'jh-server-read-port',version:'1'}});
   check(init&&VERSIONS.has(init.protocolVersion)&&init.capabilities?.tools&&typeof init.serverInfo?.name==='string','memory_initialize_invalid');
   version=init.protocolVersion;await rpc('notifications/initialized',undefined,true);catalog=await list();
   return structuredClone(catalog);
  },
  async search(query,limit=5){
   check(typeof query==='string'&&query.trim()&&query.length<=20000&&!query.includes('\0')&&Number.isInteger(limit)&&limit>=1&&limit<=5,'memory_search_arguments');
   await assertCatalog();const raw=unwrapTool(await rpc('tools/call',{name:'search_memory',arguments:{query,limit}}));
   check(raw.query===query&&Number.isInteger(raw.count)&&Array.isArray(raw.memories)&&raw.count===raw.memories.length&&raw.count<=limit,'memory_search_result');
   const ids=new Set();for(const m of raw.memories){checkedResult(m);check(typeof m.id==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(m.id)&&!ids.has(m.id)&&typeof m.content==='string'&&m.content.length<=24000&&!m.deleted_at,'memory_search_record');ids.add(m.id);}
   return raw;
  },
  async fetch(memoryId){
   check(typeof memoryId==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(memoryId),'memory_fetch_arguments');
   await assertCatalog();const raw=unwrapTool(await rpc('tools/call',{name:'fetch_memory',arguments:{memory_id:memoryId}}));
   check(typeof raw.found==='boolean'&&(raw.found?raw.memory?.id===memoryId:raw.memory==null),'memory_fetch_result');
   if(raw.found){checkedResult(raw.memory);check(typeof raw.memory.content==='string'&&typeof raw.memory.category==='string'&&Array.isArray(raw.memory.media)&&raw.memory.media.length<=100&&!raw.memory.deleted_at,'memory_fetch_record');}
   return raw;
  },
  close(){closed=true;for(const c of aborters)c.abort();},
  counters(){return {httpRequests:calls,closed,failed:broken};}
 });
}
