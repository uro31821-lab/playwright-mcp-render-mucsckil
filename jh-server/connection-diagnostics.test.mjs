import test from 'node:test';
import assert from 'node:assert/strict';
import http, {createServer as esmCreateServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {classifyRoute,expiryDelta,makeObserver,installDiagnostics} from './connection-diagnostics.mjs';

const fakeRequest=(method='GET',url='/device/poll?deviceId=PRIVATE_DEVICE')=>({method,url,headers:{}});
const fakeResponse=status=>Object.assign(new EventEmitter(),{statusCode:status});

test('only fixed route labels; queries, job IDs, and frame leases are never returned',()=>{
  const cases=[['GET','/device/poll?deviceId=secret','poll'],['POST','/device/register','register'],
    ['POST','/device/activate','activate'],['POST','/job/private-job/complete','complete'],
    ['POST','/device/frame/private-frame','frame'],['GET','/health',null],['POST','/mcp',null],
    ['POST','/job/a/b/complete',null],['GET','/device/poll/unknown',null],['GET','x'.repeat(8193),null]];
  for(const [method,url,expected] of cases)assert.equal(classifyRoute(method,url),expected);
});

test('expiry is a bounded numeric difference; invalid headers cannot leak text',()=>{
  for(const header of [undefined,null,['60001'],'SECRETVALUE','NaN','-1','1.2','1e9','9007199254740992'])
    assert.equal(expiryDelta(header,1000),null);
  assert.equal(expiryDelta('61940',1000),60940);
  assert.equal(expiryDelta('60000',1000),59000);
  assert.equal(expiryDelta('0',4000000),-3600000);
  assert.equal(expiryDelta('8000000',0),3600000);
});

test('does not attach request body handlers or change request/response methods',()=>{
  const logs=[];const o=makeObserver({sink:x=>logs.push(x)});
  const req=fakeRequest(); req.on=()=>{throw Error('must not read request body');};
  req.headers={'x-jh-session':'SECRET_SESSION','x-jh-mac':'SECRET_MAC','authorization':'Bearer SECRET_BEARER','x-jh-expires':String(Date.now()+60000)};
  const before=JSON.stringify(req.headers);const res=fakeResponse(401);const ownKeys=Object.keys(req);
  o.observe(req,res);res.emit('finish');res.emit('close');o.close();
  assert.equal(JSON.stringify(req.headers),before);assert.deepEqual(Object.keys(req),ownKeys);
  assert.equal(logs.filter(x=>x.event==='response').length,1);
  for(const secret of ['SECRET_SESSION','SECRET_MAC','SECRET_BEARER','PRIVATE_DEVICE'])assert.ok(!JSON.stringify(logs).includes(secret));
});

test('401 metadata distinguishes signed expiry range without claiming the rejection reason',()=>{
  const logs=[];const o=makeObserver({sink:x=>logs.push(x),now:()=>100000});
  const req=fakeRequest();req.headers={'x-jh-session':'hidden','x-jh-expires':'160940'};
  const res=fakeResponse(401);o.observe(req,res);res.emit('finish');o.close();
  assert.equal(logs[0].status,401);assert.equal(logs[0].expiryMinusServerNowMs,60940);
  assert.equal(logs[0].sessionHeaderPresent,true);assert.ok(!('cause' in logs[0]));
});

test('closed responses are not counted as successful polls',()=>{
  const logs=[];const o=makeObserver({sink:x=>logs.push(x)});const res=fakeResponse(200);
  o.observe(fakeRequest(),res);res.emit('close');res.emit('finish');o.close();
  assert.equal(logs[0].status,0);assert.equal(logs.at(-1).lastSuccessfulPollAgeMs,null);
  assert.equal(logs.at(-1).counts['poll:transport_closed'],1);
});

test('logs are bounded; summary preserves dropped event count',()=>{
  const logs=[];const o=makeObserver({sink:x=>logs.push(x),now:()=>1000,eventBudget:3});
  for(let i=0;i<100;i++){const res=fakeResponse(401);o.observe(fakeRequest(),res);res.emit('finish');}
  o.close();assert.equal(logs.filter(x=>x.event==='response').length,3);
  assert.equal(logs.at(-1).responsesObserved,100);assert.equal(logs.at(-1).suppressedEvents,97);
});

test('successful poll/activation ages are explicitly instance-wide and resettable',()=>{
  let clock=1000;const logs=[];const o=makeObserver({sink:x=>logs.push(x),now:()=>clock});
  for(const [method,url,status] of [['POST','/device/activate',200],['GET','/device/poll',204]]){
    const res=fakeResponse(status);o.observe(fakeRequest(method,url),res);res.emit('finish');clock+=100;
  }
  o.flush();const summary=logs.at(-1);assert.equal(summary.lastSuccessfulPollAgeMs,100);
  assert.equal(summary.lastSuccessfulActivationAgeMs,200);o.close();
});

test('logging failures cannot escape into request handling',()=>{
  const o=makeObserver({sink:()=>{throw Error('logger down');}});
  assert.doesNotThrow(()=>{const res=fakeResponse(409);o.observe(fakeRequest('POST','/device/register'),res);res.emit('finish');o.close();});
});

// Synthetic, localhost-only fixture for the *unchanged* current server checks.
const secret=Buffer.alloc(32,7),session='synthetic_session',device='synthetic_device';
const hmac=s=>createHmac('sha256',secret).update(s).digest('hex');
const signedHeaders=({delta=45000,nonce='unique_test_nonce_0001',badMac=false}={})=>{
  const exp=Date.now()+delta;
  return {'x-jh-session':session,'x-jh-device':device,'x-jh-nonce':nonce,'x-jh-expires':String(exp),
    'x-jh-mac':badMac?'0'.repeat(64):hmac(`poll|${session}|${device}|${nonce}|${exp}`)};
};
async function exercise(instrumented){
  const seen=new Set(),logs=[];const original=http.createServer;
  const guard=instrumented?installDiagnostics({sink:x=>logs.push(x)}):null;
  if(instrumented)assert.equal(esmCreateServer,http.createServer);
  const server=esmCreateServer(async(req,res)=>{
    if(req.url.startsWith('/device/poll')){
      const sid=req.headers['x-jh-session'],dev=req.headers['x-jh-device'],nonce=req.headers['x-jh-nonce'];
      const exp=Number(req.headers['x-jh-expires']),mac=req.headers['x-jh-mac'];
      const expected=hmac(`poll|${session}|${device}|${nonce}|${exp}`);
      let good=typeof mac==='string'&&mac.length===64&&/^[0-9a-f]{64}$/.test(mac)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(mac,'hex'));
      // Same time, scope, MAC, nonce checks; diagnostics do not modify any of them.
      good=good&&sid===session&&dev===device&&/^[A-Za-z0-9_-]{16,160}$/.test(nonce||'')&&exp>=Date.now()&&exp-Date.now()<=60000&&!seen.has(nonce);
      if(!good){res.writeHead(401,{'content-type':'text/plain'});res.end('secure poll required');return;}
      seen.add(nonce);res.writeHead(204);res.end();return;
    }
    let body='';for await(const chunk of req)body+=chunk;
    const status=req.url==='/device/register'?409:200;
    res.writeHead(status,{'content-type':'application/json','x-test':'unchanged'});res.end(body||'{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  async function request(path,{headers={},method='GET',body=''}={}){
    return new Promise((resolve,reject)=>{
      const r=http.request({host:'127.0.0.1',port,path,headers,method},res=>{
        let data='';res.setEncoding('utf8');res.on('data',s=>data+=s);res.on('end',()=>resolve({status:res.statusCode,data,contentType:res.headers['content-type'],testHeader:res.headers['x-test']}));
      });r.on('error',reject);r.end(body);
    });
  }
  try{
    const replay=signedHeaders();const results=[];
    results.push(await request('/device/poll?deviceId=PRIVATE_DEVICE',{headers:replay}));
    results.push(await request('/device/poll',{headers:replay}));
    results.push(await request('/device/poll',{headers:signedHeaders({delta:-1000,nonce:'unique_expired_0001'})}));
    results.push(await request('/device/poll',{headers:signedHeaders({delta:90000,nonce:'unique_ahead_000001'})}));
    results.push(await request('/device/poll',{headers:signedHeaders({badMac:true,nonce:'unique_bad_mac_001'})}));
    results.push(await request('/device/poll'));
    results.push(await request('/device/register',{method:'POST',body:'{"secret":"BODY_MUST_NOT_BE_LOGGED"}'}));
    results.push(await request('/mcp',{method:'POST',body:'{"private":"MCP_PAYLOAD"}'}));
    results.push(await request('/job/hidden-job/complete',{method:'POST',body:'{"private":"RESULT_PAYLOAD"}'}));
    assert.deepEqual(results.slice(0,6).map(x=>x.status),[204,401,401,401,401,401]);
    return {results,logs};
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    guard?.close();assert.equal(http.createServer,original);assert.equal(esmCreateServer,original);
  }
}

test('real local HTTP integration: exact response equality, bodies intact, replay and bad auth rejected',async()=>{
  const baseline=await exercise(false),observed=await exercise(true);
  assert.deepEqual(observed.results,baseline.results);
  for(const secret of ['BODY_MUST_NOT_BE_LOGGED','MCP_PAYLOAD','RESULT_PAYLOAD','hidden-job','PRIVATE_DEVICE','synthetic_session','synthetic_device'])
    assert.ok(!JSON.stringify(observed.logs).includes(secret));
  assert.ok(observed.logs.some(x=>x.status===401&&x.expiryMinusServerNowMs>60000));
});

test('options overload and listener order survive installation and teardown',async()=>{
  const guard=installDiagnostics({sink:()=>{}});const handler=(_req,res)=>res.end('ok');
  const server=http.createServer({maxHeaderSize:8192},handler);
  assert.equal(server.maxHeaderSize,8192);assert.equal(server.listeners('request').at(-1),handler);
  guard.close();assert.deepEqual(server.listeners('request'),[handler]);
});

// Pure boundary arithmetic: 940 ms phone-ahead minus 100 ms transit exceeds the current 60 s cap.
test('small clock skew can cross the existing upper expiry bound; not a production root-cause assertion',()=>{
  const serverNow=100000, phoneAhead=940, transit=100;
  const expiry=serverNow+phoneAhead+60000;
  assert.equal(expiry-(serverNow+transit),60840);
  assert.equal(expiry-(serverNow+transit)<=60000,false);
  assert.equal((serverNow+phoneAhead+45000)-(serverNow+transit)<=60000,true);
});
