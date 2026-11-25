import {readFileSync,writeFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectAudioCandidateRuntime} from '../ebiseo-audio-v05/audio-current-selector.mjs';
import {selectCameraCandidateRuntime} from '../kabiseo-camera-v0256/camera-current-selector.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
function one(source,original,replacement){
  if(source.split(original).length!==2)throw Error('PEER_RELEASE_ANCHOR_CHANGED');
  return source.replace(original,()=>replacement);
}
function read(file){
  if(!lstatSync(file).isFile()||realpathSync(file)!==file)throw Error('PEER_RELEASE_PATH');
  return readFileSync(file,'utf8');
}
export function composePeer(source){
  let out='import {createOwnerChannel,rejectOwnerVerification} from "../ordinary-peer/owner-channel.mjs";\n'+
    'let peerChannel;\nexport function installOwnerPeer(config){if(peerChannel)throw Error("PEER_ALREADY_INSTALLED");peerChannel=createOwnerChannel(config);}\n'+source;
  out=one(out,'function createMcp(){','function createMcp(peerRequest){');
  out=one(out,'const server=createMcp();','const server=createMcp(req);');
  const registration='  jhAudioHost56.register({z,registerOAuthTool});';
  out=one(out,registration,registration+`
  if(peerChannel)peerChannel.register(z,(name,options,handler)=>server.registerTool(name,{
    ...options,securitySchemes:oauthSchemes56,_meta:{securitySchemes:oauthSchemes56}
  },handler),()=>peerChannel.current(peerRequest,oauthAccess56,sha56,OAUTH_SCOPE56));`);
  const html="    const html='<!doctype html><meta charset=\"utf-8\">";
  out=one(out,html,'    if(peerChannel){peerChannel.page(res,p);return;}\n'+html);
  const code='    const code="ac56_"+token56(24);';
  out=one(out,code,`    let peerClaims=null;
    if(peerChannel){try{peerClaims=await peerChannel.verify(req,p);}
    catch(error){rejectOwnerVerification(res,error);return;}}
`+code);
  out=one(out,'oauthCodes56.set(code,{clientId:p.client_id,','oauthCodes56.set(code,{peer59:peerClaims,clientId:p.client_id,');
  out=one(out,'function oauthTokenResponse56(){','function oauthTokenResponse56(peer59){');
  for(const kind of ['Access','Refresh']){
    const token=kind.toLowerCase(),key='oauth'+kind+'56.set(sha56("oauth-'+token+'|"+'+token+'),{expiresAt:now+';
    out=one(out,key,key.replace('{expiresAt','{peer59,expiresAt'));
  }
  const issue='res.writeHead(200).end(JSON.stringify(oauthTokenResponse56()));return;';
  for(const [removal,refresh] of [['oauthCodes56.delete(String(p.code));',false],['oauthRefresh56.delete(key);',true]]){
    const block=removal+'\n      '+issue;
    out=one(out,block,'if(peerChannel&&!peerChannel.accepted(rec.peer59,p,'+refresh+')){res.writeHead(400).end(JSON.stringify({error:"invalid_grant"}));return;}\n      '+removal+'\n      '+issue.replace('oauthTokenResponse56()','oauthTokenResponse56(rec.peer59)'));
  }
  return out;
}
function sources(root,env){
  const camera=!!env.JH_KABISEO_CAMERA_ENABLE;
  const base=(camera?selectCameraCandidateRuntime:selectAudioCandidateRuntime)(root,env);
  const suffix=camera?'kabiseo-camera-v0256':'ebiseo-audio-v05';
  const selector=camera?'selectCameraCandidateRuntime':'selectAudioCandidateRuntime';
  const dir=path.join(root,'deployment');
  const owner=path.join(dir,'owner-service-'+suffix+'.mjs');
  const unified=path.join(dir,'unified-service-'+suffix+'.mjs');
  const entry=path.join(dir,'operational-service-'+suffix+'.mjs');
  const runtime=read(base.file);
  if(sha(runtime)!==base.sha256)throw Error('PEER_PARENT_ATTESTATION');
  const importOriginal='import {'+selector+'} from "../'+(camera?'kabiseo-camera-v0256/camera':'ebiseo-audio-v05/audio')+'-current-selector.mjs";';
  const importRelease='import {selectPeerRuntime} from "../ordinary-peer/peer-release.mjs";';
  let ownerSource=one(read(owner),importOriginal,importRelease);
  ownerSource=one(ownerSource,selector+'(root,process.env).file','selectPeerRuntime(root,process.env).file');
  const install='    host=installConfiguredOwnerHost(runtime,hostOptions(config,key));';
  ownerSource=one(ownerSource,install,install+'\n    runtime.installOwnerPeer(config);');
  const unifiedSource=one(read(unified),path.basename(owner),'owner-service-ordinary-peer.mjs');
  let entrySource=one(read(entry),importOriginal,importRelease);
  entrySource=one(entrySource,path.basename(unified),'unified-service-ordinary-peer.mjs');
  entrySource=one(entrySource,selector+'(ROOT,process.env).file','selectPeerRuntime(ROOT,process.env).file');
  return {parent:base,files:[
    [path.join(root,'server-integration/server-ordinary-peer.mjs'),composePeer(runtime)],
    [path.join(dir,'owner-service-ordinary-peer.mjs'),ownerSource],
    [path.join(dir,'unified-service-ordinary-peer.mjs'),unifiedSource],
    [path.join(dir,'operational-service-ordinary-peer.mjs'),entrySource]
  ]};
}
export function selectPeerRuntime(root,env=process.env){
  const {files}=sources(root,env);
  for(const [file,expected] of files)if(read(file)!==expected)throw Error('PEER_RELEASE_READBACK');
  return {file:files[0][0],sha256:sha(files[0][1])};
}
export function buildPeerRelease(root,env,previous){
  const {parent,files}=sources(root,env);
  if(parent.file!==previous.file||parent.sha256!==previous.candidateSha256)throw Error('PEER_PARENT_MISMATCH');
  for(const [file,value] of files){
    if(!existsSync(file))writeFileSync(file,value,{flag:'wx',mode:0o600});
  }
  const selected=selectPeerRuntime(root,env);
  return {...previous,file:selected.file,entryFile:files[3][0],candidateSha256:selected.sha256,peerEnabled:true};
}
