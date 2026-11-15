import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJHE2EV1ReadOnlyPorts} from './jh-e2e-v1-ports.mjs';
const stamp='2026-11-16T00:00:00.000Z';
const now=()=>Date.parse(stamp)+1000;
const base={lifeStatus:async()=>({version:213,mobileRightStatus56:{signedPollVerified:true,signedPollVerification:'PASS'}}),
 devices:async()=>({selectedDeviceId:'device_example',devices:[{deviceId:'device_example',active:true,ageSeconds:15}]}),now};
function bridge(extra={}){return makeJHE2EV1ReadOnlyPorts({...base,...extra});}
test('requires existing authenticated read-only ports',()=>assert.throws(()=>makeJHE2EV1ReadOnlyPorts({}),/PORTS_REQUIRED/));
test('backend status alone cannot certify external MCP or signed poll',async()=>{
 const s=await bridge().observe();assert.deepEqual(s.mcpCall,{});assert.equal(s.phoneObservation,null);assert.equal(s.securePollFresh,false);
});
test('fresh external OAuth evidence is accepted only with host attestation',async()=>{
 const mcpEvidence=async()=>({source:'EXTERNAL_OAUTH_TOOL_INVOCATION',trustedByHost:true,observedAt:stamp,ok:true});
 assert.equal((await bridge({mcpEvidence}).observe()).mcpCall.ok,true);
 const notTrusted=async()=>({source:'EXTERNAL_OAUTH_TOOL_INVOCATION',observedAt:stamp,ok:true});
 assert.deepEqual((await bridge({mcpEvidence:notTrusted}).observe()).mcpCall,{});
});
test('stale external OAuth and watchdog evidence remains UNKNOWN',async()=>{
 const mcpEvidence=async()=>({source:'EXTERNAL_OAUTH_TOOL_INVOCATION',trustedByHost:true,observedAt:'2026-11-15T23:50:00.000Z',ok:true});
 const independentWatchdog=async()=>({source:'INDEPENDENT_WATCHDOG',trustedByHost:true,observedAt:'2026-11-15T23:50:00.000Z',checked:true,reachable:false});
 const s=await bridge({mcpEvidence,independentWatchdog}).observe();
 assert.deepEqual(s.mcpCall,{});assert.equal(s.serverObservation,null);
});
test('independent watchdog evidence is accepted only with verified source and freshness',async()=>{
 const independentWatchdog=async()=>({source:'INDEPENDENT_WATCHDOG',trustedByHost:true,observedAt:stamp,checked:true,reachable:false});
 const s=await bridge({independentWatchdog}).observe();assert.deepEqual(s.serverObservation,{trusted:true,checked:true,fresh:true,reachable:false});
});
test('raw phone ON flags are not accepted without signed verifier',async()=>{
 const signedPhoneStatus=async()=>({accessibilitySetting:'ON',accessibilityBound:true,deviceId:'device_example',observedAt:stamp});
 assert.equal((await bridge({signedPhoneStatus}).observe()).phoneObservation,null);
});
test('signed matched fresh phone proof distinguishes ON and service UNBOUND',async()=>{
 const signedPhoneStatus=async()=>({source:'SECURE56_VERIFIER',verifiedByHost:true,signatureVerified:true,deviceId:'device_example',observedAt:stamp,accessibilitySetting:'ON',accessibilityBound:false,secureSessionActive:true});
 const s=await bridge({signedPhoneStatus}).observe(); assert.equal(s.phoneObservation.accessibilityBound,false);
 assert.equal(s.phoneObservation.accessibilitySetting,'ON');assert.equal(s.securePollFresh,false);
});
test('different device proof never becomes PASS',async()=>{
 const signedPhoneStatus=async()=>({source:'SECURE56_VERIFIER',verifiedByHost:true,signatureVerified:true,deviceId:'other',observedAt:stamp,accessibilityBound:true});
 assert.equal((await bridge({signedPhoneStatus}).observe()).phoneObservation,null);
});
test('original job receipt requires original job and command match',async()=>{
 let calls=0;
 const originalJobReceipt=async()=>{calls++;return {source:'ORIGINAL_SIGNED_RECEIPT',verifiedByHost:true,originalJobId:'job_1',originalCommandId:'cmd_1',observedAt:stamp,state:'COMPLETED_VERIFIED'};};
 assert.equal((await bridge({originalJobReceipt}).observe()).jobObservation,null);assert.equal(calls,0);
 assert.equal((await bridge({originalJobReceipt}).observe({originalJobId:'job_1',originalCommandId:'cmd_wrong'})).jobObservation,null);
 assert.equal((await bridge({originalJobReceipt}).observe({originalJobId:'job_1',originalCommandId:'cmd_1'})).jobObservation.receiptVerified,true);
});
test('port errors are UNKNOWN and never trigger effectful action',async()=>{
 const s=await bridge({lifeStatus:async()=>{throw Error('sensitive_exception')},devices:async()=>{throw Error('sensitive_exception')}}).observe();
 assert.equal(s.lifeStatus,null);assert.equal(s.devicesRead,null);assert.deepEqual(s.mcpCall,{});
 assert.equal(JSON.stringify(s).includes('sensitive_exception'),false);
});
