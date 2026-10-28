import { createHash } from 'node:crypto';
export const NATIVE_BACKEND='JH_ANDROID_NATIVE';
export const GEMINI_HOST='com.google.android.googlequicksearchbox';
export const MAX_PROMPT_BYTES=2048;
export const MAX_PROMPT_POINTS=1200;
export const hash=x=>createHash('sha256').update(String(x),'utf8').digest('hex');
export const text=(x,max=2000)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
export const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
export function safePrompt(x){
 if(!text(x,2400)||[...x].length>MAX_PROMPT_POINTS||Buffer.byteLength(x,'utf8')>MAX_PROMPT_BYTES)return false;
 // Allow ordinary Unicode (including paired emoji), not invisible instructions.
 return !/[\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u.test(x)&&![...x].some(c=>/\p{Cc}/u.test(c)&&c!=='\n');
}
export function youtubeUrl(raw){
 let u;try{u=new URL(raw)}catch{throw Error('INVALID_YOUTUBE_URL')}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('INVALID_YOUTUBE_URL');
 let id;
 if(u.hostname==='youtu.be')id=u.pathname.slice(1);
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){
  if(u.pathname==='/watch')id=u.searchParams.get('v');
  else id=/^\/(?:shorts|live)\/([^/]+)$/.exec(u.pathname)?.[1];
 }
 if(!/^[A-Za-z0-9_-]{11}$/.test(id??''))throw Error('INVALID_YOUTUBE_URL');
 return `https://www.youtube.com/watch?v=${id}`;
}
export function createGeminiNativeTask(r,commandId){
 if(!r||!hex32(commandId)||!/^[A-Za-z0-9_-]{8,80}$/.test(r.id??''))throw Error('TASK_AND_COMMAND_REQUIRED');
 if(!['YOUTUBE','VIDEO','ANDROID'].includes(r.mode)||!text(r.instruction,1200))throw Error('INVALID_REQUEST');
 const url=r.mode==='YOUTUBE'?youtubeUrl(r.url):null;
 const prompt=url?`${url}\n${r.instruction}\n이 영상만 대상으로 제목과 핵심 내용을 알려 주세요. 영상·자막·공개 설명 중 실제 이용한 근거와 접근하지 못한 범위를 구분하세요. 확인하지 않은 타임스탬프는 만들지 마세요.`:r.instruction;
 if(!safePrompt(prompt))throw Error('PROMPT_EXCEEDS_SHARED_PHONE_LIMIT_OR_UNSAFE_TEXT');
 let nativeAction=null;
 if(r.mode==='ANDROID'){
  const a=r.nativeAction;
  if(a?.kind!=='OPEN_APP'||a.packageName!==r.expectedTargetPackage||!text(a.label,100)||
   !/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(a.packageName??'')||
   ['com.openai.chatgpt','com.koreanlifehub.bridge','com.android.systemui'].includes(a.packageName))
    throw Error('EXPLICIT_SAFE_NATIVE_OPEN_REQUIRED');
  nativeAction={kind:'OPEN_APP',packageName:a.packageName,label:a.label};
 }
 return {schema:4,id:r.id,commandId,mode:r.mode,prompt,promptDigest:hash(prompt),url,nativeAction,
  requestDigest:hash(JSON.stringify([r.mode,prompt,nativeAction])),backend:NATIVE_BACKEND,
  workSide:'LEFT',chatSide:'RIGHT',presentation:'CHATGPT_RESULT',phase:'READY',sequence:0,
  pending:null,result:null,accountBinding:null,conversationId:null,deviceId:null,sessionId:null,
  sentMessageId:null,submittedAt:null,cancelled:false};
}
export const bound=(a,b)=>!!a&&!!b&&['deviceId','sessionId','commandId'].every(k=>text(a[k],200)&&a[k]===b[k]);
export const sameTurn=(a,b)=>text(a?.accountBinding,200)&&text(a?.conversationId,200)&&
 a.accountBinding===b?.accountBinding&&a.conversationId===b?.conversationId;