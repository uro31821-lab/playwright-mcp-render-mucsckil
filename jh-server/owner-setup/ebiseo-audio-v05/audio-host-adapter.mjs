/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {AUDIO_ROUTES,fail,only,normalizeAudioCommand,isReadCommand,makeAudioSchemas,makeReleaseGuard} from './audio-contract.mjs';
import {audioExtensionEnvelope} from './audio-release-authority.mjs';

const textResult = value => ({content:[{type:'text',text:JSON.stringify(value)}]});
const rejected = code => textResult({ok:false,accepted:false,code,preferencesSaved:false,
  stateChanged:false,engineConfirmed:false,automaticReplayAllowed:false});
const unconfirmed = () => textResult({ok:false,accepted:null,code:'AUDIO_HOST_RESULT_UNCONFIRMED',
  preferencesSaved:null,stateChanged:null,engineConfirmed:false,mutationOutcome:'UNKNOWN',
  automaticReplayAllowed:false});

function validateArgs(value,readOnly) {
  only(value,readOnly?['device_id','task_digest','query']:['device_id','task_digest','command']);
  if(typeof value.task_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.task_digest))fail('AUDIO_TASK_DIGEST_REQUIRED');
  if(Object.hasOwn(value,'device_id')&&(typeof value.device_id!=='string'||!value.device_id||
     value.device_id.length>160||/[\u0000-\u001f\u007f]/.test(value.device_id)))fail('AUDIO_DEVICE_INVALID');
  let command;
  if(readOnly) {
    if(Object.hasOwn(value,'query')&&!['track','status'].includes(value.query))fail('AUDIO_QUERY_INVALID');
    command=normalizeAudioCommand({action:value.query==='track'?'query_track':'query_status'});
  } else {
    command=normalizeAudioCommand(value.command);
    if(isReadCommand(command))fail('AUDIO_MUTATION_TOOL_REQUIRED');
  }
  const hostArgs={task_digest:value.task_digest};
  if(value.device_id!==undefined)hostArgs.device_id=value.device_id;
  return {hostArgs,command};
}

export function registerAudioTools({z,registerOAuthTool,secureCall56,releaseAuthority,getCatalogDigest,capabilityAuthority}={}) {
  if(typeof registerOAuthTool!=='function'||typeof secureCall56!=='function')fail('AUDIO_HOST_PORT_REQUIRED');
  const assertRelease=makeReleaseGuard({releaseAuthority,getCatalogDigest});
  const binding=assertRelease();
  if(!capabilityAuthority||!['prepareProbe','finishProbe','abandonProbe'].every(k=>typeof capabilityAuthority[k]==='function'))
    fail('AUDIO_CAPABILITY_HOST_REQUIRED');
  const schemas=makeAudioSchemas(z);
  for(const [index,route] of AUDIO_ROUTES.entries()) {
    const readOnly=index===0;
    const config={
      title:readOnly?'이비서 음향 상태':'이비서 음향 설정',
      description:readOnly?
        '현재 곡 정보 또는 음향 설정을 조회합니다. activation.armed는 EQ 켜짐 선택이며 실제 적용과 구분합니다. 실제 적용은 activation.status="ACTIVE", activation.applicationVerified=true, engineConfirmed=true와 현재 네이티브 확인 근거를 함께 확인합니다. 곡 정보만으로 EQ 적용을 단정하지 않습니다.':
        '이비서 시작은 command {action:"start"}로 EQ 켜기와 AUTO를 함께 저장합니다. 음악 재생 여부와 관계없이 먼저 켜서 대기할 수 있고, 이미 재생 중이면 확인된 현재 오디오 세션에 연결을 시도합니다. 늦게 시작해도 곡을 재시작하지 않습니다. 이비서 중지는 {action:"stop"}이며 EQ만 끄고 유튜브 뮤직 재생은 유지합니다. 음향 처리는 기존 JH 기기 서비스가 맡으며 GPT 화면 유지에 의존하지 않습니다. 시작·중지 명령의 후속 동작으로 앱 열기·재생·일시정지·정지·seek를 요청하지 않습니다. 음악이 없거나 관찰을 확인하지 못해도 유튜브 뮤직을 자동 실행하지 않습니다. activation.armed=true는 켜짐 선택이며 WAITING_FOR_PLAYBACK·WAITING_FOR_SESSION은 대기 상태입니다. 실제 적용은 activation.status="ACTIVE", activation.applicationVerified=true, engineConfirmed=true와 현재 네이티브 확인 근거를 함께 확인합니다. 장르·취향 프리셋과 듣기 환경도 설정합니다. 저장 성공과 곡 정보만으로 실제 EQ 적용을 단정하지 않습니다. 결과 미확인 시 자동 재실행하지 않고 상태를 조회합니다.',
      inputSchema:readOnly?schemas.status:schemas.command,
      annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}
    };
    registerOAuthTool(route.tool,config,async args=>{
      let parsed;
      try { assertRelease();parsed=validateArgs(args,readOnly); }
      catch(e) { return rejected(/^AUDIO_[A-Z_]+$/.test(e?.code||'')?e.code:'AUDIO_ADMISSION_REJECTED'); }
      let probe;
      try {
        probe=capabilityAuthority.prepareProbe(parsed.hostArgs);
        await secureCall56('life_android_secure_status','secure_device_status','READ_ONLY',probe.hostArgs,probe.extra);
        capabilityAuthority.finishProbe(probe);
      } catch(e) {
        capabilityAuthority.abandonProbe(probe);
        return rejected(/^AUDIO_[A-Z_]+$/.test(e?.code||'')?e.code:'AUDIO_PHONE_CAPABILITY_UNCONFIRMED');
      }
      try {
        return await secureCall56(route.tool,route.jobType,route.effect,probe.hostArgs,
          {audioExtension:audioExtensionEnvelope(),audio:{schemaVersion:1,command:parsed.command}});
      } catch { return unconfirmed(); }
    });
  }
  return Object.freeze({registered:true,toolNames:AUDIO_ROUTES.map(x=>x.tool),
    baseCatalogDigest:binding.baseCatalogDigest,extensionDigest:binding.extensionDigest,releaseId:binding.releaseId,
    engineConfirmed:false,phoneVerified:false,automaticReplayAllowed:false});
}
