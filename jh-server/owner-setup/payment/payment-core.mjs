import {resolveChoiceContext} from './payment-choice.mjs';
import {DatabaseSync} from 'node:sqlite';
import {requirePaymentActive} from './payment-lifecycle.mjs';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdirSync,chmodSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {isIP} from 'node:net';

export const fail=code=>{throw Object.assign(new Error(code),{code});};
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const codeOf=e=>/^[A-Z][A-Z0-9_]{2,80}$/.test(e?.code||'')?e.code:'PAYMENT_OPERATION_UNCONFIRMED';
const chars=(s,n)=>Array.from(s).slice(0,n).join('');
export function text(v,max=80){
  if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v))fail('INVALID_PAYMENT_TEXT');
  return v.trim();
}
export function safeHttps(raw){
  if(typeof raw!=='string'||raw.length>4096||/[\s\\]/.test(raw))fail('INVALID_PAYMENT_URL');
  let u;try{u=new URL(raw);}catch{fail('INVALID_PAYMENT_URL');}
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||isIP(host)||host.startsWith('[')||
    !host.includes('.')||/(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host)||host.endsWith('.'))fail('INVALID_PAYMENT_URL');
  return u.href;
}
export function normalizeIntent(p,now=Date.now()){
  if(!p||typeof p!=='object'||Array.isArray(p))fail('PAYMENT_INPUT_REQUIRED');
  const allowed=new Set(['request_key','merchant','purpose','order_id','amount','currency','method','bank','account','holder','source_url','checkout_url','expires_at','device_id','decision_id','choice_item_id','choice_payment_scope']);
  if(Object.keys(p).some(k=>!allowed.has(k)))fail('UNSUPPORTED_PAYMENT_FIELD');
  const method=p.method;
  if(!['BANK_TRANSFER','CARD','KAKAOPAY','SAMSUNGPAY'].includes(method))fail('UNSUPPORTED_PAYMENT_METHOD');
  if(!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount>Number.MAX_SAFE_INTEGER/100)fail('INVALID_KRW_AMOUNT');
  if(p.currency!==undefined&&p.currency!=='KRW')fail('ONLY_KRW_SUPPORTED');
  const value={request_key:text(p.request_key,120),merchant:text(p.merchant,80),purpose:text(p.purpose,120),order_id:text(p.order_id,120),amount:p.amount,currency:'KRW',method,
    source_url:safeHttps(p.source_url)};
  if(method==='BANK_TRANSFER'){
    value.bank=text(p.bank,30);value.account=text(p.account,40).replace(/[ -]/g,'');value.holder=text(p.holder,60);
    if(!/^\d{6,30}$/.test(value.account))fail('INVALID_BANK_ACCOUNT');
    if(p.checkout_url)value.checkout_url=safeHttps(p.checkout_url);
  }else{
    if(p.bank||p.account||p.holder)fail('CARD_INPUT_CANNOT_INCLUDE_BANK_ACCOUNT');
    value.checkout_url=safeHttps(p.checkout_url);
  }
  if(p.device_id)value.device_id=text(p.device_id,160);
  if(p.decision_id||p.choice_item_id||p.choice_payment_scope){value.decision_id=text(p.decision_id,64);value.choice_item_id=text(p.choice_item_id,120);value.choice_payment_scope=p.choice_payment_scope||'FULL_ITEM';}
  const expiry=p.expires_at===undefined?now+30*60*1000:Date.parse(p.expires_at);
  if(!Number.isFinite(expiry)||expiry<=now||expiry>now+7*24*60*60*1000)fail('INVALID_PAYMENT_EXPIRY');
  value.expires_at=expiry;
  return value;
}
export function loadConfig(env=process.env){
  if(env.JH_PAYMENT_ENABLED!=='1')fail('PAYMENT_FEATURE_NOT_ENABLED');
  const owner=env.JH_OPERATIONAL_ACCOUNT_DIGEST;
  if(!/^[a-f0-9]{64}$/.test(owner||''))fail('PAYMENT_OWNER_NOT_CONFIGURED');
  const root=env.JH_PAYMENT_STATE_DIR|| (env.JH_WORKFLOW_STATE_DIR?path.join(env.JH_WORKFLOW_STATE_DIR,'payment'):null);
  if(!root||!path.isAbsolute(root))fail('PAYMENT_PERSISTENT_DIRECTORY_REQUIRED');
  const key=Buffer.from(env.JH_PAYMENT_ENCRYPTION_KEY||'','base64');
  if(key.length!==32||key.toString('base64')!==env.JH_PAYMENT_ENCRYPTION_KEY)fail('PAYMENT_ENCRYPTION_KEY_REQUIRED');
  const base=safeHttps(env.PUBLIC_BASE_URL).replace(/\/$/,'');
  if(new URL(base).pathname!=='/')fail('PAYMENT_PUBLIC_ORIGIN_REQUIRED');
  return {owner,root,key,base,kakaoClientId:env.JH_KAKAO_REST_API_KEY||'',kakaoClientSecret:env.JH_KAKAO_CLIENT_SECRET||'',
    callback:base+'/jh-payments/kakao/callback'};
}

// A feature ledger inside the existing JH owner host, not a payment executor.
// BEGIN IMMEDIATE and unique constraints claim side effects before dispatch.
export class PaymentStore{
  constructor({root,key,owner,now=()=>Date.now()}){
    if(!Buffer.isBuffer(key)||key.length!==32||!/^[a-f0-9]{64}$/.test(owner||''))fail('INVALID_PAYMENT_STORE_CONFIG');
    mkdirSync(root,{recursive:true,mode:0o700});
    if(realpathSync(root)!==path.resolve(root)||!lstatSync(root).isDirectory())fail('PAYMENT_DIRECTORY_UNSAFE');
    this.file=path.join(root,'payments-v1.sqlite');
    if(existsSync(this.file)&&(!lstatSync(this.file).isFile()||lstatSync(this.file).isSymbolicLink()||lstatSync(this.file).nlink!==1))fail('PAYMENT_STORE_UNSAFE');
    this.key=Buffer.from(key);this.owner=owner;this.now=now;
    this.db=new DatabaseSync(this.file);chmodSync(this.file,0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,dedupe TEXT UNIQUE NOT NULL,order_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS links(hash TEXT PRIMARY KEY,scope TEXT NOT NULL,ticket TEXT,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);
    try{this.transaction(()=>{const old=this.getRecord('meta','identity');if(old){if(old.owner!==owner)fail('PAYMENT_OWNER_MISMATCH');}else this.setRecord('meta','identity',{owner,version:1});});}
    catch(e){this.db.close();this.key.fill(0);throw e;}
  }
  encode(label,value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);c.setAAD(Buffer.from(this.owner+'|'+label));return Buffer.concat([iv,c.update(JSON.stringify(value)),c.final(),c.getAuthTag()]).toString('base64');}
  decode(label,raw){try{const b=Buffer.from(raw,'base64'),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAAD(Buffer.from(this.owner+'|'+label));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}catch{fail('PAYMENT_STORE_KEY_OR_DATA_INVALID');}}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  getRecord(kind,id){const r=this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind,id);return r?this.decode(kind+'|'+id,r.body):null;}
  setRecord(kind,id,v){this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind,id,this.encode(kind+'|'+id,v));}
  create(p,binding=null,choice=null){
    const now=this.now(),v=normalizeIntent(p,now);
    // Default expiry must not change the identity of a retried preparation.
    const {expires_at,...stable}=v;
    const fingerprint=digest(JSON.stringify({...stable,expires_at:p.expires_at||null})),dedupe=digest(this.owner+'|'+v.request_key),orderKey=digest(this.owner+'|'+v.merchant+'|'+v.order_id);
    return this.transaction(()=>{
      const prior=this.db.prepare('SELECT id,fingerprint FROM tickets WHERE dedupe=? OR order_key=?').all(dedupe,orderKey);
      if(prior.length){if(prior.length!==1||prior[0].fingerprint!==fingerprint)fail('PAYMENT_ORDER_ALREADY_EXISTS_OR_CHANGED');return {ticket:this.get(prior[0].id),reused:true};}
      const id='pay_'+randomBytes(16).toString('hex');
      const ticket={id,...v,...(binding?{command_binding:binding}:{}),...(choice?{choice_context:choice}:{}),created_at:now,status:'PREPARED',message_status:'NOT_SENT',open_status:'NOT_OPENED',payment_verified:false,events:[{kind:'PREPARED',at:now}]};
      this.db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?)').run(id,dedupe,orderKey,fingerprint,this.encode('ticket|'+id,ticket));return {ticket,reused:false};
    });
  }
  get(id){if(!/^pay_[a-f0-9]{32}$/.test(id||''))fail('INVALID_PAYMENT_ID');const r=this.db.prepare('SELECT body FROM tickets WHERE id=?').get(id);if(!r)fail('PAYMENT_NOT_FOUND');return this.decode('ticket|'+id,r.body);}
  change(id,fn){return this.transaction(()=>{const t=this.get(id);fn(t);if(t.events.length>60)t.events=t.events.slice(-60);this.db.prepare('UPDATE tickets SET body=? WHERE id=?').run(this.encode('ticket|'+id,t),id);return t;});}
  event(t,kind){t.events.push({kind,at:this.now()});}
  ensureActionable(t){if(t.lifecycle_cancelled)fail('PAYMENT_PREPARATION_DISCARDED_NO_REPLAY');if(this.now()>=t.expires_at)fail('PAYMENT_EXPIRED_PREPARE_REVIEW_REQUIRED');if(t.status==='USER_REPORTED_PAID')fail('PAYMENT_ALREADY_REPORTED_PAID');if(t.status==='PAYMENT_SUCCESS_OBSERVED')fail('PAYMENT_SUCCESS_ALREADY_OBSERVED');if(t.final_flow?.state==='CANCELLED')fail('PAYMENT_PREPARATION_CANCELLED');}
  claim(id,channel){return this.change(id,t=>{this.ensureActionable(t);const field=channel==='MESSAGE'?'message_status':'open_status';const initial=channel==='MESSAGE'?'NOT_SENT':'NOT_OPENED';if(t[field]!==initial)fail('PAYMENT_ACTION_ALREADY_CLAIMED_NO_REPLAY');t[field]='IN_FLIGHT';this.event(t,channel+'_CLAIMED');});}
  settle(id,channel,state,extra={}){return this.change(id,t=>{const field=channel==='MESSAGE'?'message_status':'open_status';if(t[field]!=='IN_FLIGHT')fail('PAYMENT_ACTION_STATE_CHANGED');t[field]=state;Object.assign(t,extra);this.event(t,channel+'_'+state);});}
  reportPaid(id){return this.change(id,t=>{if(t.lifecycle_cancelled)fail('PAYMENT_PREPARATION_DISCARDED_NO_REPLAY');if(['USER_REPORTED_PAID','PAYMENT_SUCCESS_OBSERVED'].includes(t.status))return;t.status='USER_REPORTED_PAID';t.payment_verified=false;this.event(t,'USER_REPORTED_PAID');});}
  link(scope,ticket=null,ttl=15*60*1000){const raw=randomBytes(32).toString('base64url');this.db.prepare('INSERT INTO links(hash,scope,ticket,expires) VALUES(?,?,?,?)').run(digest(raw),scope,ticket,this.now()+ttl);return raw;}
  resolve(raw,scope,consume=false){if(!/^[\w-]{43}$/.test(raw||''))fail('PAYMENT_LINK_INVALID');return this.transaction(()=>{const r=this.db.prepare('SELECT * FROM links WHERE hash=?').get(digest(raw));if(!r||r.scope!==scope||r.used||r.expires<=this.now())fail('PAYMENT_LINK_EXPIRED_OR_INVALID');if(consume)this.db.prepare('UPDATE links SET used=1 WHERE hash=?').run(r.hash);return r;});}
  close(){this.db.close();this.key.fill(0);}
}

export function publicTicket(t,now=Date.now()){
  return {...t,expired:now>=t.expires_at,payment_verified:false,
    needs_review:['IN_FLIGHT','UNKNOWN'].includes(t.message_status)||['IN_FLIGHT','UNKNOWN'].includes(t.open_status)||['DISPATCHING','UNKNOWN'].includes(t.final_flow?.state),
    instruction:t.status==='PAYMENT_SUCCESS_OBSERVED'?'판매처 완료 화면에서 주문·금액과 영수증을 확인했습니다. 금융기관 API 검증과 구분합니다.':t.status==='USER_REPORTED_PAID'?'주인님이 결제했다고 표시했습니다. 실제 결제내역은 별도 확인이 필요합니다.':t.final_flow?'최종 결제 상태와 영수증은 life_payment_result로 확인하세요. 요청 전달이나 인증 대기를 결제 성공으로 보고하지 마세요.':'결제정보 전달이나 화면 열기는 결제완료가 아닙니다. 최종 확정 직전에 사용자 승인을 받으세요.'};
}
export function kakaoMessage(t,url){
  const lines=['[JH 결제할 내용]',chars(t.merchant,24),chars(t.purpose,24),`금액: ${t.amount.toLocaleString('ko-KR')}원`];
  if(t.method==='BANK_TRANSFER')lines.push(`${chars(t.bank,15)} ${t.account}`,`예금주: ${chars(t.holder,24)}`);
  else lines.push(`결제수단: ${{CARD:'카드',KAKAOPAY:'카카오페이',SAMSUNGPAY:'삼성월렛'}[t.method]}`);
  lines.push('상태: 결제 대기');
  const body=lines.join('\n');if(Array.from(body).length>200)fail('KAKAO_MESSAGE_TOO_LONG');
  return {object_type:'text',text:body,link:{web_url:url,mobile_web_url:url},button_title:'결제정보 보기'};
}

export class PaymentService{
  constructor({config,store,fetchImpl=globalThis.fetch,openCheckout,inspectCheckout,lifecycle,choiceLookup,resultVerifier,now=()=>Date.now()}){this.lifecycle=lifecycle;this.choiceLookup=choiceLookup;this.resultVerifier=resultVerifier;this.config=config;this.store=store;this.fetch=fetchImpl;this.openCheckout=openCheckout;this.inspectCheckout=inspectCheckout;this.now=now;this.refreshing=null;}
  status(id){return publicTicket(this.store.get(id),this.now());}
  prepare(input){const binding=this.lifecycle?.captureBinding(input);const choice=resolveChoiceContext(this,input,binding);const {ticket,reused}=this.store.create(input,binding,choice);requirePaymentActive(this,ticket);return {ok:true,reused,...publicTicket(ticket,this.now())};}
  reportPaid(id){const t=this.store.get(id);this.lifecycle?.assertBinding(t);return this.store.reportPaid(id);}
  reviewUrl(id){const t=this.store.get(id);this.store.ensureActionable(t);requirePaymentActive(this,t);return this.config.base+'/jh-payments/review/'+this.store.link('REVIEW',id,30*60*1000);}
  connectionUrl(){if(!this.config.kakaoClientId)fail('KAKAO_APP_CONFIGURATION_REQUIRED');return this.config.base+'/jh-payments/connect/'+this.store.link('CONNECT');}
  authorizeUrl(connect){this.store.resolve(connect,'CONNECT',true);const state=this.store.link('OAUTH');const u=new URL('https://kauth.kakao.com/oauth/authorize');u.search=new URLSearchParams({client_id:this.config.kakaoClientId,redirect_uri:this.config.callback,response_type:'code',scope:'talk_message',state}).toString();return u.href;}
  async kakaoRequest(url,options){
    let res;try{res=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{fail('KAKAO_NETWORK_RESULT_UNKNOWN');}
    let data;try{data=await res.json();}catch{fail('KAKAO_RESPONSE_INVALID');}
    if(!res.ok){const e=new Error('KAKAO_REQUEST_REJECTED');e.code=res.status===401?'KAKAO_RECONNECT_REQUIRED':'KAKAO_REQUEST_REJECTED';e.definitiveRejection=res.status>=400&&res.status<500;throw e;}
    return data;
  }
  async tokenRequest(params){const form=new URLSearchParams({...params,client_id:this.config.kakaoClientId});if(this.config.kakaoClientSecret)form.set('client_secret',this.config.kakaoClientSecret);return this.kakaoRequest('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body:form.toString()});}
  async connectCallback(state,code){
    this.store.resolve(state,'OAUTH',true);if(typeof code!=='string'||!code||code.length>2048)fail('KAKAO_AUTHORIZATION_CODE_REQUIRED');
    const t=await this.tokenRequest({grant_type:'authorization_code',redirect_uri:this.config.callback,code});
    if(typeof t.access_token!=='string'||typeof t.refresh_token!=='string'||!Number.isFinite(t.expires_in)||t.expires_in<=0)fail('KAKAO_TOKEN_RESPONSE_INVALID');
    const user=await this.kakaoRequest('https://kapi.kakao.com/v2/user/me',{headers:{authorization:'Bearer '+t.access_token}});
    if(!Number.isSafeInteger(user.id)&&typeof user.id!=='string')fail('KAKAO_ACCOUNT_ID_INVALID');
    const permissions=await this.kakaoRequest('https://kapi.kakao.com/v2/user/scopes?'+new URLSearchParams({scopes:JSON.stringify(['talk_message'])}),{headers:{authorization:'Bearer '+t.access_token}});
    if(!Array.isArray(permissions.scopes)||!permissions.scopes.some(s=>s.id==='talk_message'&&s.agreed===true&&s.using===true))fail('KAKAO_MESSAGE_CONSENT_REQUIRED');
    this.store.transaction(()=>{const old=this.store.getRecord('kakao','owner');if(old&&String(old.user_id)!==String(user.id))fail('KAKAO_ACCOUNT_CHANGED');this.store.setRecord('kakao','owner',{user_id:String(user.id),access_token:t.access_token,refresh_token:t.refresh_token,expires_at:this.now()+t.expires_in*1000});});
    return {ok:true,connected:true};
  }
  async accessToken(){
    const saved=this.store.getRecord('kakao','owner');if(!saved)fail('KAKAO_CONNECTION_REQUIRED');
    if(saved.expires_at>this.now()+60000)return saved.access_token;
    if(!this.refreshing)this.refreshing=(async()=>{const t=await this.tokenRequest({grant_type:'refresh_token',refresh_token:saved.refresh_token});if(typeof t.access_token!=='string'||!Number.isFinite(t.expires_in)||t.expires_in<=0)fail('KAKAO_TOKEN_RESPONSE_INVALID');const next={...saved,access_token:t.access_token,refresh_token:t.refresh_token||saved.refresh_token,expires_at:this.now()+t.expires_in*1000};this.store.setRecord('kakao','owner',next);return next.access_token;})().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async sendToMe(id,explicit){
    if(explicit!==true)fail('EXPLICIT_SEND_INSTRUCTION_REQUIRED');
    const first=this.store.get(id);this.store.ensureActionable(first);requirePaymentActive(this,first);
    if(first.message_status!=='NOT_SENT')return {ok:false,code:'PAYMENT_ACTION_ALREADY_CLAIMED_NO_REPLAY',...this.status(id)};
    // Refresh/auth failures occur before the durable send claim.
    const access=await this.accessToken();
    const link=this.reviewUrl(id),template=kakaoMessage(first,link);
    requirePaymentActive(this,this.store.get(id));this.store.claim(id,'MESSAGE');
    try{
      const r=await this.kakaoRequest('https://kapi.kakao.com/v2/api/talk/memo/default/send',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams({template_object:JSON.stringify(template)}).toString()});
      if(r.result_code!==0)fail('KAKAO_SEND_NOT_CONFIRMED');
      this.store.settle(id,'MESSAGE','SENT');return {ok:true,...this.status(id)};
    }catch(e){this.store.settle(id,'MESSAGE',e.definitiveRejection?'REJECTED':'UNKNOWN');return {ok:false,code:codeOf(e),...this.status(id)};}
  }
  async open(id,where){
    if(!['PHONE','BROWSER'].includes(where))fail('INVALID_HANDOFF_TARGET');
    const t=this.store.get(id);this.store.ensureActionable(t);requirePaymentActive(this,t);
    if(t.final_flow&&['DISPATCHING','SUBMITTED','AUTHENTICATION_REQUIRED','UNKNOWN','SUCCESS_OBSERVED'].includes(t.final_flow.state))fail('PAYMENT_EXECUTION_ALREADY_CLAIMED_NO_REPLAY');
    if(!t.checkout_url)fail('BANK_TRANSFER_USE_ACCOUNT_INFORMATION');
    if(typeof this.openCheckout!=='function')fail('CHECKOUT_ADAPTER_UNAVAILABLE');
    // Reuse the existing JH signed queue/browser session. Never synthesize Pay URLs.
    if(typeof this.openCheckout.preflight==='function')await this.openCheckout.preflight(t,where);
    if(where==='BROWSER'&&this.final)this.final.reserveBrowser(id);
    requirePaymentActive(this,this.store.get(id));this.store.claim(id,'OPEN');
    try{
      const r=await this.openCheckout(t,where);
      const outcome=r?.delivered===true?'OPEN_REPORTED':r?.rejected===true?'REJECTED':'UNKNOWN';
      this.store.settle(id,'OPEN',outcome,{handoff_target:where});
      return {ok:r?.delivered===true,...this.status(id),handoff:r,final_authentication_by_user:true};
    }catch(e){this.store.settle(id,'OPEN','UNKNOWN');return {ok:false,code:codeOf(e),...this.status(id)};}
  }
  async inspect(id){
    const t=this.store.get(id);if(typeof this.inspectCheckout!=='function')fail('CHECKOUT_INSPECTION_UNAVAILABLE');
    const snapshot=await this.inspectCheckout(t);
    // Evidence remains OBSERVED. An LLM or a caller's boolean cannot mark PAID.
    return {ok:true,...this.status(id),observation:snapshot,evidence_level:'OBSERVED',payment_verified:false};
  }
}
