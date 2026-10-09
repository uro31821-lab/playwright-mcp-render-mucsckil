/** A scoped current executor inventory, never a credential, raw registry or task success. */
import {exact,isId,isHex,sha,CheckpointError,fail} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from './life-content-wire.mjs';
import {DIRECTORY_PATH} from './life-runtime-authority.mjs';
export function createLifeDirectoryHandler({authenticate,directory,clock=Date.now}){
 if(typeof authenticate!=='function'||typeof directory!=='function')fail('directory_authority_required');
 async function principal(req){const p=await authenticate(req);if(!p||!isHex(p.ownerDigest)||!isHex(p.workerDigest)||!isHex(p.authorizationBinding)||p.expiresAt<=clock())fail('directory_auth_required');return p;}
 return async(req,res)=>{
  if(req.url!==DIRECTORY_PATH)return false;
  const send=(status,x)=>{if(res.destroyed)return;const b=Buffer.from(contentCanonical(x));res.writeHead(status,{'content-type':'application/json','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(b);};
  try{
   if(req.method!=='POST')fail('directory_method_invalid');const first=await principal(req);
   if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']||req.headers.origin||req.headers.cookie)fail('directory_headers_invalid');
   const len=req.headers['content-length'];if(len!==undefined&&(!/^\d{1,4}$/.test(len)||+len>4096))fail('directory_size_invalid');
   const parts=[];let size=0;const timer=setTimeout(()=>req.destroy(),15000);timer.unref();
   try{for await(const b of req){size+=b.length;if(size>4096)fail('directory_size_invalid');parts.push(b);}}finally{clearTimeout(timer);}
   const x=contentParse(Buffer.concat(parts));exact(x,'version requestId operation workflowId planDigest');
   if(x.version!==1||x.operation!=='current'||!isId(x.requestId)||!isId(x.workflowId)||!isHex(x.planDigest))fail('directory_request_invalid');
   const last=await principal(req);
   if(first.authorizationBinding!==last.authorizationBinding||[first,last].some(p=>!p.scopes?.has('jh.life.directory.read')||p.workflowId!==x.workflowId||p.planDigest!==x.planDigest))fail('directory_scope_denied');
   const snapshot=directory(last);
   send(200,{version:1,ok:true,requestId:x.requestId,operation:x.operation,workerDigest:last.workerDigest,complete:true,snapshot,snapshotDigest:sha(contentCanonical(snapshot))});
  }catch(e){const code=e instanceof CheckpointError?e.code:'directory_unavailable';send(code==='directory_auth_required'?401:code==='directory_scope_denied'?403:code==='directory_size_invalid'?413:code==='directory_unavailable'?503:400,{ok:false,code});}
  return true;
 };
}
