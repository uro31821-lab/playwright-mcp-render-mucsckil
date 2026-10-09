/** Exact startup-only extension of the sealed owner/Life/browser runtime.
 * No existing route or authentication function is rewritten. */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertUnifiedRuntime} from './unified-runtime-build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const PC_PARENT_SHA='108ad68ef5c87db4c311e3569a0d2a06b09726a2a638ac4f7ee1319d169fd14b';
export const PC_SLOT_SHA='5190da0f646efee4b153c42cc6f454444377720e60b0503d67c53b8b30b03239';
const PREFIX='import {createPcOwnerSetupSlot} from "../deployment/pc-owner-runtime-slot.mjs";\n';
const SLOT='const lifeRuntimeSlot56=createLifeRuntimeSlot(()=>httpServer.listening);';
const ADDED='\nconst pcOwnerSetupSlot56=createPcOwnerSetupSlot(()=>httpServer.listening);';
const CREATE='export const httpServer=createServer(async(req,res)=>{';
const INSTALL='export function installPcOwnerSetupHandler56(handler){return pcOwnerSetupSlot56.install(handler); }\n';
const DISPATCH='\n  if(await pcOwnerSetupSlot56.handle(req,res))return;';
const CLOSE='httpServer.once("close",()=>browserEventTransport.close());';
const STOP='httpServer.once("close",()=>pcOwnerSetupSlot56.quiesce());\n';
export function assemblePcOwnerRuntime(bytes){
 if(!Buffer.isBuffer(bytes)||sha(bytes)!==PC_PARENT_SHA)throw Error('PC_SETUP_PARENT_IDENTITY_MISMATCH');
 const source=bytes.toString('utf8');
 for(const s of [SLOT,CREATE,CLOSE])if(source.split(s).length!==2)throw Error('PC_SETUP_RUNTIME_ANCHOR_MISMATCH');
 const output=PREFIX+source.replace(SLOT,SLOT+ADDED).replace(CREATE,INSTALL+CREATE+DISPATCH).replace(CLOSE,STOP+CLOSE);
 const reversed=output.slice(PREFIX.length).replace(SLOT+ADDED,SLOT).replace(INSTALL+CREATE+DISPATCH,CREATE).replace(STOP+CLOSE,CLOSE);
 if(reversed!==source)throw Error('PC_SETUP_RUNTIME_SCOPE_MISMATCH');
 return Buffer.from(output);
}
function expected(root){
 const parent=assertUnifiedRuntime(root);
 if(sha(readFileSync(path.join(root,'deployment/pc-owner-runtime-slot.mjs')))!==PC_SLOT_SHA)throw Error('PC_SETUP_SLOT_IDENTITY_MISMATCH');
 return assemblePcOwnerRuntime(readFileSync(parent));
}
export function assertPcOwnerRuntime(root){
 const bytes=expected(root),target=path.join(root,'server-integration/server-pc-owner.mjs');
 if(!readFileSync(target).equals(bytes))throw Error('PC_SETUP_RUNTIME_IDENTITY_MISMATCH');
 return target;
}
export function buildPcOwnerRuntime(root=path.resolve(import.meta.dirname,'..')){
 const bytes=expected(root),target=path.join(root,'server-integration/server-pc-owner.mjs');
 writeFileSync(target+'.tmp',bytes,{mode:0o600});renameSync(target+'.tmp',target);assertPcOwnerRuntime(root);
 const record={schema:1,parentSha256:PC_PARENT_SHA,slotSha256:PC_SLOT_SHA,outputSha256:sha(bytes),
  reversalEqualsParent:true,existingAuthChanged:false,listenerOpened:false,configurationWritten:false};
 writeFileSync(path.join(root,'evidence/pc-owner-runtime-identity.json'),JSON.stringify(record,null,2)+'\n');
 return record;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(buildPcOwnerRuntime()));
