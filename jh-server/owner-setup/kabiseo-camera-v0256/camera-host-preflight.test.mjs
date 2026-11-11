import assert from 'node:assert/strict';
import {createCameraHostIntegration} from './camera-host-integration.mjs';
import {BASE_CATALOG_DIGEST,CAMERA_TOOL,CAMERA_TOOL_V2,PROTOCOL} from './camera-contract.mjs';

const spec=()=>({optional:spec,min:spec,max:spec});
const z={string:spec};
const request={request_text:'음식을 시원하고 고급스럽게 찍어줘',
  task_digest:'a'.repeat(64),command_id:'b'.repeat(32),device_id:'phone-1'};
const calls=[];
const secureRequests=[];
let handler,versionedHandler;
const integration=createCameraHostIntegration({
  getCatalogDigest:()=>BASE_CATALOG_DIGEST,
  runSecure:async req=>{
    calls.push(req.jobType);
    secureRequests.push(req);
    if(req.jobType==='kabiseo_camera_binding_status')
      return {targetDeviceId:'phone-1',result:{ok:true,sessionId:'activity:7',rightWindowId:77}};
    return {targetDeviceId:'phone-1',result:{ok:true,resultVerified:true}};
  },
  now:()=>1000
});
integration.register({z,registerOAuthTool:(name,config,cb)=>{
  assert.equal(config.annotations.readOnlyHint,false);
  if(name===CAMERA_TOOL){
    assert.ok(Object.hasOwn(config.inputSchema,'camera_command_id'));
    handler=cb;
  }else if(name===CAMERA_TOOL_V2){
    assert.ok(Object.hasOwn(config.inputSchema,'camera_command_id'));
    assert.ok(!Object.hasOwn(config.inputSchema,'command_id'));
    versionedHandler=cb;
  }else assert.fail('unexpected tool registration');
},textResult:v=>v});
assert.equal(typeof handler,'function');
assert.equal(typeof versionedHandler,'function');
assert.deepEqual(await handler(request),{ok:true,protocol:PROTOCOL});
assert.deepEqual(calls,['kabiseo_camera_binding_status','kabiseo_camera_config']);
const newResult=await handler({device_id:'phone-1',task_digest:'a'.repeat(64),
  camera_command_id:'b'.repeat(32),request_text:'음식을 시원하고 고급스럽게 찍어줘'});
assert.equal(newResult.ok,true);
assert.equal(calls.length,4);

// A stale/colliding outer command_id must not override the dedicated ID.
const v2Args={device_id:'phone-1',task_digest:'a'.repeat(64),
  camera_command_id:'c'.repeat(32),command_id:'outer-mcp-bookkeeping',
  request_text:'음식을 시원하고 고급스럽게 찍어줘'};
assert.deepEqual(await versionedHandler(v2Args),{ok:true,protocol:PROTOCOL});
assert.equal(calls.length,6);
assert.deepEqual(calls.slice(-2),['kabiseo_camera_binding_status','kabiseo_camera_config']);
assert.equal(secureRequests.at(-2).mcpToolName,CAMERA_TOOL);
assert.equal(secureRequests.at(-1).mcpToolName,CAMERA_TOOL);
assert.equal(secureRequests.at(-2).args.command_id,'c'.repeat(32));
assert.equal(secureRequests.at(-1).extra.cameraTarget.commandId,'c'.repeat(32));
assert.equal(secureRequests.at(-1).effect,'WRITE_REVERSIBLE');
assert.equal(secureRequests.at(-2).effect,'READ_ONLY');

// No implicit fallback to generic command_id.
const v2Missing=await versionedHandler({device_id:'phone-1',
  task_digest:'a'.repeat(64),command_id:'d'.repeat(32),
  request_text:'음식 촬영 모드'});
assert.equal(v2Missing.code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
assert.equal(calls.length,6);
const v2Bad=await versionedHandler({...v2Args,camera_command_id:'invalid'});
assert.equal(v2Bad.code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
assert.equal(calls.length,6);

const countAfterSuccess=calls.length;
assert.equal((await handler({...request,request_text:''})).code,'CAMERA_PREFLIGHT_TEXT_REJECTED');
const diagnosticWarnings=[];
const priorWarn=console.warn;
try{
  console.warn=(...parts)=>{diagnosticWarnings.push(parts.join(' '));};
  assert.equal((await handler({...request,command_id:'bad'})).code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
  assert.equal((await handler({...request,command_id:undefined})).code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
  assert.equal((await handler({...request,command_id:12345})).code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
  assert.equal((await handler({...request,command_id:'G'.repeat(32)})).code,'CAMERA_PREFLIGHT_COMMAND_REJECTED');
}finally{console.warn=priorWarn;}
for(const kind of ['WRONG_LENGTH','MISSING','WRONG_TYPE','WRONG_FORMAT'])
  assert.ok(diagnosticWarnings.includes('JH_KABISEO_COMMAND_INPUT_SHAPE '+kind));
assert.ok(!diagnosticWarnings.some(x=>x.includes(request.command_id)));

assert.equal((await handler({...request,task_digest:'bad'})).code,'CAMERA_PREFLIGHT_TASK_REJECTED');
assert.equal(calls.length,countAfterSuccess);

let phaseHandler;
createCameraHostIntegration({
  getCatalogDigest:()=>BASE_CATALOG_DIGEST,
  runSecure:async ()=>{throw Error('secret binding transport detail');}
}).register({z,registerOAuthTool:(name,_,cb)=>{if(name===CAMERA_TOOL)phaseHandler=cb;},textResult:v=>v});
const denied=await phaseHandler(request);
assert.equal(denied.code,'CAMERA_BINDING_DISPATCH_FAILED');
assert.equal(JSON.stringify(denied).includes('secret'),false);

let unexpectedHandler,unexpectedCalls=0;
createCameraHostIntegration({
  getCatalogDigest:()=>BASE_CATALOG_DIGEST,
  runSecure:async req=>{unexpectedCalls++;return {targetDeviceId:'phone-1',result:{
    ok:true,sessionId:'activity:7',rightWindowId:77}};},
  now:()=>{throw Error('private host exception');}
}).register({z,registerOAuthTool:(name,_,cb)=>{if(name===CAMERA_TOOL)unexpectedHandler=cb;},textResult:v=>v});
const unexpected=await unexpectedHandler(request);
assert.equal(unexpected.code,'CAMERA_HANDLER_INTERNAL_ERROR');
assert.equal(unexpectedCalls,1);
assert.equal(JSON.stringify(unexpected).includes('private'),false);
assert.equal(Object.hasOwn(unexpected,'mode'),false);
console.log('KABISEO_HOST_PREFLIGHT_PASS');
