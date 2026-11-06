/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerAudioTools} from './audio-host-adapter.mjs';
import {createAudioCapabilityAuthority} from './audio-capability-authority.mjs';
import {createPinnedAudioReleaseAuthority,audioExtensionEnvelope} from './audio-release-authority.mjs';
import {AUDIO_PROTOCOL} from './audio-extension-catalog.mjs';
import {LEGACY_CATALOG_PIN} from './audio-contract.mjs';

// The actual adapter, capability authority and Zod schemas are exercised here.
// The signed transport/completion boundary and device receipts are synthetic;
// this suite proves result preservation and command routing, not phone audio.
const require=createRequire(import.meta.url),{z}=require(process.env.EBISEO_TEST_ZOD||'zod');
const task='2'.repeat(64),commandId='3'.repeat(32),deviceDigest='4'.repeat(64);
const textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const body=result=>JSON.parse(result.content[0].text);

function fixture({result,completeProbe=true,throwAudio=false}={}) {
  const binding={deviceId:'synthetic-phone',deviceDigest,sessionId:'synthetic-session',
    commandId,sessionExpiresAt:100000,processEpoch:'synthetic-process'};
  const ports={releaseAuthority:createPinnedAudioReleaseAuthority(),getCatalogDigest:()=>LEGACY_CATALOG_PIN};
  const capability=createAudioCapabilityAuthority({...ports,captureAdmission:()=>binding,
    currentBinding:()=>binding,now:()=>1000});
  const registered=new Map(),calls=[];
  const secureCall56=async(tool,type,effect,args,extra)=>{
    const job={...extra,type,mcpToolName:tool,secureRequestedEffect:effect,
      taskDigest:args.task_digest,targetDeviceId:args.device_id,targetDeviceDigest:deviceDigest,
      commandId,secureSessionId:binding.sessionId,secureExpiresAt:45000,status:'queued'};
    capability.beforeMk(type,job,binding.deviceId);
    capability.capture(job,job);
    assert.equal(capability.beforeDispatch(job).allowed,true);
    capability.didDispatch(job);job.status='in_progress';
    calls.push({tool,type,effect,args,extra});
    if(type==='secure_device_status') {
      const receipt={ok:true,secureActive:true,deviceResponded:true,
        phoneCapabilities:{EBISEO_AUDIO_EXTENSION:{...audioExtensionEnvelope(),protocol:AUDIO_PROTOCOL}}};
      if(completeProbe)assert.equal(capability.acceptedAuthenticatedCompletion(job,receipt),true);
      return textResult(receipt);
    }
    if(throwAudio)throw Error('SYNTHETIC_RESPONSE_LOSS');
    return result;
  };
  registerAudioTools({z,...ports,capabilityAuthority:capability,secureCall56,
    registerOAuthTool:(name,config,handler)=>registered.set(name,{config,handler})});
  return {registered,calls,
    command:command=>registered.get('life_android_audio_command').handler({task_digest:task,command}),
    status:()=>registered.get('life_android_audio_status').handler({task_digest:task,query:'status'}),
    close:()=>capability.close()};
}

function receipt({armed=true,status='WAITING_FOR_PLAYBACK',action='WAIT_FOR_PLAYBACK',
    applicationVerified=false,engineConfirmed=false,releaseConfirmed=true}={}) {
  return textResult({protocol:AUDIO_PROTOCOL,ok:true,accepted:true,preferencesSaved:true,
    stateChanged:true,engineConfirmed,releaseConfirmed,automaticReplayAllowed:false,
    activation:{armed,status,applicationVerified},startFlow:{action,
      observationRefreshed:action!=='WAIT_FOR_OBSERVATION',appLaunchPerformed:false,
      playbackControlSent:false,launchRecommendation:null}});
}

test('registered GPT instructions arm independently and never add an app-open request',()=>{
  const h=fixture();try{
    const description=h.registered.get('life_android_audio_command').config.description;
    assert.match(description,/음악 재생 여부와 관계없이/);
    assert.match(description,/음악이 없거나 관찰을 확인하지 못해도 유튜브 뮤직을 자동 실행하지 않습니다/);
    assert.match(description,/activation\.armed=true/);
    assert.doesNotMatch(description,/OPEN_YOUTUBE_MUSIC|life_android_open|launchRecommendation/);
    assert.deepEqual(h.calls,[]);
  }finally{h.close();}
});

for(const scenario of [
  {name:'start before playback',status:'WAITING_FOR_PLAYBACK',action:'WAIT_FOR_PLAYBACK'},
  {name:'late start without a verified audio session',status:'WAITING_FOR_SESSION',action:'REUSE_CURRENT_PLAYBACK'},
  {name:'an unavailable observation',status:'UNAVAILABLE',action:'WAIT_FOR_OBSERVATION'},
  {name:'an apply still awaiting native confirmation',status:'APPLYING',action:'REUSE_CURRENT_PLAYBACK'},
  {name:'confirmed current native application',status:'ACTIVE',action:'REUSE_CURRENT_PLAYBACK',
    applicationVerified:true,engineConfirmed:true}
])test('adapter preserves '+scenario.name+' without promoting state or controlling playback',async()=>{
  const result=receipt(scenario),h=fixture({result});try{
    const returned=await h.command({action:'start'});
    assert.equal(returned,result,'the signed host result is returned unchanged');
    assert.deepEqual(body(returned).activation,body(result).activation);
    assert.equal(body(returned).engineConfirmed,scenario.engineConfirmed===true);
    assert.equal(body(returned).startFlow.launchRecommendation,null);
    assert.deepEqual(h.calls.map(x=>x.tool),['life_android_secure_status','life_android_audio_command']);
    assert.deepEqual(h.calls[1].extra.audio,{schemaVersion:1,command:{action:'start'}});
  }finally{h.close();}
});

test('STOP returns the off receipt and queues only the EQ command',async()=>{
  const result=receipt({armed:false,status:'OFF',action:'KEEP_CURRENT_SESSION'}),h=fixture({result});try{
    assert.equal(await h.command({action:'stop'}),result);
    assert.deepEqual(h.calls.map(x=>x.type),['secure_device_status','ebiseo_audio_command']);
    assert.deepEqual(h.calls[1].extra.audio,{schemaVersion:1,command:{action:'stop'}});
    assert.equal(body(result).activation.armed,false);
    assert.equal(body(result).engineConfirmed,false);
  }finally{h.close();}
});

test('runtime unavailable status remains null without fabricating armed or active state',async()=>{
  const result=textResult({protocol:AUDIO_PROTOCOL,ok:false,accepted:false,
    code:'PREFERENCES_UNAVAILABLE',activation:null,engineConfirmed:false}),h=fixture({result});try{
    assert.equal(await h.status(),result);
    assert.equal(body(result).activation,null);
    assert.deepEqual(h.calls.map(x=>x.type),['secure_device_status','ebiseo_audio_status']);
    assert.deepEqual(h.calls[1].extra.audio,{schemaVersion:1,command:{action:'query_status'}});
  }finally{h.close();}
});

test('a returned capability JSON without authenticated completion cannot arm EQ',async()=>{
  const h=fixture({result:receipt(),completeProbe:false});try{
    const result=body(await h.command({action:'start'}));
    assert.equal(result.accepted,false);
    assert.equal(result.code,'AUDIO_PHONE_CAPABILITY_REQUIRED');
    assert.equal(result.preferencesSaved,false);
    assert.equal(Object.hasOwn(result,'activation'),false);
    assert.deepEqual(h.calls.map(x=>x.type),['secure_device_status']);
  }finally{h.close();}
});

test('a lost START reply stays UNKNOWN and never generates a launch or retry',async()=>{
  const h=fixture({throwAudio:true});try{
    const result=body(await h.command({action:'start'}));
    assert.equal(result.code,'AUDIO_HOST_RESULT_UNCONFIRMED');
    assert.equal(result.preferencesSaved,null);
    assert.equal(result.mutationOutcome,'UNKNOWN');
    assert.equal(result.engineConfirmed,false);
    assert.equal(result.automaticReplayAllowed,false);
    assert.equal(Object.hasOwn(result,'activation'),false);
    assert.equal(Object.hasOwn(result,'startFlow'),false);
    assert.deepEqual(h.calls.map(x=>x.type),['secure_device_status','ebiseo_audio_command']);
  }finally{h.close();}
});

test('START and STOP reject player-launch and arbitrary audio-session fields before probing',async()=>{
  const h=fixture({result:receipt()});try{
    const schema=z.object(h.registered.get('life_android_audio_command').config.inputSchema).strict();
    for(const action of ['start','stop'])for(const extra of [{launch:true},{audioSessionId:1},{target:'youtube_music'}]) {
      const command={action,...extra};
      assert.equal(schema.safeParse({task_digest:task,command}).success,false);
      assert.equal(body(await h.command(command)).accepted,false);
    }
    assert.deepEqual(h.calls,[]);
  }finally{h.close();}
});
