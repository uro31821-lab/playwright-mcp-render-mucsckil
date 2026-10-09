// TEST ONLY. Synthetic auth grants and clock controls are supplied through private stdin.
import {createServer} from 'node:https';import {readFileSync} from 'node:fs';import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeCheckpointHandler} from '../server-continuation/life-checkpoint-http.mjs';
import {createLifeContentHandler} from '../server-continuation/life-content-http.mjs';
import {createLifeWorkerHandler,WORKER_PATH} from '../server-continuation/life-worker-http.mjs';
import {createLifeReconciliationHandler,RECONCILIATION_PATH} from '../server-continuation/life-reconciliation-http.mjs';
import {sha} from '../server-continuation/life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from '../server-continuation/life-content-wire.mjs';
import {createLifeContinuationHost} from '../server-continuation/life-continuation-host.mjs';
import {REMOTE_TASK_PATH} from '../server-continuation/life-remote-task-wire.mjs';
import {QUEUE_PATH} from '../server-continuation/life-queue-http.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();const conf=JSON.parse((await lines.next()).value);
const key=Buffer.from(conf.key,'hex'),store=new LifeCheckpointStore({...conf,key});key.fill(0);delete conf.key;
let offset=conf.offset??0,mode='normal';const grants=new Map(),stats={acquires:0,dispatches:0,dropped:0,recoveryCommits:0,queueSubmits:0,remoteOffers:0,remoteBegins:0,remotePuts:0,errors:[]};const clock=()=>Date.now()+offset;
const authenticate=req=>{const g=grants.get(req.headers.authorization);if(!g)return null;
 const queueGrants=new Map(Object.entries(g.queueGrants??{}).map(([wf,v])=>[wf,{...v,readOnlyTasks:new Set(v.readOnlyTasks)}]));
 return {ownerDigest:conf.owner,workerDigest:g.worker,workflowId:g.workflow,planDigest:g.plan,readOnlyTasks:new Set(g.tasks??[]),queueDescriptorDigest:g.descriptorDigest,
 scopes:new Set(g.role==='child'?['jh.life.remote.execute']:['jh.life.remote.coordinate','jh.life.worker.read','jh.life.worker.execute','jh.life.read','jh.life.write','jh.life.control','jh.life.content.read','jh.life.content.write','jh.life.worker.reconcile','jh.life.queue.read','jh.life.queue.submit']),
 remoteTasks:new Map(Object.entries(g.remoteSpecs??{})),remoteTargets:new Set(g.targets??[]),queueGrants,expiresAt:g.expiresAt,contentClasses:new Set(['INPUT_TEXT','INPUT_SOURCE','RESULT_TEXT']),recoveryTasks:new Map(Object.entries(g.recoveryTasks??{})),contentRefs:new Set(g.inputs??[]),resultTaskIds:new Set(g.tasks??[])};};
const handlers=[createLifeContinuationHost({enableQueue:true,enableRemoteTasks:true,store,authenticate,clock})];
const server=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
 const chunks=[];let x;req.on('data',b=>chunks.push(b));req.on('end',()=>{try{x=contentParse(Buffer.concat(chunks));if(req.url===REMOTE_TASK_PATH){if(x.operation==='offer')stats.remoteOffers++;if(x.operation==='begin')stats.remoteBegins++;if(x.operation==='put')stats.remotePuts++;}if(req.url===WORKER_PATH){if(x.operation==='acquire')stats.acquires++;if(x.operation==='dispatch')stats.dispatches++;}if(req.url===RECONCILIATION_PATH&&x.operation==='commit')stats.recoveryCommits++;if(req.url===QUEUE_PATH&&x.operation==='submit')stats.queueSubmits++;}catch{}});
 const originalWriteHead=res.writeHead.bind(res);let pendingHeaders=null;res.writeHead=function(status,headers){if(req.url===REMOTE_TASK_PATH&&mode==='hide_remote_result'){pendingHeaders={status,headers};return res;}return originalWriteHead(status,headers);};
 const end=res.end.bind(res);res.end=function(body,...args){try{const v=contentParse(Buffer.from(body));if(v.ok===false)stats.errors.push({op:x?.operation??'unknown',code:v.code});}catch{};if((req.url===REMOTE_TASK_PATH&&((mode==='drop_remote_begin'&&x?.operation==='begin')||(mode==='drop_remote_put'&&x?.operation==='put')||(mode==='drop_remote_offer'&&x?.operation==='offer')))||(req.url===QUEUE_PATH&&mode==='drop_queue_submit'&&x?.operation==='submit')||(req.url===WORKER_PATH&&((mode==='drop_acquire'&&x?.operation==='acquire')||(mode==='drop_dispatch'&&x?.operation==='dispatch')))||(req.url===RECONCILIATION_PATH&&mode==='drop_recovery_commit'&&x?.operation==='commit')){mode='normal';stats.dropped++;res.destroy();return res;}if(req.url===REMOTE_TASK_PATH&&mode==='hide_remote_result'&&x?.operation==='result'){try{const v=contentParse(Buffer.from(body));if(v.ok===true){v.value=null;v.valueDigest=sha(contentCanonical(null));const b=Buffer.from(contentCanonical(v));originalWriteHead(pendingHeaders.status,{...pendingHeaders.headers,'content-length':b.length});pendingHeaders=null;return end(b,...args);}}catch{res.destroy();return res;}}if(pendingHeaders){originalWriteHead(pendingHeaders.status,pendingHeaders.headers);pendingHeaders=null;}return end(body,...args);};
 try{for(const h of handlers)if(await h(req,res))return;res.writeHead(404).end();}catch{res.destroy();}
});server.on('tlsClientError',()=>{});await new Promise(ok=>server.listen(conf.port??0,'127.0.0.1',ok));console.log(JSON.stringify({event:'ready',port:server.address().port}));
for await(const line of {[Symbol.asyncIterator]:()=>lines}){
 const x=JSON.parse(line);
 if(x.cmd==='grant'){grants.set('Bearer '+x.token,x.value);console.log('{"event":"granted"}');}
 else if(x.cmd==='revoke'){grants.delete('Bearer '+x.token);console.log('{"event":"revoked"}');}
 else if(x.cmd==='offset'){offset=x.value;console.log('{"event":"offset"}');}
 else if(x.cmd==='mode'){mode=x.value;console.log('{"event":"mode"}');}
 else if(x.cmd==='stats')console.log(JSON.stringify(stats));
 else if(x.cmd==='cancel'){const c=store.load(conf.owner,x.workflow);store.control(conf.owner,x.workflow,c.revision,'cancel');console.log('{"event":"cancelled"}');}
 else if(x.cmd==='state'){const cp=store.load(conf.owner,x.workflow);console.log(JSON.stringify({cancelled:cp?.cancelled,entries:cp?.entries.map(e=>({status:e.status,invocations:e.invocations,code:e.code}))??[]}));}
 else if(x.cmd==='close'){server.closeAllConnections();await new Promise(ok=>server.close(ok));store.close();console.log('{"event":"closed"}');break;}
}
