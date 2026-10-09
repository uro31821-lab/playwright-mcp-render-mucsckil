/** Server-worker process composition. Reuses existing GPT adapter. No HTTP listener, scheduler,
 * task engine, credential issuance or Android installation. Parent is an already authorized
 * worker using the existing Claim/WorkerLauncher; a pipe is NOT a replacement for its grants.
 */
import {createHash} from 'node:crypto';
import {createGptLifeAdapter} from '../server-adapter/gpt-life-adapter.mjs';
import {createMemoriaReadPort} from '../server-adapter/memoria-mcp-read-port.mjs';
import {check,reject,strictJson,stable,exact} from '../server-adapter/provider-json.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createProviderSession({owner,workflow,expiresAt,actions,model,responseModels,
 memoriaEndpoint,memoriaAuthorization,gptKey,current,clock=Date.now,fetchImpl=globalThis.fetch,maxOutputTokens=2048}){
 const id=/^[A-Za-z0-9_.-]{1,80}$/;
 check(id.test(owner)&&id.test(workflow)&&Number.isSafeInteger(expiresAt)&&expiresAt>clock()&&expiresAt-clock()<=600000&&typeof current==='function','provider_session_scope');
 const allowed=new Set(actions);check(Array.isArray(actions)&&allowed.size===actions.length&&actions.length>0&&actions.every(a=>['memory_search','memory_answer','food_observe','food_advice','book_preview'].includes(a)),'provider_actions');
 const needGpt=actions.some(a=>a!=='memory_search');
 let closed=false,prepared=false,memory,selected=new Set(),searched=false,lastId=0;
 function guard(){check(!closed&&clock()<expiresAt&&current()===true,'provider_session_not_current');}
 const authorize=async(p,w)=>{guard();return p===owner&&w===workflow?{ownerId:owner}:null;};
 const gpt=needGpt?createGptLifeAdapter({apiKey:gptKey,model,responseModels,maxOutputTokens,authorize,fetchImpl,timeoutMs:25000,maxCalls:16,maxInFlight:1}):null;
 const digest=hash(stable({version:1,provider:'openai',model,responseModels,maxOutputTokens,actions:[...allowed].sort()}));
 const failClose=()=>{closed=true;memory?.close();};
 async function handle(message){
  exact(message,['version','id','operation','payload','payloadDigest']);
  check(message.version===1&&Number.isSafeInteger(message.id)&&message.id===lastId+1&&message.id<=64,'provider_frame_sequence');lastId=message.id;
  check(typeof message.payload==='string'&&message.payload.length<=32*1024*1024&&/^[A-Za-z0-9+/]*={0,2}$/.test(message.payload),'provider_frame_payload');
  const bytes=Buffer.from(message.payload,'base64');check(bytes.toString('base64')===message.payload&&hash(bytes)===message.payloadDigest,'provider_frame_digest');
  let args;try{args=strictJson(bytes,24*1024*1024);}finally{bytes.fill(0);}
  let result;
  try{
   guard();
   if(message.operation==='prepare'){
    exact(args,[]);check(!prepared,'provider_prepare_replay');
    let tools=null;
    if(allowed.has('memory_search')){
     memory=createMemoriaReadPort({endpoint:memoriaEndpoint,authorization:memoriaAuthorization,current:()=>{try{guard();return true;}catch{return false;}},fetchImpl,clock});
     tools=await memory.prepare();
    }
    // configured=true only means credentials were provided, not that upstream credentials are accepted.
    if(needGpt){check(gpt.configuration().configured,'gpt_not_configured');
    const meta=await fetchImpl('https://api.openai.com/v1/models/'+encodeURIComponent(model),{
      method:'GET',redirect:'error',headers:{authorization:'Bearer '+gptKey,accept:'application/json'},
      signal:AbortSignal.timeout(10000)});
    check(meta.status===200&&!meta.redirected&&meta.headers.get('content-type')?.split(';')[0].trim()==='application/json','gpt_metadata_auth_failed');
    const metaReader=meta.body?.getReader();check(metaReader,'gpt_metadata_missing');let metaSize=0;const metaChunks=[];
    try{while(true){const {done,value}=await metaReader.read();if(done)break;metaSize+=value.length;check(metaSize<=65536,'gpt_metadata_limit');metaChunks.push(value);}}
    finally{await metaReader.cancel().catch(()=>{});metaReader.releaseLock();}
    const metaBody=strictJson(Buffer.concat(metaChunks),65536);check(metaBody.object==='model'&&metaBody.id===model,'gpt_metadata_model_mismatch');}
    prepared=true;result={owner,workflow,expiresAt,model,responseModels,descriptorDigest:digest,tools,gptReady:needGpt,
     authenticationScope:'UPSTREAM_METADATA_CHECKED_NOT_GENERATION_SUCCESS'};
   }else{
    check(prepared,'provider_prepare_required');
    if(message.operation==='memory.search'){
     exact(args,['query','limit']);check(allowed.has('memory_search')&&!searched,'provider_memory_search_not_allowed');
     searched=true;result=await memory.search(args.query,args.limit);selected=new Set(result.memories.map(m=>m.id));
    }else if(message.operation==='memory.fetch'){
     exact(args,['memory_id']);check(allowed.has('memory_search')&&selected.has(args.memory_id),'provider_memory_outside_search');
     selected.delete(args.memory_id);result=await memory.fetch(args.memory_id);
    }else if(message.operation==='gpt.generate'){
     check(allowed.has(args.action)&&args.workflow===workflow&&args.model===model,'provider_gpt_scope');
     result=await gpt.generate(owner,args);
     guard();await authorize(owner,workflow);
    }else reject('provider_operation_not_allowed');
   }
   guard();const reply=Buffer.from(JSON.stringify(result));check(reply.length<=524288,'provider_reply_limit');
   return {version:1,id:message.id,requestDigest:message.payloadDigest,ok:true,payload:reply.toString('base64'),payloadDigest:hash(reply)};
  }catch(e){
   failClose();
   const code=typeof e?.code==='string'&&/^[a-z0-9_]{3,100}$/.test(e.code)?e.code:'provider_session_failed_no_retry';
   return {version:1,id:message.id,requestDigest:message.payloadDigest,ok:false,code};
  }
 }
 return Object.freeze({handle,close:failClose});
}
export async function serveProviderPipe(session,input=process.stdin,output=process.stdout){
 let pending=Buffer.alloc(0),count=0;
 try{
  for await(const chunk of input){
   check(Buffer.isBuffer(chunk)||chunk instanceof Uint8Array,'provider_pipe_bytes_required');
   pending=Buffer.concat([pending,chunk]);check(pending.length<=34*1024*1024,'provider_pipe_limit');
   let end;
   while((end=pending.indexOf(10))>=0){
    check(++count<=64,'provider_pipe_budget');
    const frame=pending.subarray(0,end);const raw=strictJson(frame,33*1024*1024);
    const reply=await session.handle(raw);frame.fill(0);
    pending=Buffer.from(pending.subarray(end+1));
    const line=JSON.stringify(reply)+'\n';check(Buffer.byteLength(line)<=1048576,'provider_pipe_reply_limit');
    if(!output.write(line))await new Promise(resolve=>output.once('drain',resolve));
    if(reply.ok!==true)return;
   }
  }
  check(pending.length===0,'provider_pipe_truncated');
 }finally{pending.fill(0);session.close();}
}
