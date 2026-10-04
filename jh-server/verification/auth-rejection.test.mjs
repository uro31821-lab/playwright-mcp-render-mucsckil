import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {makeEmitter,makeRejectionProbe} from './auth-rejection-probe.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(here,'../verification-output');
const base=readFileSync(path.join(out,'original/server.mjs'),'utf8');
const catalog=base.match(/const SECURE56_TOOL_CATALOG_DIGEST="([a-f0-9]{64})"/)[1];
const clockStart=1790000000000;
const preload=path.join(out,'test-clock.cjs');
writeFileSync(preload,`// Test-only clock and ephemeral port reporting. Never a deploy artifact.\nconst http=require('node:http');const {syncBuiltinESMExports}=require('node:module');let n=Number(process.env.JH_FIXTURE_TIME);Date.now=()=>n;process.on('message',m=>{if(m&&m.kind==='clock'&&Number.isFinite(m.value)){n=m.value;process.send({kind:'clock',value:n});}});const old=http.createServer;http.createServer=function(...args){const s=Reflect.apply(old,this,args);s.once('listening',()=>process.send({kind:'ready',port:s.address().port}));return s;};syncBuiltinESMExports();\n`);
const sha=s=>createHash('sha256').update(s).digest('hex');
const sign=(key,s)=>createHmac('sha256',key).update(s).digest('hex');
const token=()=>randomBytes(18).toString('base64url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(mode){
  const child=fork(path.join(out,mode,'server.mjs'),[],{execArgv:['--require',preload],silent:true,env:{PATH:process.env.PATH,PORT:'0',PUBLIC_BASE_URL:'https://test.invalid',JH_FIXTURE_TIME:String(clockStart)}});
  let logs='';child.stdout.on('data',b=>{logs+=b.toString();});child.stderr.on('data',b=>{logs+=b.toString();});
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('Fixture server start timeout'));},15000);
    child.on('message',m=>{if(m.kind==='ready'){clearTimeout(timer);resolve(m);}});
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Fixture start failed, exit=${code}`));});
  });
  let now=clockStart;
  async function request(route,{method='GET',body,headers={}}={}){
    assert.ok(route.startsWith('/'));
    const r=await fetch(`http://127.0.0.1:${ready.port}${route}`,{method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    return {status:r.status,body:await r.text()};
  }
  const state={request,now:()=>now,logs:()=>logs,async stop(){if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}},async advance(ms){
    const next=now+ms;
    await new Promise(resolve=>{const on=m=>{if(m.kind==='clock'&&m.value===next){child.off('message',on);resolve();}};child.on('message',on);child.send({kind:'clock',value:next});});now=next;
  }};
  state.pair=async()=>{
    const id='fixture-'+token(),deviceDigest=sha('jh56|'+id);
    const r=await request('/device/register',{method:'POST',body:{deviceId:id,bridgeVersion:'TEST_ONLY',secureBridgeVersion:56,deviceDigest,clientNonce:token(),clientTime:now,toolCatalogDigest:catalog}});
    assert.equal(r.status,200,'register fixture');const s=JSON.parse(r.body);const key=Buffer.from(s.secureSessionSecret,'base64url');
    const aNonce=token(),exp=now+30000;
    const ar=await request('/device/activate',{method:'POST',body:{deviceId:id,sessionDigest:s.sessionDigest},headers:{'x-jh-session':s.secureSessionId,'x-jh-device':deviceDigest,'x-jh-nonce':aNonce,'x-jh-expires':String(exp),'x-jh-mac':sign(key,`activate|${s.secureSessionId}|${deviceDigest}|${aNonce}|${exp}`)}});
    assert.equal(ar.status,200,'activate fixture');
    const pair={id,deviceDigest,sid:s.secureSessionId,key};
    pair.headers=(edit={})=>{
      const sid=edit.sid??pair.sid,dev=edit.dev??pair.deviceDigest,nonce=edit.nonce??token(),expiry=edit.exp??(state.now()+30000);
      return {'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(expiry),'x-jh-mac':sign(pair.key,`poll|${sid}|${dev}|${nonce}|${expiry}`)};
    };
    pair.poll=h=>request('/device/poll?deviceId='+encodeURIComponent(pair.id),{headers:h??pair.headers()});
    return pair;
  };
  return state;
}
const results=[];
const cases=[
  {name:'valid signed poll remains accepted',statuses:[204],reason:null,run:async(s,p)=>[await p.poll()]},
  {name:'unregistered target rejected',statuses:[401],reason:'device_record_missing',run:async(s,p)=>[await s.request('/device/poll?deviceId=missing-fixture',{headers:p.headers()})]},
  {name:'legacy metadata with signed header rejected',statuses:[401],reason:'secure_metadata_mismatch',run:async(s,p)=>{await s.request('/device/register',{method:'POST',body:{deviceId:p.id}});return[await p.poll()];}},
  {name:'expired long-lived session rejected',statuses:[401],reason:'session_not_active',run:async(s,p)=>{await s.advance(1800001);return[await p.poll()];}},
  {name:'wrong session id rejected',statuses:[401],reason:'session_id_mismatch',run:async(s,p)=>[await p.poll(p.headers({sid:'wrong-'+token()}))]},
  {name:'missing session header rejected',statuses:[401],reason:'session_id_mismatch',run:async(s,p)=>{const h=p.headers();delete h['x-jh-session'];return[await p.poll(h)];}},
  {name:'wrong device digest rejected',statuses:[401],reason:'device_digest_mismatch',run:async(s,p)=>[await p.poll(p.headers({dev:sha('wrong-device')}))]},
  {name:'malformed nonce rejected',statuses:[401],reason:'nonce_format_invalid',run:async(s,p)=>[await p.poll(p.headers({nonce:'short'}))]},
  {name:'expired request rejected',statuses:[401],reason:'request_expired',run:async(s,p)=>[await p.poll(p.headers({exp:s.now()-1}))]},
  {name:'future request above bound rejected',statuses:[401],reason:'request_expiry_too_far',run:async(s,p)=>[await p.poll(p.headers({exp:s.now()+60001}))]},
  {name:'exact upper time bound preserved',statuses:[204],reason:null,run:async(s,p)=>[await p.poll(p.headers({exp:s.now()+60000}))]},
  {name:'exact lower time bound preserved',statuses:[204],reason:null,run:async(s,p)=>[await p.poll(p.headers({exp:s.now()}))]},
  {name:'invalid MAC rejected',statuses:[401],reason:'mac_mismatch',run:async(s,p)=>{const h=p.headers();h['x-jh-mac']='0'.repeat(64);return[await p.poll(h)];}},
  {name:'truncated MAC rejected',statuses:[401],reason:'mac_mismatch',run:async(s,p)=>{const h=p.headers();h['x-jh-mac']='0';return[await p.poll(h)];}},
  {name:'valid nonce replay is rejected',statuses:[204,401],reason:'nonce_replayed',run:async(s,p)=>{const h=p.headers();return[await p.poll(h),await p.poll(h)];}},
  {name:'bad MAC does not consume nonce',statuses:[401,204],reason:'mac_mismatch',run:async(s,p)=>{const h=p.headers();return[await p.poll({...h,'x-jh-mac':'0'.repeat(64)}),await p.poll(h)];}},
  {name:'earliest failure wins without nonce side effect',statuses:[401,204],reason:'session_id_mismatch',run:async(s,p)=>{const nonce=token();return[await p.poll(p.headers({sid:'wrong',dev:'wrong',nonce,exp:s.now()-1})),await p.poll(p.headers({nonce}))];}},
  {name:'concurrent same signed request accepted only once',statuses:[204,401],reason:'nonce_replayed',run:async(s,p)=>{const h=p.headers();return(await Promise.all([p.poll(h),p.poll(h)])).sort((a,b)=>a.status-b.status);}},
  {name:'missing target keeps original validation response',statuses:[400],reason:null,run:async(s,p)=>[await s.request('/device/poll',{headers:p.headers()})]}
];
for(const scenario of cases)test('HTTP parity: '+scenario.name,async()=>{
  const observed=[];
  for(const mode of ['original','candidate']){
    const s=await start(mode);
    try{
      const p=await s.pair();const response=await scenario.run(s,p);await delay(20);
      assert.deepEqual(response.map(x=>x.status),scenario.statuses);
      const lines=s.logs().split('\n').filter(x=>x.startsWith('JH_AUTH_REJECTION ')).map(x=>JSON.parse(x.slice('JH_AUTH_REJECTION '.length)));
      if(mode==='original')assert.equal(lines.length,0);
      else if(scenario.reason){assert.ok(lines.length>=1,'candidate reason missing');assert.equal(lines[0].reason,scenario.reason);}
      else assert.equal(lines.length,0);
      for(const l of lines){assert.deepEqual(Object.keys(l).sort(),['schema','event','route','reason','atUtc','suppressedSinceLastRecord'].sort());}
      const serialized=JSON.stringify(lines);
      for(const secret of [p.sid,p.key.toString('base64url'),p.deviceDigest,p.id])assert.ok(!serialized.includes(secret),'diagnostic leaked fixture identity');
      observed.push(response);
    }finally{await s.stop();}
  }
  assert.deepEqual(observed[1],observed[0],'original/candidate response differs');
  results.push({scenario:scenario.name,statuses:scenario.statuses,reason:scenario.reason,pass:true});
});
test('diagnostic passes through condition and records only once',()=>{
  const a=[];const p=makeRejectionProbe(x=>a.push(x));assert.equal(p.reject('mac_mismatch',false),false);assert.equal(p.reject('nonce_replayed',true),true);p.record();p.record();assert.deepEqual(a,['nonce_replayed']);
});
test('throwing diagnostic sink cannot change rejected condition',()=>{
  const p=makeRejectionProbe(()=>{throw Error('sink');});assert.equal(p.reject('mac_mismatch',true),true);assert.doesNotThrow(()=>p.record());
});
test('diagnostic never evaluates a later gate after the first failure',()=>{
  let calls=0;const p=makeRejectionProbe(()=>{});const rejected=p.reject('session_missing',true)||p.reject('nonce_replayed',(()=>{calls++;return true;})());assert.equal(rejected,true);assert.equal(calls,0);
});
test('unknown raw strings cannot enter the diagnostic log',()=>{
  const logs=[];const emit=makeEmitter({sink:x=>logs.push(x)});emit('SECRET_CANARY');assert.deepEqual(logs,[]);
});
test('diagnostic rate limit and suppression accounting',()=>{
  let now=100000;const logs=[];const emit=makeEmitter({sink:x=>logs.push(x),now:()=>now,limit:2,windowMs:1000});for(let i=0;i<5;i++)emit('mac_mismatch');assert.equal(logs.length,2);now+=1000;emit('nonce_replayed');assert.equal(logs.length,3);assert.equal(logs[2].suppressedSinceLastRecord,3);
});
test('logging failure never escapes emitter',()=>{
  const emit=makeEmitter({sink:()=>{throw Error('sink');}});assert.doesNotThrow(()=>emit('mac_mismatch'));
});
test('invalid diagnostic configuration rejected explicitly',()=>{
  assert.throws(()=>makeEmitter({limit:0}),RangeError);assert.throws(()=>makeEmitter({windowMs:0}),RangeError);
});
test('completed HTTP scenario evidence',()=>{
  assert.equal(results.length,cases.length);writeFileSync(path.join(out,'http-parity-results.json'),JSON.stringify({scope:'real loopback HTTP, synthetic device identities, fixed test clock',productionChanged:false,androidCompiledThisRun:false,scenarios:results},null,2));
});
