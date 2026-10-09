/** Isolated test process. Synthetic observations and HTTP redirection are supplied
 * by the parent test, never by production environment variables. */
import {readFileSync} from 'node:fs';
import {validateOwnerConfiguration} from '../deployment/owner-config.mjs';
import {startUnifiedOwnerServer} from '../deployment/unified-service-entry.mjs';
let running;
process.on('message',async x=>{
 try{
  if(x.operation==='close'){await running.close();process.send({closed:true});process.disconnect();return;}
  const config=validateOwnerConfiguration(x.config),key=readFileSync(x.ownerKeyFile);
  if(x.browserEndpoint){const original=globalThis.fetch;
   globalThis.fetch=(url,opts)=>original(String(url)==='https://playwright-mcp-yzcy.onrender.com/mcp'?x.browserEndpoint:url,opts);
  }
  try{running=await startUnifiedOwnerServer({config,key,lifeStorage:x.lifeStorage,storageObservations:x.observations,port:0,bindAddress:'127.0.0.1'});}
  finally{key.fill(0);}
  process.send({ready:true,port:running.port,lifeRuntimeInstalled:running.lifeRuntimeInstalled});
 }catch(e){process.send({failed:true,code:typeof e.code==='string'?e.code:e.message});process.disconnect();process.exitCode=1;}
});
