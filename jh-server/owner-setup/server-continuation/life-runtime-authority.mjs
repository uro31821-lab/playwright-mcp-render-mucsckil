/** Scoped, pre-provisioned service credentials for the existing Life runtime.
 * No login/token minting, credential copying, account creation or implicit permissions.
 * The reviewed host owns the registry; requests never supply grant/plan/worker definitions.
 * Bearer secrets must be high-entropy and supplied separately by the operator's secret store.
 * Only domain-separated hashes appear in the private registry, never in directory responses.
 */
import {timingSafeEqual} from 'node:crypto';
import {exact,isHex,isId,sha,fail} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from './life-content-wire.mjs';
import {taskSpec} from './life-remote-task-wire.mjs';
export const DIRECTORY_PATH='/jh/life/directory/v1';
export const COORDINATOR_SCOPES=Object.freeze(['jh.life.read','jh.life.write','jh.life.control','jh.life.content.read','jh.life.content.write','jh.life.worker.read','jh.life.worker.execute','jh.life.worker.reconcile','jh.life.queue.read','jh.life.queue.submit','jh.life.remote.coordinate','jh.life.directory.read']);
const ROUTES=new Set(['checkpoint','content','worker','reconcile','queue','remote-task','directory'].map(x=>`/jh/life/${x}/v1`));
const eq=(a,b)=>timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export function credentialDigest(token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(token))fail('runtime_credential_format');
 return sha('JH_LIFE_SERVICE_CREDENTIAL_V1\x00'+token);
}
const boundedArray=(x,max,valid)=>Array.isArray(x)&&x.length<=max&&new Set(x).size===x.length&&x.every(valid);
export function validateRuntimeRegistry(raw,{ownerDigest,serverDigest}){
 // Snapshot all caller-owned nested objects. Reject duplicate JSON fields at the file boundary.
 const text=contentCanonical(raw);if(Buffer.byteLength(text)>262144)fail('runtime_registry_size');
 const x=contentParse(Buffer.from(text));exact(x,'version epoch revision ownerDigest serverDigest registrations');
 if(x.version!==1||!isId(x.epoch)||(x.epoch.length<16||x.epoch.length>60)||!Number.isSafeInteger(x.revision)||x.revision<1||x.ownerDigest!==ownerDigest||x.serverDigest!==serverDigest||
  !isHex(ownerDigest)||!isHex(serverDigest)||!Array.isArray(x.registrations)||x.registrations.length>64)fail('runtime_registry_identity');
 const ids=new Set(),tokens=new Set(),identities=new Set();
 for(const r of x.registrations){
  exact(r,'registrationId workerDigest credentialDigest role enabled available qualityRank workflowId planDigest queueDescriptorDigest issuedAt expiresAt scopes contentRefs taskSpecs remoteTargets');
  if(!isId(r.registrationId)||ids.has(r.registrationId)||!isHex(r.workerDigest)||!isHex(r.credentialDigest)||tokens.has(r.credentialDigest)||!['COORDINATOR','WORKER'].includes(r.role)||
   typeof r.enabled!=='boolean'||typeof r.available!=='boolean'||!Number.isInteger(r.qualityRank)||r.qualityRank<0||r.qualityRank>1000||!isId(r.workflowId)||!isHex(r.planDigest)||!isHex(r.queueDescriptorDigest))fail('runtime_registration_invalid');
  const identity=r.workerDigest+'|'+r.workflowId;if(identities.has(identity))fail('runtime_registration_duplicate');
  ids.add(r.registrationId);tokens.add(r.credentialDigest);identities.add(identity);
  if(!Number.isSafeInteger(r.issuedAt)||r.issuedAt<0||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>600000)fail('runtime_registration_lifetime');
  const allowed=r.role==='WORKER'?['jh.life.remote.execute']:COORDINATOR_SCOPES;
  if(!boundedArray(r.scopes,16,s=>allowed.includes(s))||r.scopes.length<1||!boundedArray(r.remoteTargets,8,isHex)||
   (r.role==='WORKER'&&r.remoteTargets.length!==0)||r.remoteTargets.includes(r.workerDigest))fail('runtime_registration_scopes');
  if(!boundedArray(r.contentRefs,16,s=>isId(s)&&s.startsWith('input_'))||!r.taskSpecs||Array.isArray(r.taskSpecs)||typeof r.taskSpecs!=='object')fail('runtime_registration_inputs');
  const tasks=Object.entries(r.taskSpecs);if(tasks.length<1||tasks.length>16)fail('runtime_registration_tasks');
  const refs=new Set();for(const [id,s] of tasks){if(!isId(id))fail('runtime_registration_tasks');taskSpec(s);for(const ref of s.inputRefs){if(!r.contentRefs.includes(ref))fail('runtime_registration_inputs');refs.add(ref);}}
  if(r.contentRefs.some(ref=>!refs.has(ref)))fail('runtime_registration_inputs');
 }
 return x;
}
/** A registry can be loaded afresh from a private file. No positive auth cache survives
 * revocation. Revision/high-water checks are process-local, not full backup rollback protection. */
export class LifeRuntimeAuthority {
 #load;#owner;#server;#clock;#closed=false;#previous=null;#time=-1;#requests=new WeakMap();
 constructor({load,ownerDigest,serverDigest,clock=Date.now}){
  if(typeof load!=='function'||typeof clock!=='function'||!isHex(ownerDigest)||!isHex(serverDigest))fail('runtime_authority_configuration');
  this.#load=load;this.#owner=ownerDigest;this.#server=serverDigest;this.#clock=clock;this.inspect();
 }
 #now(){const n=this.#clock();if(!Number.isSafeInteger(n)||n<0||n<this.#time)fail('runtime_clock_rollback');this.#time=n;return n;}
 #read(){
  if(this.#closed)fail('runtime_authority_closed');
  const x=validateRuntimeRegistry(this.#load(),{ownerDigest:this.#owner,serverDigest:this.#server}),digest=sha(contentCanonical(x));
  if(this.#previous){const p=this.#previous;if(x.epoch!==p.epoch||x.revision<p.revision||(x.revision===p.revision&&digest!==p.digest))fail('runtime_registry_rollback_or_drift');}
  this.#previous={epoch:x.epoch,revision:x.revision,digest};return {x,digest,generation:x.epoch+':'+x.revision+':'+digest.slice(0,16)};
 }
 inspect(){const s=this.#read();this.#now();return Object.freeze({ownerDigest:this.#owner,serverDigest:this.#server,generation:s.generation,registrations:s.x.registrations.length,credentialsCreated:false});}
 #principal(r,s,now){
  const tasks=Object.keys(r.taskSpecs),remoteTasks=new Map(Object.entries(r.taskSpecs));
  return {ownerDigest:this.#owner,workerDigest:r.workerDigest,workflowId:r.workflowId,planDigest:r.planDigest,queueDescriptorDigest:r.queueDescriptorDigest,
   expiresAt:r.expiresAt,scopes:new Set(r.scopes),readOnlyTasks:new Set(tasks),resultTaskIds:new Set(tasks),contentClasses:new Set(['INPUT_TEXT','INPUT_SOURCE','RESULT_TEXT']),
   contentRefs:new Set(r.contentRefs),remoteTargets:new Set(r.remoteTargets),remoteTasks,
   recoveryTasks:new Map(Object.entries(r.taskSpecs).map(([id,t])=>[id,{kind:t.kind,verificationKey:t.verificationKey}])),
   queueGrants:new Map([[r.workflowId,{planDigest:r.planDigest,descriptorDigest:r.queueDescriptorDigest,expiresAt:r.expiresAt,readOnlyTasks:new Set(tasks)}]]),
   registryGeneration:s.generation,registrationId:r.registrationId,authorizationBinding:sha(s.digest+'|'+contentCanonical(r)),authenticationKind:'PREPROVISIONED_SCOPED_SERVICE',observedAt:now};
 }
 authenticate(req){
  try{
   if(!req||req.method!=='POST'||!ROUTES.has(req.url)||req.headers?.origin||req.headers?.cookie)return null;
   const a=req.headers?.authorization;if(typeof a!=='string'||!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(a))return null;
   if(Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((h,i)=>i%2===0&&String(h).toLowerCase()==='authorization').length!==1)return null;
   const candidate=credentialDigest(a.slice(7)),s=this.#read(),now=this.#now();let match;
   // Equal-sized digest comparisons; no raw credential is retained in a principal, registry or log.
   for(const r of s.x.registrations)if(eq(candidate,r.credentialDigest))match=r;
   if(!match||!match.enabled||now<match.issuedAt||now>=match.expiresAt)return null;
   const p=this.#principal(match,s,now),first=this.#requests.get(req);
   if(first&&(first!==p.authorizationBinding))return null; // no mid-body credential/grant replacement or elevation.
   this.#requests.set(req,p.authorizationBinding);return p;
  }catch{throw new Error('runtime_auth_unavailable');}
 }
 directory(principal){
  const s=this.#read(),now=this.#now();
  if(!principal||principal.ownerDigest!==this.#owner||!principal.scopes?.has('jh.life.directory.read')||principal.registryGeneration!==s.generation)fail('directory_scope_denied');
  const self=s.x.registrations.find(r=>r.registrationId===principal.registrationId);
  if(!self||!self.enabled||self.role!=='COORDINATOR'||self.expiresAt<=now||self.issuedAt>now||sha(s.digest+'|'+contentCanonical(self))!==principal.authorizationBinding)fail('directory_scope_denied');
  const workers=[];let expiresAt=Math.min(now+60000,self.expiresAt);
  for(const r of s.x.registrations){
   if(r.workflowId!==self.workflowId||r.planDigest!==self.planDigest||r.queueDescriptorDigest!==self.queueDescriptorDigest||
    (r.workerDigest!==self.workerDigest&&!self.remoteTargets.includes(r.workerDigest)))continue;
   const active=r.enabled&&r.issuedAt<=now&&r.expiresAt>now;
   // A server-side task contract is NOT a claim about live provider availability. Host.bind still verifies it.
   const specs=Object.fromEntries(Object.entries(r.taskSpecs).filter(([id,t])=>self.taskSpecs[id]&&contentCanonical(t)===contentCanonical(self.taskSpecs[id])).map(([id,t])=>[id,sha(contentCanonical(t))]));
   if(!Object.keys(specs).length)continue;
   const executable=r.workerDigest===self.workerDigest?r.scopes.includes('jh.life.worker.execute'):r.role==='WORKER'&&r.scopes.includes('jh.life.remote.execute');
   workers.push({workerDigest:r.workerDigest,available:active&&r.available&&executable,authRequired:!active||!executable,qualityRank:r.qualityRank,taskSpecDigests:specs});
   if(active)expiresAt=Math.min(expiresAt,r.expiresAt);
  }
  if(workers.length>8)fail('directory_inventory_limit');
  workers.sort((a,b)=>a.workerDigest.localeCompare(b.workerDigest));
  return {generation:s.generation,ownerDigest:this.#owner,serverDigest:this.#server,workflowId:self.workflowId,planDigest:self.planDigest,observedAt:now,expiresAt,workers};
 }
 close(){this.#closed=true;this.#previous=null;this.#requests=new WeakMap();}
}
