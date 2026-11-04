import {readFileSync} from 'node:fs';
import path from 'node:path';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={
  CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
  JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1'
};
const built=await buildStage25PendingOperatorEntrypoint56(root,env);
const source=readFileSync(built.runtimeFile,'utf8');
const lines=source.split('\n');
const needles=[
  'async function jhOwnerAdmission155(',
  'jhOwnerAdmission155(',
  'durableNativeHooks56?.beforeDispatch(',
  'OWNER_ADMISSION_BLOCKED',
  'function mk(',
  'function exactEnvelope56(',
  'split_screen_session_followup'
];
const seen=new Set();
for(const needle of needles){
  for(let i=0;i<lines.length;i++){
    if(!lines[i].includes(needle))continue;
    const key=`${needle}:${i}`;if(seen.has(key))continue;seen.add(key);
    const from=Math.max(0,i-14),to=Math.min(lines.length,i+22);
    console.log(`\n=== ${needle} @ line ${i+1} ===`);
    for(let n=from;n<to;n++)console.log(String(n+1).padStart(6,' ')+' | '+lines[n]);
  }
}
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({runtimeFile:built.runtimeFile,runtimeSha256:built.stamp.runtimeSha256,
  stage61ApprovalRouting:built.stamp.stage61ApprovalRouting,
  stage40OwnerAdmissionDiagnostics:built.stamp.stage40OwnerAdmissionDiagnostics,
  listenerStarted:built.listenerStarted,productionEnabled:built.productionEnabled},null,2));
