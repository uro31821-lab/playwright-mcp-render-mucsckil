/** Optional handler; same reviewed host authentication, additional workflow+plan content grants.
 * No automatic migration, listen, credentials, new user prompts or private-photo uploads. */
import {exact,sha,isHex,isId,CheckpointError,fail} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse,CONTENT_MAX_BYTES,CATEGORIES} from './life-content-wire.mjs';
import {executionContext} from './life-worker-http.mjs';
export const CONTENT_PATH='/jh/life/content/v1';
export function createLifeContentHandler({store,authenticate,clock=()=>Date.now()}){
 if(!store||typeof authenticate!=='function')fail('content_authenticator_required');
 const principal=async req=>{const p=await authenticate(req);
  if(!p||!isHex(p.ownerDigest)||!(p.scopes instanceof Set)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock()||
    !isId(p.workflowId)||!isHex(p.planDigest)||!(p.contentClasses instanceof Set)||!(p.contentRefs instanceof Set)||!(p.resultTaskIds instanceof Set))fail('content_auth_required');
  return p;
 };
 return async(req,res)=>{
  if(req.url!==CONTENT_PATH)return false;
  const send=(status,body)=>{if(res.destroyed)return;const b=Buffer.from(contentCanonical(body));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
  try{
   if(req.method!=='POST')fail('content_method_invalid');
   const initial=await principal(req);
   if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('content_request_headers_invalid');
   if(req.headers['content-length']&&(!/^\d{1,6}$/.test(req.headers['content-length'])||+req.headers['content-length']>CONTENT_MAX_BYTES))fail('content_size_invalid');
   const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
   try{for await(const b of req){size+=b.length;if(size>CONTENT_MAX_BYTES)fail('content_size_invalid');chunks.push(b);}}finally{clearTimeout(timer);}
   const x=contentParse(Buffer.concat(chunks));
   if(x.version!==1||!isId(x.requestId)||!isId(x.workflowId)||!isHex(x.planDigest)||!isId(x.ref)||!CATEGORIES.has(x.category))fail('content_request_invalid');
   const scope=x.operation==='get'?'jh.life.content.read':x.operation==='put'?'jh.life.content.write':null;
   if(!scope)fail('content_operation_invalid');
   exact(x,'version requestId operation workflowId planDigest ref category'+(x.operation==='put'?' record expectedRevision':'')+(x.operation==='put'&&Object.hasOwn(x,'workerLease')?' workerLease':''));
   const p=await principal(req);
   for(const who of [initial,p])if(who.ownerDigest!==initial.ownerDigest||who.workflowId!==x.workflowId||who.planDigest!==x.planDigest||!who.scopes.has(scope)||!who.contentClasses.has(x.category)||(x.category!=='RESULT_TEXT'&&!who.contentRefs.has(x.ref)))fail('content_scope_denied');
   let r;
   if(x.operation==='get')r=store.loadContent(p.ownerDigest,x.workflowId,x.planDigest,x.ref,clock());
   else{
    if(x.record?.workflowId!==x.workflowId||x.record?.planDigest!==x.planDigest||x.record?.ref!==x.ref||x.record?.category!==x.category||x.record?.expiresAt>Math.min(initial.expiresAt,p.expiresAt))fail('content_request_binding');
    if(x.category==='RESULT_TEXT'&&[initial,p].some(who=>!who.resultTaskIds.has(x.record.taskId)))fail('content_scope_denied');
    const execution=Object.hasOwn(x,'workerLease')?executionContext(initial,p,x.workerLease,x.workflowId,x.planDigest):null;
    r=store.putContent(p.ownerDigest,x.record,x.expectedRevision,clock(),execution);
   }
   if(r&&r.category!==x.category)fail('content_class_mismatch');
   if(r?.category==='RESULT_TEXT'&&[initial,p].some(who=>!who.resultTaskIds.has(r.taskId)))fail('content_scope_denied');
   send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workflowId:x.workflowId,planDigest:x.planDigest,ref:x.ref,category:x.category,
    ownerDigest:p.ownerDigest,serverDigest:store.serverDigest,record:r,recordDigest:r===null?null:sha(contentCanonical(r))});
  }catch(e){const code=e instanceof CheckpointError?e.code:'content_storage_or_transport_failed';
   const status=code==='content_auth_required'?401:code==='content_scope_denied'?403:code==='checkpoint_conflict'?409:code==='content_size_invalid'?413:code==='content_storage_or_transport_failed'?503:400;
   send(status,{ok:false,code});
  }
  return true;
 };
}
