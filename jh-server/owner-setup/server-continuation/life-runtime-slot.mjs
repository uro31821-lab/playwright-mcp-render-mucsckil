/** Reserved continuation namespace in the EXISTING server. Installing a handler grants no
 * authentication. Mount only before listen, once; shutdown fences admission and drains handlers.
 * No default/open fallback, HTTP redirect, token generation, migration or worker auto-start. */
export function createLifeRuntimeSlot(isListening) {
 if(typeof isListening!=='function')throw Error('LIFE_LISTENER_STATE_REQUIRED');
 let handler=null,installed=false,closing=false;const pending=new Set();
 const reply=(res,status,code)=>{if(!res.destroyed&&!res.writableEnded)res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}).end(JSON.stringify({ok:false,code}));};
 function quiesce(){closing=true;}
 return Object.freeze({
  install(fn){
   if(installed||closing||isListening()||typeof fn!=='function')throw Error('LIFE_INSTALL_BEFORE_LISTEN_ONCE');
   installed=true;handler=fn;
   return Object.freeze({quiesce,async drain(){quiesce();await Promise.allSettled([...pending]);}});
  },
  async handle(req,res){
   // Do not normalize malformed paths into an accepted action. Never pass this namespace to Android/MCP.
   const url=typeof req.url==='string'?req.url:'';
   if(!(url==='/jh/life'||url.startsWith('/jh/life/')||url.startsWith('/jh/life?')))return false;
   if(!handler||closing){reply(res,closing?503:404,closing?'LIFE_RUNTIME_STOPPING':'LIFE_RUNTIME_NOT_CONFIGURED');req.resume?.();return true;}
   let resolve;const done=new Promise(ok=>{resolve=ok;});pending.add(done);
   try{if(await handler(req,res)!==true)reply(res,404,'LIFE_ROUTE_NOT_FOUND');}
   catch{reply(res,503,'LIFE_REQUEST_UNCONFIRMED');}
   finally{resolve();pending.delete(done);}
   return true;
  }
 });
}
