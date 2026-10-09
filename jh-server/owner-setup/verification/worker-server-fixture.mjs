// TEST ONLY. Synthetic auth grants and clock controls are supplied through private stdin.
import {createServer} from 'node:https';import {readFileSync} from 'node:fs';import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeCheckpointHandler} from '../server-continuation/life-checkpoint-http.mjs';
import {createLifeContentHandler} from '../server-continuation/life-content-http.mjs';
import {createLifeWorkerHandler,WORKER_PATH} from '../server-continuation/life-worker-http.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();const conf=JSON.parse((await lines.next()).value);
const key=Buffer.from(conf.key,'hex'),store=new LifeCheckpointStore({...conf,key});key.fill(0);delete conf.key;
let offset=conf.offset??0,mode='normal';const grants=new Map(),stats={acquires:0,dispatches:0,dropped:0};const clock=()=>Date.now()+offset;
const authenticate=req=>{const g=grants.get(req.headers.authorization);return g?{ownerDigest:conf.owner,workerDigest:g.worker,workflowId:g.workflow,planDigest:g.plan,readOnlyTasks:new Set(g.tasks),
 scopes:new Set(['jh.life.worker.read','jh.life.worker.execute','jh.life.read','jh.life.write','jh.life.control','jh.life.content.read','jh.life.content.write']),
 expiresAt:g.expiresAt,contentClasses:new Set(['INPUT_TEXT','RESULT_TEXT']),contentRefs:new Set(g.inputs),resultTaskIds:new Set(g.tasks)}:null;};
const handlers=[createLifeWorkerHandler({store,authenticate,clock}),createLifeCheckpointHandler({store,authenticate,clock}),createLifeContentHandler({store,authenticate,clock})];
const server=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
 const chunks=[];let x;req.on('data',b=>chunks.push(b));req.on('end',()=>{try{x=contentParse(Buffer.concat(chunks));if(req.url===WORKER_PATH){if(x.operation==='acquire')stats.acquires++;if(x.operation==='dispatch')stats.dispatches++;}}catch{}});
 const end=res.end.bind(res);res.end=function(body,...args){if(req.url===WORKER_PATH&&((mode==='drop_acquire'&&x?.operation==='acquire')||(mode==='drop_dispatch'&&x?.operation==='dispatch'))){mode='normal';stats.dropped++;res.destroy();return res;}return end(body,...args);};
 try{for(const h of handlers)if(await h(req,res))return;res.writeHead(404).end();}catch{res.destroy();}
});server.on('tlsClientError',()=>{});await new Promise(ok=>server.listen(conf.port??0,'127.0.0.1',ok));console.log(JSON.stringify({event:'ready',port:server.address().port}));
for await(const line of {[Symbol.asyncIterator]:()=>lines}){
 const x=JSON.parse(line);
 if(x.cmd==='grant'){grants.set('Bearer '+x.token,x.value);console.log('{"event":"granted"}');}
 else if(x.cmd==='offset'){offset=x.value;console.log('{"event":"offset"}');}
 else if(x.cmd==='mode'){mode=x.value;console.log('{"event":"mode"}');}
 else if(x.cmd==='stats')console.log(JSON.stringify(stats));
 else if(x.cmd==='cancel'){const c=store.load(conf.owner,x.workflow);store.control(conf.owner,x.workflow,c.revision,'cancel');console.log('{"event":"cancelled"}');}
 else if(x.cmd==='state'){const cp=store.load(conf.owner,x.workflow);console.log(JSON.stringify({cancelled:cp?.cancelled,entries:cp?.entries.map(e=>({status:e.status,invocations:e.invocations}))??[]}));}
 else if(x.cmd==='close'){server.closeAllConnections();await new Promise(ok=>server.close(ok));store.close();console.log('{"event":"closed"}');break;}
}
