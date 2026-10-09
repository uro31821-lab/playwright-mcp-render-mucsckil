/** Opt-in handler to compose into the EXISTING JH server after authentication is installed.
 * This module does not listen, start a worker, log in, install an account, or modify any permission.
 * authenticate must use the host's validated principal with narrowly scoped existing JH credentials.
 * A model-supplied owner, isApproved, device session or generic successful login is not sufficient. */
import {canonical,parse,exact,sha,isHex,isId,MAX_BYTES,CheckpointError,fail} from './life-checkpoint-wire.mjs';
import {executionContext} from './life-worker-http.mjs';
export const PATH='/jh/life/checkpoint/v1';
export function createLifeCheckpointHandler({store,authenticate,clock=()=>Date.now()}){
 if(!store||typeof authenticate!=='function')fail('checkpoint_authenticator_required');
 const principal=async req=>{
  const p=await authenticate(req);
  if(!p||!isHex(p.ownerDigest)||!(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock())fail('checkpoint_auth_required');
  return p;
 };
 return async function(req,res){
  if(req.url!==PATH)return false;
  const send=(status,body)=>{if(res.destroyed)return;const b=Buffer.from(canonical(body));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
  try{
   if(req.method!=='POST')fail('checkpoint_method_invalid');
   const initial=await principal(req);
   if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers['origin']||req.headers['cookie'])fail('checkpoint_request_headers_invalid');
   if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||Number(req.headers['content-length'])>MAX_BYTES))fail('checkpoint_size_invalid');
   const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
   try{for await(const b of req){size+=b.length;if(size>MAX_BYTES)fail('checkpoint_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
   const x=parse(Buffer.concat(chunks));
   if(!x||x.version!==1||!isId(x.requestId)||!isId(x.workflowId))fail('checkpoint_request_invalid');
   const keys='version requestId operation workflowId';
   const scope=x.operation==='load'?'jh.life.read':x.operation==='cas'?'jh.life.write':x.operation==='control'?'jh.life.control':null;
   if(!scope)fail('checkpoint_operation_invalid');
   exact(x,keys+(x.operation==='cas'?' checkpoint expectedRevision':x.operation==='control'?' action expectedRevision':'')+(x.operation==='cas'&&Object.hasOwn(x,'workerLease')?' workerLease':''));
   const p=await principal(req);
   if(p.ownerDigest!==initial.ownerDigest||!initial.scopes.has(scope)||!p.scopes.has(scope))fail('checkpoint_scope_denied');
   // Narrow-scope authenticators may authorize only one workflow/plan. Historical
   // owner-wide test/host principals without these fields retain their old contract.
   for(const who of [initial,p]){
    if((initial.workflowId!==undefined||p.workflowId!==undefined)&&who.workflowId!==x.workflowId)fail('checkpoint_scope_denied');
    if((initial.workerDigest!==undefined||p.workerDigest!==undefined)&&who.workerDigest!==initial.workerDigest)fail('checkpoint_scope_denied');
    if((initial.authorizationBinding!==undefined||p.authorizationBinding!==undefined)&&who.authorizationBinding!==initial.authorizationBinding)fail('checkpoint_scope_denied');
   }
   const existing=store.load(p.ownerDigest,x.workflowId);
   for(const who of [initial,p])if((initial.planDigest!==undefined||p.planDigest!==undefined)&&
     (!isHex(who.planDigest)||who.planDigest!==initial.planDigest||(existing&&existing.planDigest!==who.planDigest)||(x.operation==='cas'&&x.checkpoint?.planDigest!==who.planDigest)))fail('checkpoint_scope_denied');
   for(const who of [initial,p])if(who.authorizationBinding!==undefined){
    for(const cp of [existing,x.operation==='cas'?x.checkpoint:null].filter(Boolean)){
     if(!(who.readOnlyTasks instanceof Set)||cp.entries?.length!==who.readOnlyTasks.size||cp.entries.some(e=>!who.readOnlyTasks.has(e.taskId)))fail('checkpoint_scope_denied');
    }
   }
   let value;
   if(x.operation==='load')value=store.load(p.ownerDigest,x.workflowId);
   else if(x.operation==='cas'){
    if(x.checkpoint?.workflowId!==x.workflowId)fail('checkpoint_binding_mismatch');
    const execution=Object.hasOwn(x,'workerLease')?executionContext(initial,p,x.workerLease,x.workflowId,x.checkpoint.planDigest):null;
    value=store.compareAndSet(p.ownerDigest,x.checkpoint,x.expectedRevision,execution,clock());
   }else value=store.control(p.ownerDigest,x.workflowId,x.expectedRevision,x.action);
   send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workflowId:x.workflowId,ownerDigest:p.ownerDigest,
    serverDigest:store.serverDigest,checkpoint:value,checkpointDigest:value===null?null:sha(canonical(value))});
  }catch(e){const code=e instanceof CheckpointError?e.code:'checkpoint_storage_or_transport_failed';
   const status=code==='checkpoint_auth_required'?401:code==='checkpoint_scope_denied'?403:code==='checkpoint_conflict'?409:code==='checkpoint_size_invalid'?413:code==='checkpoint_storage_or_transport_failed'?503:400;
   send(status,{ok:false,code});
  }
  return true;
 };
}
