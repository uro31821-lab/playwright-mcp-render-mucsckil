/** Opt-in exact-task route. Workers receive neither the coordinator lease nor general
 * checkpoint/content write authority. This handler performs no provider calls and starts no daemon. */
import {CheckpointError,fail,isHex} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse,CONTENT_MAX_BYTES} from './life-content-wire.mjs';
import {REMOTE_TASK_PATH,remoteRequest,intersectRemote,remoteValueDigest} from './life-remote-task-wire.mjs';
export function createLifeRemoteTaskHandler({store,authenticate,clock=()=>Date.now()}){
 if(!store||typeof authenticate!=='function')fail('remote_authenticator_required');
 const principal=async req=>{const p=await authenticate(req);if(!p||!isHex(p.ownerDigest)||!(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock())fail('remote_auth_required');return p;};
 return async(req,res)=>{
  if(req.url!==REMOTE_TASK_PATH)return false;
  const send=(status,value)=>{if(res.destroyed)return;const b=Buffer.from(contentCanonical(value));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
  try{
   if(req.method!=='POST')fail('remote_method_invalid');const first=await principal(req);
   if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('remote_headers_invalid');
   if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||+req.headers['content-length']>CONTENT_MAX_BYTES))fail('remote_size_invalid');
   const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
   try{for await(const b of req){size+=b.length;if(size>CONTENT_MAX_BYTES)fail('remote_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
   const bytes=Buffer.concat(chunks);let x;try{x=remoteRequest(contentParse(bytes));}finally{bytes.fill(0);chunks.forEach(b=>b.fill(0));}
   const next=await principal(req),p=intersectRemote(first,next),scope=['offer','result'].includes(x.operation)?'jh.life.remote.coordinate':'jh.life.remote.execute';
   if(!first.scopes.has(scope)||!next.scopes.has(scope)||p.workflowId!==x.workflowId||p.planDigest!==x.planDigest)fail('remote_scope_denied');
   const value=store.remoteTaskOperation(p.ownerDigest,x,p,clock());
   send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workflowId:x.workflowId,planDigest:x.planDigest,ownerDigest:p.ownerDigest,serverDigest:store.serverDigest,workerDigest:p.workerDigest,value,valueDigest:remoteValueDigest(value)});
  }catch(e){const code=e instanceof CheckpointError?e.code:'remote_storage_or_transport_failed';send(code==='remote_auth_required'?401:code==='remote_scope_denied'?403:code==='remote_size_invalid'?413:code==='remote_storage_or_transport_failed'?503:400,{ok:false,code});}
  return true;
 };
}
