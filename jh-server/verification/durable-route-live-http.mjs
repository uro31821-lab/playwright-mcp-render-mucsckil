/** Exact signed MCP + Secure56 HTTP regression for the real SERVE_READY_V1 runtime.
 * Reuses prior audited harness transport. No real device and no production mount.
 */
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sourceFile=new URL('./durable-native-integration.mjs',import.meta.url);
const generated=new URL('./durable-route-http.generated.mjs',import.meta.url);
let s=readFileSync(sourceFile,'utf8');
const anchor=' try{\n  build=buildDurableNativeRuntime(ROOT);';
if(s.split(anchor).length!==2)throw Error('JH_ROUTE_HTTP_HARNESS_CHANGED');
const oldImport="import {buildDurableNativeRuntime} from '../owner-setup/deployment/durable-native-runtime-candidate.mjs';";
if(s.split(oldImport).length!==2)throw Error('JH_ROUTE_HTTP_IMPORT_CHANGED');
s=s.slice(0,s.indexOf(anchor)).replace(oldImport,"import {buildDurableRoutedRuntime} from '../owner-setup/deployment/durable-live-release.mjs';");
s+=String.raw\`
 try{
  build=buildDurableRoutedRuntime(ROOT);
  mark('sealed durable host and route-only derived runtime present',build.runtimeRoutePatched===true&&build.productionEnabled===false);
  const seed=new DurableManualCircuitFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});seed.close();
  const server=await start(19593);
  const invalid=await server.call('life_open_service',{service:'카카오T'});
  mark('without phone, existing KakaoT service does not falsely claim queued',invalid.route==='android'&&invalid.queued===false);
  const phone=await server.enroll('synthetic-route-target-01');
  const route=await server.call('life_route',{request:'JH로 라프텔 복귀'});
  const kakaoRoute=await server.call('life_route',{request:'카카오T 열어'});
  const webRoute=await server.call('life_route',{request:'라프텔 원피스 검색'});
  mark('verified production classifies explicit native return, KakaoT and ordinary web',
    route.owner==='android'&&kakaoRoute.owner==='android'&&webRoute.owner==='web');
  const open=await server.call('life_open_service',{service:'카카오T'});
  const first=await server.take(phone);
  mark('native service queues signed original open_url exactly once',open.queued===true&&first.type==='open_url'&&first.target==='카카오T'&&first.id===open.jobId);
  assert.equal((await server.complete(phone,first,{ok:true,packageName:'com.kakao.taxi'})).status,200);
  mark('original completion is device receipt only',(await server.call('life_job_status',{job_id:open.jobId})).deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
  const returning=await server.call('life_open_service',{service:'JH로 라프텔 복귀'});
  const second=await server.take(phone);
  mark('existing return target reuses signed open_url with no new tool',returning.queued===true&&second.type==='open_url'&&second.target==='previous_work_app'&&second.id===returning.jobId);
  assert.equal((await server.complete(phone,second,{ok:true,code:'synthetic-return-reported'})).status,200);
  mark('return receipt never implies a verified screen',(await server.call('life_job_status',{job_id:second.id})).deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
  console.log('JH_DURABLE_PUBLISHED_ROUTE_HTTP_PASS '+JSON.stringify({checks:checks.length,failed:0,scope:'existing life_route and life_open_service over signed Secure56; generated Durable runtime',deviceActions:0,productionDeployments:0,candidateSha256:build.candidateSha256}));
 }catch(e){console.error('JH_DURABLE_PUBLISHED_ROUTE_HTTP_FAIL',e);process.exitCode=1}
 finally{for(const c of clients)try{await c.close()}catch{};for(const p of children)try{await kill(p)}catch{};rmSync(dir,{recursive:true,force:true})}
}
\`;
try{
 s=s.split(String.raw\`\`\`).join('\`');
 writeFileSync(generated,s,{mode:0o600});
 const syntax=spawnSync(process.execPath,['--check',fileURLToPath(generated)],{stdio:'inherit'});
 if(syntax.status!==0)throw Error('JH_DURABLE_ROUTE_FIXTURE_SYNTAX');
 const run=spawnSync(process.execPath,[fileURLToPath(generated)],{stdio:'inherit',timeout:90000});
 if(run.status!==0)process.exitCode=1;
}finally{rmSync(generated,{force:true})}
