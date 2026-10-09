/** Opt-in ownership endpoint composed into the EXISTING authenticated JH server.
 * Host authentication must bind owner, worker, workflow, plan and read-only task IDs.
 * No credential creation, new permission, timer, unattended execution or server listen. */
import {canonical,parse,exact,sha,isHex,isId,MAX_BYTES,CheckpointError,fail} from './life-checkpoint-wire.mjs';
import {workerRequest,workerContext} from './life-worker-policy.mjs';
export const WORKER_PATH='/jh/life/worker/v1';
export function executionContext(initial,current,proof,workflow,plan=null,requireExecution=true){
  for(const p of [initial,current]) {
    if(requireExecution&&!p.scopes?.has('jh.life.worker.execute'))fail('worker_scope_denied');
    if(!isHex(p.workerDigest)||p.workerDigest!==initial.workerDigest||p.ownerDigest!==initial.ownerDigest||
      p.workflowId!==workflow||!isHex(p.planDigest)||(plan!==null&&p.planDigest!==plan)||
      p.planDigest!==initial.planDigest||!(p.readOnlyTasks instanceof Set))fail('worker_scope_denied');
  }
  const queueDescriptorDigest=current.queueDescriptorDigest;
  if((initial.queueDescriptorDigest!==undefined||queueDescriptorDigest!==undefined)&&
    (!isHex(queueDescriptorDigest)||initial.queueDescriptorDigest!==queueDescriptorDigest))fail('worker_scope_denied');
  return workerContext({workerDigest:current.workerDigest,proof,queueDescriptorDigest,
    readOnlyTasks:new Set([...current.readOnlyTasks].filter(id=>initial.readOnlyTasks.has(id)))},proof!==undefined);
}
export function createLifeWorkerHandler({store,authenticate,clock=()=>Date.now()}){
  if(!store||typeof authenticate!=='function')fail('worker_authenticator_required');
  const principal=async req=>{
    const p=await authenticate(req);
    if(!p||!isHex(p.ownerDigest)||!(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock())fail('worker_auth_required');
    return p;
  };
  return async(req,res)=>{
    if(req.url!==WORKER_PATH)return false;
    const send=(status,body)=>{
      if(res.destroyed)return;const b=Buffer.from(canonical(body));
      res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);
    };
    try{
      if(req.method!=='POST')fail('worker_method_invalid');
      const initial=await principal(req);
      if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('worker_request_headers_invalid');
      if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||+req.headers['content-length']>MAX_BYTES))fail('worker_size_invalid');
      const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
      try{for await(const b of req){size+=b.length;if(size>MAX_BYTES)fail('worker_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
      const x=workerRequest(parse(Buffer.concat(chunks))),p=await principal(req);
      const scope=x.operation==='inspect'?'jh.life.worker.read':'jh.life.worker.execute';
      if(!initial.scopes.has(scope)||!p.scopes.has(scope))fail('worker_scope_denied');
      const context=executionContext(initial,p,x.proof,x.workflowId,x.planDigest,x.operation!=='inspect');
      const value=store.workerOperation(p.ownerDigest,x,context,clock());
      send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workflowId:x.workflowId,planDigest:x.planDigest,
        ownerDigest:p.ownerDigest,serverDigest:store.serverDigest,workerDigest:p.workerDigest,
        worker:value,workerDigestProof:value===null?null:sha(canonical(value))});
    }catch(e){
      const code=e instanceof CheckpointError?e.code:'worker_storage_or_transport_failed';
      const status=code==='worker_auth_required'?401:code==='worker_scope_denied'?403:code==='worker_size_invalid'?413:
        code==='worker_storage_or_transport_failed'?503:400;
      send(status,{ok:false,code});
    }
    return true;
  };
}
