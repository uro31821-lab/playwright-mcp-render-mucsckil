/** Actual Stage25 HTTP handler, synthetic process and loopback listener only.
 * No owner store, device registration, MCP effect call or phone E2E claim.
 * Keep both modes sequential: the existing builders share generated filenames.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {request} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
const ACK='EXPLICIT_IDENTICAL_SIGNED_RESULT_V1';
const PREFIX='/__jh_mobile13_fixture/v1/';
const REPORT='JH_MOBILE13_STAGE25_HTTP ';
const SYNTHETIC_TOKEN='synthetic-mobile13-http-test-only-token';
const root=path.resolve(import.meta.dirname,'..');
const assets=[
 ['index.html','text/html; charset=utf-8'],
 ['destination.html','text/html; charset=utf-8'],
 ['fixture.css','text/css; charset=utf-8'],
 ['fixture.js','text/javascript; charset=utf-8']
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function rawRequest(port,pathname,method='GET',body){
 // Passing path directly preserves encoded and literal traversal attempts.
 // fetch(new URL(...)) would normalize them before the server sees them.
 return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,path:pathname,method,agent:false,
   headers:{connection:'close',...(body===undefined?{}:{
    'content-type':'text/plain','content-length':Buffer.byteLength(body)
   })}},res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{
    size+=chunk.length;
    if(size>256*1024){res.destroy(Error('SYNTHETIC_RESPONSE_TOO_LARGE'));return;}
    chunks.push(chunk);
   });
   res.once('error',reject);
   res.once('aborted',()=>reject(Error('SYNTHETIC_RESPONSE_ABORTED')));
   res.once('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });
  req.once('error',reject);
  req.setTimeout(5000,()=>req.destroy(Error('SYNTHETIC_HTTP_TIMEOUT')));
  req.end(body);
 });
}

function assertAssetHeaders(reply,type,bytes){
 assert.equal(reply.headers['content-type'],type);
 assert.equal(reply.headers['content-length'],String(bytes.length));
 assert.equal(reply.headers['cache-control'],'no-store');
 assert.equal(reply.headers['x-content-type-options'],'nosniff');
 assert.equal(reply.headers['referrer-policy'],'no-referrer');
 assert.equal(reply.headers['set-cookie'],undefined);
 assert.equal(reply.headers['access-control-allow-origin'],undefined);
 const directives=new Map(String(reply.headers['content-security-policy']||'')
  .split(';').map(part=>part.trim()).filter(Boolean).map(part=>{
   const [name,...values]=part.split(/\s+/);return [name,values.join(' ')];
  }));
 for(const [name,value] of [
  ['default-src',"'self'"],['script-src',"'self'"],['style-src',"'self'"],
  ['connect-src',"'none'"],['form-action',"'none'"],
  ['frame-ancestors',"'none'"],['base-uri',"'none'"]
 ])assert.equal(directives.get(name),value,name);
}

async function syntheticChild(mode){
 assert.ok(mode==='ORIGINAL'||mode==='PHONE_RIGHT');
 const enabled=mode==='PHONE_RIGHT';
 const allowed=['PATH','CI','NODE_ENV','JH_OWNER_DEFER_LISTEN','LIFE_HUB_TOKEN',
  'JH_STAGE26_SIGNED_COMPLETION_ACK',...(enabled?['JH_MOBILE_WEB_13_MODE']:[])];
 assert.deepEqual(Object.keys(process.env).sort(),allowed.sort(),
  'child must not inherit credentials or production settings');
 assert.equal(process.env.CI,'true');
 assert.equal(process.env.NODE_ENV,'test');
 assert.equal(process.env.JH_OWNER_DEFER_LISTEN,'1');
 assert.equal(process.env.LIFE_HUB_TOKEN,SYNTHETIC_TOKEN);
 assert.equal(process.env.JH_STAGE26_SIGNED_COMPLETION_ACK,ACK);
 assert.equal(process.env.JH_MOBILE_WEB_13_MODE,enabled?MODE:undefined);
 let externalRequests=0;
 // The test client uses node:http only. Any runtime fetch is unexpected.
 globalThis.fetch=async()=>{externalRequests++;throw Error('SYNTHETIC_RUNTIME_FETCH_FORBIDDEN');};
 const {buildStage25PendingOperatorEntrypoint56,selectStage25PendingOperatorRuntime56}=
  await import('./stage25-live-operator-followup-entry.mjs');
 const built=await buildStage25PendingOperatorEntrypoint56(root,process.env);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.productionEnabled,false);
 assert.equal(built.originalOperatorPreserved,true);
 const selected=selectStage25PendingOperatorRuntime56(root,process.env);
 assert.equal(selected.file,built.runtimeFile);
 const runtimeSha256=sha(readFileSync(selected.file));
 assert.equal(runtimeSha256,built.stamp.runtimeSha256);
 assert.equal(runtimeSha256,selected.sha256);
 // Confirm this is also the runtime selected by the existing owner front door.
 assert.ok(readFileSync(built.ownerFile,'utf8').includes(
  "if(runtimeMode==='unified')serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;"));
 assert.ok(readFileSync(built.unifiedFile,'utf8').includes(
  "from './owner-service-stage25-followup-operator.mjs';"));
 assert.ok(readFileSync(built.file,'utf8').includes(
  "from './unified-service-stage25-followup-operator.mjs';"));
 const runtime=await import(pathToFileURL(selected.file).href);
 const server=runtime.httpServer;
 assert.ok(server&&typeof server.listen==='function');
 assert.equal(server.listening,false,'generated import must not open a listener');
 const outcomes=[];
 let result;
 try{
  await new Promise((resolve,reject)=>{
   const onError=error=>{server.off('listening',onListen);reject(error);};
   const onListen=()=>{server.off('error',onError);resolve();};
   server.once('error',onError);server.once('listening',onListen);
   server.listen(0,'127.0.0.1');
  });
  assert.equal(server.address().address,'127.0.0.1');
  const port=server.address().port;
  const before=await rawRequest(port,'/health');
  assert.equal(before.status,200);
  assert.equal(JSON.parse(before.body).devices,0);
  for(const [file,type] of assets){
   const expected=readFileSync(path.join(root,'jh168-mobile-unification/fixtures/mobile13',file));
   const get=await rawRequest(port,PREFIX+file);
   const head=await rawRequest(port,PREFIX+file,'HEAD');
   assert.equal(get.status,enabled?200:404,file+' GET');
   assert.equal(head.status,enabled?200:404,file+' HEAD');
   assert.equal(head.body.length,0,file+' HEAD must have no body');
   if(enabled){
    assert.equal(sha(get.body),sha(expected),file+' exact original asset');
    assertAssetHeaders(get,type,expected);
    assertAssetHeaders(head,type,expected);
   }else{
    assert.notEqual(sha(get.body),sha(expected),file+' disabled asset cannot leak');
   }
   outcomes.push({file,getStatus:get.status,headStatus:head.status,
    bytes:enabled?get.body.length:0,sha256:enabled?sha(get.body):null});
  }
  const marker='JH_SYNTHETIC_QUERY_MUST_NOT_ECHO';
  const query=await rawRequest(port,PREFIX+'index.html?unused='+marker);
  assert.equal(query.status,enabled?200:404);
  assert.ok(!query.body.includes(Buffer.from(marker)));
  if(enabled)assert.equal(sha(query.body),outcomes[0].sha256);
  for(const via of ['same-tab','new-tab']){
   const destination=await rawRequest(port,PREFIX+'destination.html?via='+via);
   assert.equal(destination.status,enabled?200:404);
   if(enabled)assert.equal(sha(destination.body),outcomes[1].sha256);
  }
  const rejectedPaths=[
   PREFIX+'unknown.html',PREFIX+'README.md',PREFIX+'cases.json',PREFIX+'smoke.cjs',
   PREFIX+'%69ndex.html',PREFIX+'%2findex.html',PREFIX+'./index.html',
   PREFIX+'../v1/index.html',PREFIX+'%2e%2e/v1/index.html',
   '/outside/../__jh_mobile13_fixture/v1/index.html'
  ];
  for(const pathname of rejectedPaths){
   const reply=await rawRequest(port,pathname);
   assert.equal(reply.status,404,'only exact asset paths: '+pathname);
   for(const asset of outcomes)if(asset.sha256)assert.notEqual(sha(reply.body),asset.sha256);
  }
  const post=await rawRequest(port,PREFIX+'index.html','POST',marker);
  assert.equal(post.status,enabled?405:404);
  assert.ok(!post.body.includes(Buffer.from(marker)));
  if(enabled)assert.deepEqual(String(post.headers.allow).split(',').map(value=>value.trim()).sort(),['GET','HEAD']);
  const protectedRoutes={};
  for(const [pathname,status,code] of [
   ['/mcp',401,'mcp_caller_auth_required'],
   ['/device/trusted/fixture-probe',404,'TRUST_HOST_NOT_CONFIGURED'],
   ['/device/owner-enrollment/fixture-probe',404,'OWNER_HOST_NOT_CONFIGURED']
  ]){
   const reply=await rawRequest(port,pathname);
   assert.equal(reply.status,status,pathname+' preserves original guard');
   const body=JSON.parse(reply.body);
   assert.equal(body.code||body.error,code,pathname+' must not return fixture HTML');
   if(pathname==='/mcp')assert.match(reply.headers['www-authenticate'],/^Bearer /);
   protectedRoutes[pathname]={status:reply.status,code};
  }
  const after=await rawRequest(port,'/health');
  assert.equal(after.status,200);
  assert.equal(JSON.parse(after.body).devices,0);
  assert.equal(externalRequests,0);
  result={schema:'JH168_MOBILE13_STAGE25_HTTP_V1',mode,scope:'SOURCE_ONLY',
   transport:'SYNTHETIC_HTTP',bindAddress:'127.0.0.1',listenerInitiallyClosed:true,
   generatedRuntimeSha256:runtimeSha256,assets:outcomes,protectedRoutes,
   deniedAssetPaths:rejectedPaths.length,postStatus:post.status,
   deviceCountBefore:0,deviceCountAfter:0,ownerStoreInitialized:false,
   externalRequests,mcpEffectToolCalls:0,phoneCalls:0,phoneE2E:'NOT_RUN'};
 }finally{
  if(server.listening){
   await new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
    server.closeAllConnections();
   });
  }else server.closeAllConnections();
 }
 assert.equal(server.listening,false);
 console.log(REPORT+JSON.stringify({...result,listenerClosed:true}));
}

if(process.argv[2]==='--synthetic-child'){
 await syntheticChild(process.argv[3]);
}else{
 const {default:test}=await import('node:test');
 test('actual generated Stage25 serves only gated neutral assets and preserves HTTP guards',{
  timeout:120000
 },()=>{
  const reports=[];
  for(const mode of ['ORIGINAL','PHONE_RIGHT']){
   const env={PATH:process.env.PATH||'',CI:'true',NODE_ENV:'test',
    JH_OWNER_DEFER_LISTEN:'1',LIFE_HUB_TOKEN:SYNTHETIC_TOKEN,
    JH_STAGE26_SIGNED_COMPLETION_ACK:ACK,
    ...(mode==='PHONE_RIGHT'?{JH_MOBILE_WEB_13_MODE:MODE}:{})};
   const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--synthetic-child',mode],{
    cwd:path.resolve(root,'../..'),env,encoding:'utf8',timeout:50000,maxBuffer:2*1024*1024
   });
   assert.equal(child.error,undefined,mode+' child failed: '+child.error?.message);
   assert.equal(child.signal,null,mode+' child must exit without being killed');
   assert.equal(child.status,0,mode+' child failed:\n'+child.stderr+'\n'+child.stdout);
   const lines=child.stdout.split('\n').filter(line=>line.startsWith(REPORT));
   assert.equal(lines.length,1,mode+' must emit exactly one completed proof');
   const report=JSON.parse(lines[0].slice(REPORT.length));
   assert.equal(report.mode,mode);assert.equal(report.listenerClosed,true);
   assert.match(report.generatedRuntimeSha256,/^[a-f0-9]{64}$/);
   reports.push(report);console.log(lines[0]);
  }
  assert.deepEqual(reports[1].protectedRoutes,reports[0].protectedRoutes);
  assert.notEqual(reports[1].generatedRuntimeSha256,reports[0].generatedRuntimeSha256);
 });
}
