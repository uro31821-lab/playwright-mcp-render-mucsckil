import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {buildBrowserRecoveryCandidate} from './browser-channel-recovery-candidate.mjs';

const {original,candidate,identity}=buildBrowserRecoveryCandidate();
const {createBrowserSession:baseline}=await import(original);
const {createBrowserSession:fixed}=await import(candidate);
const tools=['browser_snapshot','browser_navigate','browser_click','browser_type'];
function fixture(){
 let sid=null,initializations=0,catalogs=0,actions=0;
 let failCatalogOnce=null,failCatalogAlways=null,failActionOnce=null;
 const response=(id,result)=>new Response(JSON.stringify({jsonrpc:'2.0',id,result}),{headers:{'content-type':'application/json'}});
 const handle=async opt=>{
  const m=JSON.parse(opt.body),h=new Headers(opt.headers||{});
  if(m.method==='initialize'){
   sid='synthetic-'+(++initializations);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:m.id,
    result:{protocolVersion:'2025-03-26',capabilities:{},serverInfo:{name:'test',version:'1'}}}),
    {headers:{'content-type':'application/json','mcp-session-id':sid}});
  }
  if(h.get('mcp-session-id')!==sid)throw Error('browser_http_404');
  if(m.method==='notifications/initialized')return new Response(null,{status:202});
  if(m.method==='tools/list'){
   catalogs++;
   if(failCatalogAlways)throw Error(failCatalogAlways);
   if(failCatalogOnce){const code=failCatalogOnce;failCatalogOnce=null;throw Error(code);}
   return response(m.id,{tools:tools.map(name=>({name,inputSchema:{type:'object'}}))});
  }
  if(m.method==='tools/call'){
   actions++;
   if(failActionOnce){const code=failActionOnce;failActionOnce=null;throw Error(code);}
   return response(m.id,{content:[{type:'text',text:'synthetic-action-'+actions}]});
  }
  throw Error('unexpected_method_'+m.method);
 };
 return {
  transport:{request:handle},handle,stats:()=>({initializations,catalogs,actions}),
  breakCatalogOnce:(code='browser_event_channel_closed')=>failCatalogOnce=code,
  breakCatalogAlways:(code='browser_event_channel_closed')=>failCatalogAlways=code,
  breakActionOnce:(code='browser_event_channel_closed')=>failActionOnce=code
 };
}
test('candidate is exact one-expression patch on pinned operational module',()=>{
 assert.equal(identity.exactExpressionEdits,1);
 assert.equal(identity.unchangedOutsidePatch,true);
 assert.equal(identity.toolActionAutoReplay,false);
 assert.equal(identity.phoneConnectionChanged,false);
 assert.equal(identity.memoriaChanged,false);
 assert.equal(identity.productionDeployed,false);
});
test('baseline reproduces channel error before safe metadata recovery',async()=>{
 const f=fixture(),session=baseline(f);
 await session.probe();f.breakCatalogOnce();
 await assert.rejects(session.tool('browser_snapshot'),/browser_event_channel_closed/);
 assert.equal(f.stats().initializations,1);assert.equal(f.stats().actions,0);
});
test('repaired session reinitializes metadata and dispatches action once',async()=>{
 const f=fixture(),session=fixed(f);
 await session.probe();f.breakCatalogOnce();
 const result=await session.tool('browser_snapshot');
 assert.equal(result.content[0].text,'synthetic-action-1');
 assert.deepEqual(f.stats(),{initializations:2,catalogs:3,actions:1});
});
test('stale clickable target blocked after channel replacement until fresh screen read',async()=>{
 const f=fixture(),session=fixed(f);
 await session.probe();f.breakCatalogOnce();
 await assert.rejects(session.tool('browser_click',{ref:'old'}),/read_screen_first/);
 assert.equal(f.stats().actions,0);
 await session.tool('browser_snapshot');
 await session.tool('browser_click',{ref:'fresh'});
 assert.equal(f.stats().actions,2);
});
test('channel error after dispatched action NEVER automatically repeats that action',async()=>{
 const f=fixture(),session=fixed(f);
 await session.probe();f.breakActionOnce();
 await assert.rejects(session.tool('browser_click',{ref:'visible'}),/browser_event_channel_closed/);
 assert.equal(f.stats().actions,1);
 await session.tool('browser_snapshot');
 assert.equal(f.stats().actions,2);
 assert.equal(f.stats().initializations,2);
});
test('persistent metadata channel failure retries at most once',async()=>{
 const f=fixture(),session=fixed(f);
 await session.probe();f.breakCatalogAlways();
 await assert.rejects(session.tool('browser_snapshot'),/browser_event_channel_closed/);
 assert.deepEqual(f.stats(),{initializations:2,catalogs:3,actions:0});
});
test('authentication error is not retried',async()=>{
 const f=fixture(),session=fixed(f);
 await session.probe();f.breakCatalogOnce('browser_service_authentication_failed');
 await assert.rejects(session.tool('browser_snapshot'),/browser_service_authentication_failed/);
 assert.deepEqual(f.stats(),{initializations:1,catalogs:2,actions:0});
});
test('real loopback HTTP transport does safe recovery with exactly one final action',async()=>{
 const f=fixture(),server=createServer(async(req,res)=>{
  let body='';for await(const b of req)body+=b;
  try{
   const v=await f.handle({body,headers:req.headers});
   res.writeHead(v.status,Object.fromEntries(v.headers));res.end(await v.text());
  }catch(e){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const endpoint='http://127.0.0.1:'+server.address().port;
  const transport={request:async req=>{
   const r=await fetch(endpoint,{method:'POST',headers:req.headers,body:req.body});
   if(r.status===503){const e=await r.json();throw Error(e.error);}
   return r;
  }};
  const c=fixed({transport});
  await c.probe();f.breakCatalogOnce();
  await c.tool('browser_navigate',{url:'https://example.com'});
  assert.deepEqual(f.stats(),{initializations:2,catalogs:3,actions:1});
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
});
console.log('JH_CHANNEL_RECOVERY_E2E verified: safe metadata reconnect, no action replay');
