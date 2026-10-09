/** Opt-in durable queue endpoint. Authentication is a reviewed host dependency; the request
 * carries only metadata and cannot create owner/worker authority, a daemon or a provider. */
import {canonical,parse,sha,isHex,isId,MAX_BYTES,CheckpointError,fail} from './life-checkpoint-wire.mjs';
import {queueRequest,queueContext} from './life-queue-wire.mjs';
export const QUEUE_PATH='/jh/life/queue/v1';
export function createLifeQueueHandler({store,authenticate,clock=()=>Date.now()}){
 if(!store||typeof authenticate!=='function')fail('queue_authenticator_required');
 async function principal(req){
  const p=await authenticate(req);
  if(!p||!isHex(p.ownerDigest)||!(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock())fail('queue_auth_required');
  // Snapshot nested sets/maps; revocation while reading the body must not mutate the first observation.
  const c=queueContext(p);return {...c,ownerDigest:p.ownerDigest,expiresAt:p.expiresAt,scopes:new Set(p.scopes)};
 }
 return async(req,res)=>{
  if(req.url!==QUEUE_PATH)return false;
  const send=(status,x)=>{if(res.destroyed)return;const b=Buffer.from(canonical(x));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
  try{
   if(req.method!=='POST')fail('queue_method_invalid');const first=await principal(req);
   if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('queue_headers_invalid');
   if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||+req.headers['content-length']>MAX_BYTES))fail('queue_size_invalid');
   const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
   try{for await(const b of req){size+=b.length;if(size>MAX_BYTES)fail('queue_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
   const x=queueRequest(parse(Buffer.concat(chunks))),last=await principal(req),scope=x.operation==='list'?'jh.life.queue.read':'jh.life.queue.submit';
   if(first.ownerDigest!==last.ownerDigest||first.workerDigest!==last.workerDigest||!first.scopes.has(scope)||!last.scopes.has(scope))fail('queue_scope_denied');
   const grants=new Map();for(const [id,a] of first.queueGrants){
    const b=last.queueGrants.get(id);if(!b)continue;
    if(a.planDigest!==b.planDigest||a.descriptorDigest!==b.descriptorDigest)fail('queue_grant_changed');
    grants.set(id,{...b,expiresAt:Math.min(a.expiresAt,b.expiresAt,first.expiresAt,last.expiresAt),readOnlyTasks:new Set([...b.readOnlyTasks].filter(t=>a.readOnlyTasks.has(t)))});
   }
   const context={workerDigest:last.workerDigest,queueGrants:grants},items=store.queueOperation(last.ownerDigest,x,context,clock());
   send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,ownerDigest:last.ownerDigest,serverDigest:store.serverDigest,workerDigest:last.workerDigest,
    items,itemsDigest:sha(canonical(items)),complete:true,serverTime:clock()});
  }catch(e){const code=e instanceof CheckpointError?e.code:'queue_storage_or_transport_failed';
   send(code==='queue_auth_required'?401:code==='queue_scope_denied'?403:code==='queue_size_invalid'?413:code==='queue_storage_or_transport_failed'?503:400,{ok:false,code});}
  return true;
 };
}
