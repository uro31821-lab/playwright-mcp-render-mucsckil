// TEST ONLY. Synthetic auth grants and clock controls are supplied through private stdin.
import {createServer} from 'node:https';import path from 'node:path';
import {validateOwnerConfiguration} from '../deployment/owner-config.mjs';
import {fixtureConfig} from '../deployment/test-fixture.mjs';
import {createLifeRuntimeSlot} from '../server-continuation/life-runtime-slot.mjs';
import {installConfiguredLifeRuntime} from '../deployment/life-runtime-install.mjs';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeCheckpointHandler} from '../server-continuation/life-checkpoint-http.mjs';
import {createLifeContentHandler} from '../server-continuation/life-content-http.mjs';
import {createLifeWorkerHandler,WORKER_PATH} from '../server-continuation/life-worker-http.mjs';
import {createLifeReconciliationHandler,RECONCILIATION_PATH} from '../server-continuation/life-reconciliation-http.mjs';
import {sha} from '../server-continuation/life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from '../server-continuation/life-content-wire.mjs';
import {createLifeContinuationHost} from '../server-continuation/life-continuation-host.mjs';
import {createRegisteredLifeBootstrap} from '../deployment/life-registered-bootstrap.mjs';
import {credentialDigest,COORDINATOR_SCOPES} from '../server-continuation/life-runtime-authority.mjs';
import {REMOTE_TASK_PATH} from '../server-continuation/life-remote-task-wire.mjs';
import {QUEUE_PATH} from '../server-continuation/life-queue-http.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();const conf=JSON.parse((await lines.next()).value);
let store;delete conf.key;
let offset=conf.offset??0,mode='normal';const grants=new Map(),stats={acquires:0,dispatches:0,dropped:0,recoveryCommits:0,queueSubmits:0,remoteOffers:0,remoteBegins:0,remotePuts:0,errors:[]};const clock=()=>Date.now()+offset;
const registryFile=path.join(path.dirname(conf.databasePath),'runtime-registrations.json');
let registry=existsSync(registryFile)?contentParse(readFileSync(registryFile)):{version:1,epoch:'registered-runtime-fixture',revision:1,ownerDigest:conf.owner,serverDigest:conf.serverDigest,registrations:[]};
function saveRegistry(){writeFileSync(registryFile,contentCanonical(registry),{mode:0o600});}
saveRegistry();
function registration(token,g){
 const specs=g.remoteSpecs,refs=[...new Set(Object.values(specs).flatMap(s=>s.inputRefs))];
 return {registrationId:'registration_'+sha(g.worker+'|'+g.workflow).slice(0,32),workerDigest:g.worker,credentialDigest:credentialDigest(token),role:g.role==='child'?'WORKER':'COORDINATOR',
  enabled:true,available:true,qualityRank:g.role==='child'?10:100,workflowId:g.workflow,planDigest:g.plan,queueDescriptorDigest:g.descriptorDigest,
  issuedAt:g.expiresAt-600000,expiresAt:g.expiresAt,scopes:g.role==='child'?['jh.life.remote.execute']:[...COORDINATOR_SCOPES],contentRefs:refs,taskSpecs:specs,remoteTargets:g.role==='child'?[]:g.targets};
}
let slot,installation;const handlers=[async(req,res)=>slot.handle(req,res)];
const server=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
 const chunks=[];let x;req.on('data',b=>chunks.push(b));req.on('end',()=>{try{x=contentParse(Buffer.concat(chunks));if(req.url===REMOTE_TASK_PATH){if(x.operation==='offer')stats.remoteOffers++;if(x.operation==='begin')stats.remoteBegins++;if(x.operation==='put')stats.remotePuts++;}if(req.url===WORKER_PATH){if(x.operation==='acquire')stats.acquires++;if(x.operation==='dispatch')stats.dispatches++;}if(req.url===RECONCILIATION_PATH&&x.operation==='commit')stats.recoveryCommits++;if(req.url===QUEUE_PATH&&x.operation==='submit')stats.queueSubmits++;}catch{}});
 const originalWriteHead=res.writeHead.bind(res);let pendingHeaders=null;res.writeHead=function(status,headers){if(req.url===REMOTE_TASK_PATH&&mode==='hide_remote_result'){pendingHeaders={status,headers};return res;}return originalWriteHead(status,headers);};
 const end=res.end.bind(res);res.end=function(body,...args){try{const v=contentParse(Buffer.from(body));if(v.ok===false)stats.errors.push({op:x?.operation??'unknown',code:v.code});}catch{};if((req.url===REMOTE_TASK_PATH&&((mode==='drop_remote_begin'&&x?.operation==='begin')||(mode==='drop_remote_put'&&x?.operation==='put')||(mode==='drop_remote_offer'&&x?.operation==='offer')))||(req.url===QUEUE_PATH&&mode==='drop_queue_submit'&&x?.operation==='submit')||(req.url===WORKER_PATH&&((mode==='drop_acquire'&&x?.operation==='acquire')||(mode==='drop_dispatch'&&x?.operation==='dispatch')))||(req.url===RECONCILIATION_PATH&&mode==='drop_recovery_commit'&&x?.operation==='commit')){mode='normal';stats.dropped++;res.destroy();return res;}if(req.url===REMOTE_TASK_PATH&&mode==='hide_remote_result'&&x?.operation==='result'){try{const v=contentParse(Buffer.from(body));if(v.ok===true){v.value=null;v.valueDigest=sha(contentCanonical(null));const b=Buffer.from(contentCanonical(v));originalWriteHead(pendingHeaders.status,{...pendingHeaders.headers,'content-length':b.length});pendingHeaders=null;return end(b,...args);}}catch{res.destroy();return res;}}if(pendingHeaders){originalWriteHead(pendingHeaders.status,pendingHeaders.headers);pendingHeaders=null;}return end(body,...args);};
 try{for(const h of handlers)if(await h(req,res))return;res.writeHead(404).end();}catch{res.destroy();}
});
const config=validateOwnerConfiguration(fixtureConfig(path.dirname(path.dirname(conf.databasePath))));
slot=createLifeRuntimeSlot(()=>server.listening);
const registered=createRegisteredLifeBootstrap(config,{registryFile,keyFile:conf.registeredKeyFile,databasePath:conf.databasePath,clock});
installation=await installConfiguredLifeRuntime({httpServer:server,installLifeContinuationHandler56:h=>slot.install(h)},config,
 {...registered,open:async binding=>{const resources=await registered.open(binding);store=resources.store;return resources;}});
server.on('tlsClientError',()=>{});await new Promise(ok=>server.listen(conf.port??0,'127.0.0.1',ok));console.log(JSON.stringify({event:'ready',port:server.address().port}));
for await(const line of {[Symbol.asyncIterator]:()=>lines}){
 const x=JSON.parse(line);
 if(x.cmd==='grant'){const r=registration(x.token,x.value);const i=registry.registrations.findIndex(v=>v.registrationId===r.registrationId);if(i<0)registry.registrations.push(r);else registry.registrations[i]=r;registry.revision++;saveRegistry();console.log('{"event":"granted"}');}
 else if(x.cmd==='revoke'){registry.registrations=registry.registrations.filter(r=>r.credentialDigest!==credentialDigest(x.token));registry.revision++;saveRegistry();console.log('{"event":"revoked"}');}
 else if(x.cmd==='selection'){for(const r of registry.registrations.filter(r=>r.workflowId===x.workflow&&r.role==='WORKER')){const specs=Object.fromEntries(Object.entries(r.taskSpecs).filter(([id])=>x.targets[id]===r.workerDigest));r.available=Object.keys(specs).length>0;if(r.available){r.taskSpecs=specs;r.contentRefs=[...new Set(Object.values(specs).flatMap(s=>s.inputRefs))];}}registry.revision++;saveRegistry();console.log('{"event":"selection"}');}
 else if(x.cmd==='offset'){offset=x.value;console.log('{"event":"offset"}');}
 else if(x.cmd==='mode'){mode=x.value;console.log('{"event":"mode"}');}
 else if(x.cmd==='stats')console.log(JSON.stringify(stats));
 else if(x.cmd==='cancel'){const c=store.load(conf.owner,x.workflow);store.control(conf.owner,x.workflow,c.revision,'cancel');console.log('{"event":"cancelled"}');}
 else if(x.cmd==='state'){const cp=store.load(conf.owner,x.workflow);console.log(JSON.stringify({cancelled:cp?.cancelled,entries:cp?.entries.map(e=>({status:e.status,invocations:e.invocations,code:e.code}))??[]}));}
 else if(x.cmd==='close'){installation.quiesce();server.closeAllConnections();await new Promise(ok=>server.close(ok));await installation.close();console.log('{"event":"closed"}');break;}
}
