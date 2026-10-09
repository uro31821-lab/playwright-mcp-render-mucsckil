/** Optional route on the existing authenticated service. No new listener or credential handling.
 * Read-only recovery inspection requires read scopes; metadata commit needs dedicated reconcile.
 * Neither endpoint calls a provider or grants a new dispatch lease. */
import {isHex,isId,sha,canonical,CheckpointError,fail,MAX_BYTES} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from './life-content-wire.mjs';
import {reconciliationRequest,reconciliationTask} from './life-reconciliation-wire.mjs';
export const RECONCILIATION_PATH='/jh/life/reconcile/v1';
export function createLifeReconciliationHandler({store,authenticate,clock=()=>Date.now()}) {
  if(!store||typeof authenticate!=='function')fail('reconcile_authenticator_required');
  const principal=async req=>{
    const p=await authenticate(req);
    if(!p||!isHex(p.ownerDigest)||!isHex(p.workerDigest)||!isId(p.workflowId)||!isHex(p.planDigest)||
        !(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock())fail('reconcile_auth_required');
    // Defensive snapshot: authenticate may reuse objects. Revocation while the body arrives
    // must not erase the first observation and manufacture an unchanged principal.
    return {...p,scopes:new Set(p.scopes),readOnlyTasks:new Set(p.readOnlyTasks??[]),
      resultTaskIds:new Set(p.resultTaskIds??[]),contentClasses:new Set(p.contentClasses??[]),
      recoveryTasks:new Map([...(p.recoveryTasks??[])].map(([id,spec])=>[id,{...spec}]))};
  };
  return async(req,res)=>{
    if(req.url!==RECONCILIATION_PATH)return false;
    const send=(status,x)=>{
      if(res.destroyed)return;const b=Buffer.from(contentCanonical(x));
      res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);
    };
    try {
      if(req.method!=='POST')fail('reconcile_method_invalid');
      const first=await principal(req);
      if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('reconcile_headers_invalid');
      if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||+req.headers['content-length']>MAX_BYTES))fail('reconcile_size_invalid');
      const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
      try{for await(const b of req){size+=b.length;if(size>MAX_BYTES)fail('reconcile_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
      const x=reconciliationRequest(contentParse(Buffer.concat(chunks))),last=await principal(req);
      for(const p of [first,last]){
        if(p.ownerDigest!==first.ownerDigest||p.workerDigest!==first.workerDigest||p.workflowId!==x.workflowId||p.planDigest!==x.planDigest||
          !p.scopes.has('jh.life.read')||!p.scopes.has('jh.life.worker.read')||!p.scopes.has('jh.life.content.read')||
          (x.operation==='commit'&&!p.scopes.has('jh.life.worker.reconcile')))fail('reconcile_scope_denied');
        reconciliationTask(p,x.taskId);
      }
      if(canonical(first.recoveryTasks.get(x.taskId))!==canonical(last.recoveryTasks.get(x.taskId)))fail('reconcile_spec_changed');
      const context={...last,expiresAt:Math.min(first.expiresAt,last.expiresAt)};
      const recovery=store.reconcile(last.ownerDigest,x,context,clock());
      send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workflowId:x.workflowId,planDigest:x.planDigest,taskId:x.taskId,
        ownerDigest:last.ownerDigest,serverDigest:store.serverDigest,workerDigest:last.workerDigest,
        recovery,recoveryDigest:sha(contentCanonical(recovery))});
    }catch(e){
      const code=e instanceof CheckpointError?e.code:'reconcile_storage_or_transport_failed';
      const status=code==='reconcile_auth_required'?401:code==='reconcile_scope_denied'?403:
        ['reconcile_observation_changed','reconcile_already_committed','reconcile_workflow_stopped','reconcile_owner_still_active'].includes(code)?409:400;
      send(status,{ok:false,code});
    }
    return true;
  };
}
