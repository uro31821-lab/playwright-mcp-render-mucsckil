import test from 'node:test';
import assert from 'node:assert/strict';
import {patchJH167ConnectionV2Runtime} from './jh167-connection-v2-runtime.mjs';
const fixture=`import {createBrowserSession} from 'node:util';
let durableNativeHooks56=null;
const jhCommandContext56=new JhAsyncLocalStorage56();
function jhStartCommand56(device,eventId){return eventId;}
function mk(type,p={},deviceId=null) {return p;}
function poll(){devices.set(d,{...dm,lastSeen:Date.now()});}
function createMcp(){
const registerOAuthTool=(name,config,handler)=>{const scoped=jhCommandTool56(name,config,handler);return server.registerTool(name,{...scoped.config,securitySchemes:oauthSchemes56,_meta:{...(config?._meta||{}),securitySchemes:oauthSchemes56}},scoped.handler);};
return textResult({version:'x',completion401Summary:getSecureCompletion401Summary()});
}
const browserSession=createBrowserSession({transport:{request(options){const message=JSON.parse(options.body);return browserEventTransport.request(options);}}});
export function installDurableNativeCircuit56(options){durableNativeHooks56=createDurableNativeHooks(options);}
`;
test('JH V2 integrates source modules with actual two admission sites, read-only browser rehandshake and status',()=>{
 const x=patchJH167ConnectionV2Runtime(fixture);
 for(const s of ['jhV2CreateIntegration56','jhV2CreateBindings56','jhV2BeginAdmission56();','jhV2JobAdmission56();',
    'uncertainEffectsForMaintenance','connectionV2:jhV2Status56()', 'browserSession.probe()',
    'jhV2Install56();','automaticTaskReplay:false','jhV2RememberSignedPoll56(d,a)',
    'SECURE56_MAC_VALIDATED_POLL','signedDevicePoll:async()=>jhV2SignedPollEvidence56()'])assert.ok(x.includes(s),s);
 const health=x.slice(x.indexOf('browserStatus:async()=>{'),x.indexOf('androidDevices:async()=>'));
 assert.ok(health.includes('await browserSession.probe()'));
 for(const guard of ['owner.activeMcpCalls===0','owner.activeBrowserCalls===0',
   'owner.activeWorkflows===0','owner.queuedJobs===0','owner.runningJobs===0'])
   assert.ok(health.includes(guard),guard);
 for(const forbidden of ['browser_navigate','browser_click','browserTool(', 'mk('])
   assert.equal(health.includes(forbidden),false,forbidden);
 assert.throws(()=>patchJH167ConnectionV2Runtime(x),/ALREADY_PATCHED/);
});
test('connection patch refuses source with drifted begin, mk, auth, browser or host',()=>{
 for(const marker of ['function jhStartCommand56(device,eventId){','function mk(type,p={},deviceId=null) {',
 'return browserEventTransport.request(options);','durableNativeHooks56=createDurableNativeHooks(options);',
 'devices.set(d,{...dm,lastSeen:Date.now()});'])
   assert.throws(()=>patchJH167ConnectionV2Runtime(fixture.replace(marker,'')),/JH_V2_/);
});
