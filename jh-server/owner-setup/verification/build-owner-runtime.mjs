import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import path from 'node:path';
await import('./build-trusted-runtime.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),p=path.join(root,'server-integration/server.mjs');
const original=readFileSync(p,'utf8'),sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(original)!=='9f4b9fb6d86aaf21b94e41d814ab7c3f1d2150377b26b395cf75dfa401db72e1')throw Error('TRUSTED_BASELINE_CHANGED');
const patches=[
 ['let trustedSessionAuthority56=null;','let trustedSessionAuthority56=null;\nconst lifeRuntimeSlot56=createLifeRuntimeSlot(()=>httpServer.listening);'],
 ['export const httpServer=createServer(async(req,res)=>{',`export function installLifeContinuationHandler56(handler){return lifeRuntimeSlot56.install(handler);}
export const httpServer=createServer(async(req,res)=>{`],
 ['  const url=new URL(req.url||"/","http://localhost");',`  if(await lifeRuntimeSlot56.handle(req,res))return;
  const url=new URL(req.url||"/","http://localhost");`],
 ['let trustedSessionAuthority56=null;','let trustedSessionAuthority56=null;\nlet ownerEnrollmentHandler56=null;'],
 ['export const httpServer=createServer(async(req,res)=>{',`export function installOwnerEnrollmentHandler56(handler){
  if(ownerEnrollmentHandler56||typeof handler!=="function")throw Error("OWNER_ENROLLMENT_HOST_INVALID");
  ownerEnrollmentHandler56=handler;
}
export const httpServer=createServer(async(req,res)=>{`],
 ['  const url=new URL(req.url||"/","http://localhost");',`  const url=new URL(req.url||"/","http://localhost");
  if(url.pathname.startsWith('/device/owner-enrollment/')){
    if(!ownerEnrollmentHandler56){res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'}).end('{"ok":false,"code":"OWNER_HOST_NOT_CONFIGURED"}');return;}
    await ownerEnrollmentHandler56(req,res,url);return;
  }`],
 ['httpServer.listen(PORT,"0.0.0.0");','if(process.env.JH_OWNER_DEFER_LISTEN!=="1")httpServer.listen(PORT,"0.0.0.0");']
];
let next=original;for(const [a,b] of patches){if(next.split(a).length!==2)throw Error('OWNER_PATCH_ANCHOR_NOT_UNIQUE');next=next.replace(a,b);}
let back=next;for(const [a,b] of [...patches].reverse())back=back.replace(b,a);if(back!==original)throw Error('OWNER_PATCH_SCOPE_CHANGED');
next='import {createLifeRuntimeSlot} from \"../server-continuation/life-runtime-slot.mjs\";\n'+next;
writeFileSync(p,next);writeFileSync(path.join(root,'evidence/owner-runtime-identity.json'),JSON.stringify({baseline:sha(original),candidate:sha(next),reversalEqualsBaseline:true,patches:patches.length,hostEnabledByDefault:false,deferListenSupported:true,lifeRuntimeSlotSupported:true,lifeRuntimeEnabledByDefault:false,productionDeployment:false},null,2));
console.log('OWNER_RUNTIME_BUILT host-disabled-by-default patches='+patches.length);
