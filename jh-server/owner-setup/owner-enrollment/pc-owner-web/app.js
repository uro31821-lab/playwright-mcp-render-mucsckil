'use strict';
// GIS owns the login UI. No password/OTP fields, token storage, or token logs.
(() => {
 const start=document.getElementById('start'),cancel=document.getElementById('cancel'),status=document.getElementById('status');let challenge=null,finished=false,posted=false;
 const send=async(path,body)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch('/jh/setup/google/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-jh-proof-request':'1'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error('REQUEST_REJECTED');return await r.json();}finally{clearTimeout(timer);}};
 start.addEventListener('click',async()=>{
  if(start.disabled)return;start.disabled=true;status.textContent='본인확인 준비 중입니다.';
  try{
   challenge=await send('challenge',{});if(finished)return;cancel.hidden=false;
   const load=new Promise((resolve,reject)=>{const s=document.createElement('script'),timer=setTimeout(()=>reject(new Error('GOOGLE_SCRIPT_TIMEOUT')),15000);s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);reject(new Error('GOOGLE_SCRIPT_FAILED'));};document.head.appendChild(s);});await load;if(finished)return;
   google.accounts.id.initialize({client_id:challenge.googleWebClientId,nonce:challenge.nonce,auto_select:false,ux_mode:'popup',callback:async response=>{
    if(finished||posted)return;posted=true;status.textContent='Google 확인 결과를 검증 중입니다.';
    try{const result=await send('verify',{csrf:challenge.csrf,credential:response.credential});if(finished)return;finished=true;cancel.hidden=true;document.getElementById('google-button').replaceChildren();status.textContent=result.code==='IDENTITY_SAVED_CONFIGURATION_PENDING'?'Google 본인확인 결과를 서버 설정 후보에 저장하고 다시 읽어 확인했습니다. 실제 서비스 활성화·장부 연결·휴대폰 권한 부여는 아직 하지 않았습니다.':result.code==='IDENTITY_VERIFIED_NOT_CONFIGURED'?'Google 본인확인을 마쳤습니다. 서버 설정 적용과 작업 권한 등록은 아직 완료되지 않았습니다.':'완료 여부를 확인하지 못했습니다.';}
    catch{if(!finished){finished=true;status.textContent='확인하지 못했습니다. 자동 재시도하지 않았습니다. 이 창을 닫고 결과를 알려주세요.';}}
   }});
   google.accounts.id.renderButton(document.getElementById('google-button'),{type:'standard',theme:'outline',size:'large',text:'signin_with',locale:'ko'});status.textContent='지정한 Google 계정으로 직접 로그인해 주세요.';
  }catch{finished=true;status.textContent='본인확인 준비에 실패했습니다. 설정을 임의로 바꾸거나 인증정보를 보내지 마세요.';}
 });
 cancel.addEventListener('click',async()=>{finished=true;cancel.disabled=true;document.getElementById('google-button').replaceChildren();try{if(challenge)await send('cancel',{csrf:challenge.csrf});status.textContent='이번 확인을 취소했습니다.';}catch{status.textContent='화면을 중지했습니다. 서버의 취소 확인은 받지 못했습니다.';}});
})();
