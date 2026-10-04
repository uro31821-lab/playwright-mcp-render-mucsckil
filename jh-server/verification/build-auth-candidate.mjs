import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const baseline=readFileSync(path.join(root,'server.mjs'),'utf8');
const gitBlob=createHash('sha1').update(`blob ${Buffer.byteLength(baseline)}\0`).update(baseline).digest('hex');
if(gitBlob!=='2c4fc54d0c2789b8c02e825c3946b9777e14a694') throw Error('Unexpected baseline: refusing approximate patch');
const oldEntry='if(secureHeaderPresent&&(!dm||dm.secureBridgeVersion!==56||!active56(d)))';
const newEntry='if(secureHeaderPresent&&(pollProbe.reject("device_record_missing",!dm)||pollProbe.reject("secure_metadata_mismatch",dm.secureBridgeVersion!==56)||pollProbe.reject("session_not_active",!active56(d))))';
const oldGate='if(!a||sid!==a.sessionId||dev!==a.deviceDigest||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,"poll|"+sid+"|"+dev+"|"+nonce+"|"+exp))||!seen56(a.seenPoll,nonce)){res.writeHead(401).end("secure poll required");return;}';
const newGate='if(pollProbe.reject("session_missing",!a)||pollProbe.reject("session_id_mismatch",sid!==a.sessionId)||pollProbe.reject("device_digest_mismatch",dev!==a.deviceDigest)||pollProbe.reject("nonce_format_invalid",!validToken56(nonce))||pollProbe.reject("request_expired",exp<Date.now())||pollProbe.reject("request_expiry_too_far",exp-Date.now()>60000)||pollProbe.reject("mac_mismatch",!eqHex56(mac,hmac56(a.secret,"poll|"+sid+"|"+dev+"|"+nonce+"|"+exp)))||pollProbe.reject("nonce_replayed",!seen56(a.seenPoll,nonce))){pollProbe.record();res.writeHead(401).end("secure poll required");return;}';
const entryBody='res.writeHead(401,{"content-type":"application/json","cache-control":"no-store"}).end(JSON.stringify({ok:false,code:"secure_session_repair_required"}));return;';
const route='if(req.method==="GET" && url.pathname==="/device/poll"){';
const changes=[
  [route,route+'\n    const pollProbe=makeRejectionProbe();'],
  [oldEntry,newEntry],
  [entryBody,'pollProbe.record();'+entryBody],
  [oldGate,newGate],
  ['const nonce=token56(),expiresAt=Date.now()+SECURE56_JOB_MS,pd=payloadDigest56(p);',
   'const nonce=token56(),expiresAt=Math.min(a.expiresAt,Date.now()+SECURE56_JOB_MS),pd=payloadDigest56(p);']
];
let candidate=baseline;
for(const [before,after] of changes){
  if(candidate.split(before).length!==2)throw Error('Patch anchor not unique');
  candidate=candidate.replace(before,after);
}
const extraImport='import {makeRejectionProbe} from "./auth-rejection-probe.mjs";\n';
candidate=extraImport+candidate;
let restored=candidate.slice(extraImport.length);
for(const [before,after] of [...changes].reverse())restored=restored.replace(after,before);
if(restored!==baseline)throw Error('Candidate changed bytes outside diagnostic edits and the job deadline cap');
const out=path.join(root,'verification-output');
mkdirSync(path.join(out,'original'),{recursive:true});mkdirSync(path.join(out,'candidate'),{recursive:true});
writeFileSync(path.join(out,'original','server.mjs'),baseline);
writeFileSync(path.join(out,'candidate','server.mjs'),candidate);
copyFileSync(path.join(here,'auth-rejection-probe.mjs'),path.join(out,'candidate','auth-rejection-probe.mjs'));
const sha=x=>createHash('sha256').update(x).digest('hex');
writeFileSync(path.join(out,'candidate-identity.json'),JSON.stringify({schema:2,baselineGitBlob:gitBlob,baselineSha256:sha(baseline),candidateSha256:sha(candidate),diagnosticOnly:false,jobSignedExpiryCapped:true,sessionLifetimeChanged:false,authenticationAcceptanceRulesChanged:false,patchReversalEqualsBaseline:true,phoneOperations:0,productionDeployment:false,scope:'poll rejection diagnostics plus signed job deadline cap; no Android app modification or automatic approval'},null,2));
console.log('Candidate generation: exact baseline, diagnostic edits and session-bounded job deadline verified');
