/** TEST ONLY. Synthetic bearer principal and software key. Never imported by production startup. */
import {createServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeCheckpointHandler} from '../server-continuation/life-checkpoint-http.mjs';
import {canonical,parse} from '../server-continuation/life-checkpoint-wire.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const conf=JSON.parse((await lines.next()).value);const key=Buffer.from(conf.key,'hex');
const store=new LifeCheckpointStore({databasePath:conf.databasePath,key,serverDigest:conf.serverDigest});key.fill(0);delete conf.key;
const handler=createLifeCheckpointHandler({store,authenticate:req=>req.headers.authorization==='Bearer '+conf.token?{
 ownerDigest:conf.owner,scopes:new Set(['jh.life.read','jh.life.write','jh.life.control']),expiresAt:Date.now()+30000}:null});
let mode='normal',requests=0,sinks=0,dropped=0;const writes={};
const tls=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
 requests++;
 if(req.url==='/sink'){sinks++;res.writeHead(200,{'content-type':'application/json'}).end('{}');return;}
 const chunks=[];req.on('data',b=>chunks.push(b));let x;
 req.on('end',()=>{try{x=parse(Buffer.concat(chunks));if(x.operation==='cas')writes[x.workflowId]=(writes[x.workflowId]||0)+1;}catch{}});
 if(mode==='redirect'){res.writeHead(307,{location:'https://localhost:'+tls.address().port+'/sink'}).end();return;}
 if(mode==='html'){res.writeHead(200,{'content-type':'text/html'}).end('<html/>');return;}
 if(mode==='oversize'){res.writeHead(200,{'content-type':'application/json','content-length':'70000'}).end('{}');return;}
 if(mode==='gzip'){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'}).end('{}');return;}
 if(mode==='truncated'){res.writeHead(200,{'content-type':'application/json','content-length':'100'});res.write('{}');setImmediate(()=>res.destroy());return;}
 const end=res.end.bind(res);
 res.end=function(body,...args){
  if(mode==='drop'&&x?.operation==='cas'){mode='normal';dropped++;res.destroy();return res;}
  if(mode==='wrong-request'&&body){try{const o=parse(Buffer.from(body));o.requestId='unrelated_request';const b=Buffer.from(canonical(o));res.removeHeader('content-length');return end(b,...args);}catch{}}
  return end(body,...args);
 };
 try{if(!await handler(req,res))res.writeHead(404).end();}catch{res.destroy();}
});
tls.on('tlsClientError',()=>{});
await new Promise(ok=>tls.listen(0,'127.0.0.1',ok));
console.log(JSON.stringify({event:'ready',port:tls.address().port}));
for await(const line of {[Symbol.asyncIterator]:()=>lines}){
 const x=JSON.parse(line);
 if(x.cmd==='mode'){
  mode=x.value;
  if(mode==='wrong-hostname')tls.setSecureContext({key:readFileSync(conf.wrongKey),cert:readFileSync(conf.wrongCert)});
  else tls.setSecureContext({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)});
  console.log(JSON.stringify({event:'mode',value:mode}));
 }else if(x.cmd==='stats')console.log(JSON.stringify({event:'stats',requests,sinks,dropped,writes}));
 else if(x.cmd==='close'){tls.closeAllConnections();await new Promise(ok=>tls.close(ok));store.close();console.log(JSON.stringify({event:'closed'}));break;}
}
