import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const r=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=readFileSync(path.join(r,'server-base/server.after.mjs'),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(original)!=='952390b3d78547cc694566745f4aa4d5e4ad90d6c1fa35a156037cb50ce9f435')throw Error('BASELINE_CHANGED');
const patches=[
 ['const secureStates56=new Map();','let trustedSessionAuthority56=null;\nconst secureStates56=new Map();'],
 ['function active56(deviceId){const s=secureStates56.get(deviceId);if(!s)return null;purge56(s);return s.active;}',
  'function active56(deviceId){const s=secureStates56.get(deviceId);if(!s)return null;purge56(s);if(s.active?.trustId&&(!trustedSessionAuthority56||!trustedSessionAuthority56.sessionAllowed(s.active))){const denied=s.active;try{if(trustedSessionAuthority56)trustedSessionAuthority56.fenceSessions(denied.trustId);}catch{}if(s.active===denied){wipeSession56(denied);s.active=null;}}return s.active;}'],
 ['  signJob56(j,p);','  signJob56(j,p);\n  const trustOrigin56=secureStates56.get(targetDeviceId)?.active;if(trustOrigin56?.trustId&&j.secureSessionId===trustOrigin56.sessionId)Object.defineProperty(j,"trustBindingId",{value:trustOrigin56.trustId,writable:true,enumerable:false});'],
 ['const httpServer=createServer(async(req,res)=>{',`export function installTrustedSessionRegistry56(registry){
  if(trustedSessionAuthority56)throw Error('TRUST_HOST_ALREADY_INSTALLED');
  trustedSessionAuthority56=new TrustedBridgeSessionAuthority({registry,bridge:{
    devices,states:secureStates56,queues,jobs,recentJobs,frameWaiters:frameWaiters56,
    serverDigest:SERVER_IDENTITY_DIGEST56,catalogDigest:SECURE56_TOOL_CATALOG_DIGEST,sessionDigest:sessionDigest56}});
  return trustedSessionAuthority56;
}
export const httpServer=createServer(async(req,res)=>{`],
 ['  const url=new URL(req.url||"/","http://localhost");',`  const url=new URL(req.url||"/","http://localhost");
  if(url.pathname.startsWith('/device/trusted/')){
    if(!trustedSessionAuthority56){res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'}).end('{"ok":false,"code":"TRUST_HOST_NOT_CONFIGURED"}');return;}
    await trustedSessionAuthority56.handle(req,res,url);return;
  }`],
 ['    const cand=st.pending.get(sid)||(st.active&&st.active.sessionId===sid?st.active:null);',
  '    const cand=st.pending.get(sid)||(st.active&&st.active.sessionId===sid?st.active:null);\n    if(cand?.trustId){res.writeHead(401).end("trusted activation route required");return;}'],
 ['next.status="in_progress";next.startedAtMs=Date.now();',
  'if(next.trustBindingId){try{if(!trustedSessionAuthority56)throw Error("TRUST_HOST_MISSING");trustedSessionAuthority56.beforeDispatch(next);}catch{next.status="expired";next.error="TRUST_DISPATCH_FENCED";next.completedAt=new Date().toISOString();res.writeHead(409).end("trusted job fenced");return;}}next.status="in_progress";next.startedAtMs=Date.now();']
];
let next=original;for(const [a,b]of patches){if(next.split(a).length!==2)throw Error('NON_UNIQUE_ANCHOR');next=next.replace(a,b);}
const imp='import {TrustedBridgeSessionAuthority} from "../trusted-server/trusted-bridge-session-authority.mjs";\n';
next=imp+next;let reversed=next.slice(imp.length);for(const [a,b]of patches.toReversed())reversed=reversed.replace(b,a);if(reversed!==original)throw Error('PATCH_SCOPE_CHANGED');
mkdirSync(path.join(r,'server-integration'),{recursive:true});writeFileSync(path.join(r,'server-integration/server.mjs'),next);
copyFileSync(path.join(r,'server-base/auth-rejection-probe.mjs'),path.join(r,'server-integration/auth-rejection-probe.mjs'));
writeFileSync(path.join(r,'evidence/runtime-source-identity.json'),JSON.stringify({baseline:sha(original),candidate:sha(next),reversalEqualsBaseline:true,patchCount:patches.length,productionDeployment:false,trustHostEnabledByDefault:false},null,2));
console.log('TRUST_RUNTIME_BUILT exact patches='+patches.length);
