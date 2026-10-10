/** Additive startup candidate only. The production router never imports this module.
 * Retains the existing owner identity, storage, runtime lock and trust installation;
 * the durable host is installed before the listener and is closed on every exit path.
 */
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const BASE_BLOB='de6022b1a9b984cfa46e3be5f96093966d5a1ff2';
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const PREFIX="import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';\nimport {installOwnerBoundDurableCircuit} from './durable-owner-storage.mjs';\n";
const edits=[
 ["if(runtimeMode==='unified')serverPath=assertFunctionalReleaseRuntime(root);","if(runtimeMode==='unified')serverPath=buildDurableNativeRuntime(root).file;"],
 ['let runtime,host,lifeHost,closed=false;','let runtime,host,lifeHost,durableHost,closed=false;'],
 ['    if(life!==undefined)lifeHost=await installConfiguredLifeRuntime(runtime,config,life);','    if(runtimeMode===\'unified\')durableHost=installOwnerBoundDurableCircuit(runtime,{config,key,storageObservations});\n    if(life!==undefined)lifeHost=await installConfiguredLifeRuntime(runtime,config,life);'],
 ['sessionCreated:false,lifeRuntimeInstalled:!!lifeHost,','sessionCreated:false,lifeRuntimeInstalled:!!lifeHost,durableCircuitInstalled:!!durableHost,'],
 ['try{host.close();}finally{runtimeLock.close();}','try{durableHost?.close();}finally{try{host.close();}finally{runtimeLock.close();}}'],
 ['try{host?.close();}catch{}runtimeLock.close();throw e;','try{durableHost?.close();}catch{}try{host?.close();}catch{}runtimeLock.close();throw e;']
];
export function buildOwnerBoundDurableCandidate(root){
 const source=readFileSync(path.join(root,'deployment/owner-service-entry.mjs'),'utf8');
 if(blob(source)!==BASE_BLOB)throw Error('DURABLE_OWNER_BASELINE_CHANGED');
 let candidate=source;
 for(const [from,to]of edits){if(candidate.split(from).length!==2||candidate.includes(to))throw Error('DURABLE_OWNER_PATCH_ANCHOR');candidate=candidate.replace(from,to);}
 let reversed=candidate;for(const [from,to]of edits.slice().reverse())reversed=reversed.replace(to,from);
 if(reversed!==source)throw Error('DURABLE_OWNER_PATCH_SCOPE');
 candidate=PREFIX+candidate;
 const file=path.join(root,'deployment/owner-service-durable-candidate.mjs');
 writeFileSync(file,candidate,{mode:0o600});
 if(readFileSync(file,'utf8')!==candidate)throw Error('DURABLE_OWNER_READBACK_FAILED');
 return {file,exactEdits:edits.length,productionEnabled:false,sourceBlob:BASE_BLOB};
}
