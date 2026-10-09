/** Reserved PC setup route in the EXISTING HTTP server. Internal install only,
 * once and before listen. This is dispatch/lifecycle, not an auth provider. */
const ORIGIN='https://jh-secure-bridge-fix4.onrender.com';
const BASE='/jh/setup/google';
const inNamespace=p=>p===BASE||p.startsWith(BASE+'/');
export function createPcOwnerSetupSlot(isListening){
 if(typeof isListening!=='function')throw Error('PC_SETUP_LISTENER_STATE_REQUIRED');
 let handler=null,installed=false,closing=false;
 const pending=new Set();
 function reply(res,status,code){
  if(res.destroyed||res.writableEnded)return;
  if(res.headersSent){res.destroy();return;}
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}).end(JSON.stringify({ok:false,code}));
 }
 function quiesce(){closing=true;}
 return Object.freeze({
  install(fn){
   if(installed||closing||isListening()||typeof fn!=='function')throw Error('PC_SETUP_INSTALL_BEFORE_LISTEN_ONCE');
   installed=true;handler=fn;
   return Object.freeze({quiesce,async drain(){quiesce();await Promise.allSettled([...pending]);}});
  },
  quiesce,
  async handle(req,res){
   const raw=typeof req.url==='string'?req.url:'';
   let url;
   try{url=new URL(raw,ORIGIN);}catch{
    if(!raw.startsWith('/jh/setup/'))return false;
    reply(res,400,'PC_SETUP_PATH_REJECTED');req.resume?.();return true;
   }
   if(!inNamespace(url.pathname)&&!inNamespace(raw.split('?')[0].split('#')[0]))return false;
   // No path normalization, URL token/query, alternate host, or absolute-form
   // request is allowed to turn into a Google setup action.
   if(raw!==url.pathname||url.origin!==ORIGIN||url.search||url.hash){
    reply(res,400,'PC_SETUP_PATH_REJECTED');req.resume?.();return true;
   }
   if(!handler||closing){
    reply(res,closing?503:404,closing?'PC_SETUP_STOPPING':'PC_SETUP_NOT_CONFIGURED');req.resume?.();return true;
   }
   let resolve;
   const done=new Promise(ok=>{resolve=ok;});pending.add(done);
   try{if(await handler(req,res,url)!==true)reply(res,404,'PC_SETUP_ROUTE_NOT_FOUND');}
   catch{reply(res,503,'PC_SETUP_REQUEST_UNCONFIRMED');}
   finally{resolve();pending.delete(done);}
   return true;
  }
 });
}
