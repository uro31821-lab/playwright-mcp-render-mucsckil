/** Observe only the existing authenticated completion handler's successful reply.
 * Does not read request bodies, change responses, or change admission decisions.
 * HTTP finish is not client receipt proof; only the server's accepted device
 * result is recorded. Persistence failure retains the unresolved dispatch.
 */
const installed=new WeakSet();
export function installCompletionObserver(server,authority,onError=()=>{}){
 if(!server||typeof server.on!=='function'||typeof server.off!=='function'||
    typeof authority?.recordAuthenticatedCompletion!=='function'||typeof onError!=='function'||installed.has(server))throw Error('COMPLETION_OBSERVER_CONFIGURATION');
 installed.add(server);const pending=new Map();let closed=false;
 const listener=(req,res)=>{
  const match=req.method==='POST'&&/^\/job\/(job_[1-9][0-9]*)\/complete$/.exec(req.url||'');
  if(closed||!match)return;
  const cleanup=()=>{res.off('finish',finish);res.off('close',cleanup);pending.delete(res);};
  const finish=()=>{
   cleanup();if(closed||res.statusCode!==200)return;
   try{authority.recordAuthenticatedCompletion(match[1]);}
   catch(e){try{onError(/^[A-Z_]{3,80}$/.test(e?.code||'')?e.code:'COMPLETION_RECEIPT_NOT_SAVED');}catch{}}
  };
  pending.set(res,cleanup);res.once('finish',finish);res.once('close',cleanup);
 };
 server.on('request',listener);
 return {close(){if(closed)return;closed=true;server.off('request',listener);for(const c of pending.values())c();installed.delete(server);}};
}
