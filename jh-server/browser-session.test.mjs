import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createBrowserSession} from './browser-session.mjs';
import {createBrowserTransport} from './browser-transport.mjs';
import {prepareBrowserRuntime} from './browser-runtime.mjs';
import {patchBrowserSessionRuntime} from './browser-session-runtime.mjs';

const NAMES = ['browser_snapshot','browser_navigate','browser_click','browser_type','browser_tabs'];
function fixture(options={}) {
  const requests=[]; let sid=null, initializations=0, tools=0, catalogs=0, fault=null;
  const send = async optionsIn => {
    const m=JSON.parse(optionsIn.body), h=new Headers(optionsIn.headers);
    requests.push({m,h});
    if (m.method==='initialize') {
      assert.equal(h.has('mcp-session-id'),false);
      sid='session-'+(++initializations);
      return new Response(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:options.version||'2025-03-26',capabilities:{},serverInfo:{name:'fixture',version:'1'}}}),
        {headers:{'content-type':'application/json',...(!options.stateless?{'mcp-session-id':sid}:{})}});
    }
    if (!options.stateless && h.get('mcp-session-id')!==sid) throw Error('browser_http_404');
    if (m.method==='notifications/initialized') return new Response(null,{status:options.ack||202});
    if (m.method==='tools/list') catalogs++;
    if (m.method==='tools/call') tools++;
    if (fault) { const f=fault; fault=null; return f(m,h); }
    if (options.always404 && m.method==='tools/list') throw Error('browser_http_404');
    const result=m.method==='tools/list'?{tools:NAMES.map(name=>({name,inputSchema:{type:'object'}}))}:
      {content:[{type:'text',text:'observed-'+tools}],...(options.toolError?{isError:true}:{})};
    const envelope={jsonrpc:'2.0',id:m.id,result};
    return options.sse ? new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{}})+'\n\nevent: message\ndata: '+JSON.stringify(envelope)+'\n\n',
      {headers:{'content-type':'text/event-stream'}}) : new Response(JSON.stringify(envelope),{headers:{'content-type':'application/json'}});
  };
  return {transport:{request:send},requests,expire(){sid='gone';},fault(f){fault=f;},counts(){return {initializations,tools,catalogs};}};
}
test('fresh initialize, ACK, catalog and tool; do not cache snapshots',async()=>{
  const f=fixture(), c=createBrowserSession(f);
  assert.equal((await c.tool('browser_snapshot')).content[0].text,'observed-1');
  assert.equal((await c.tool('browser_snapshot')).content[0].text,'observed-2');
  assert.equal(f.counts().initializations,1);
});
test('expired session is repaired before action; action is dispatched once',async()=>{
  const f=fixture(),c=createBrowserSession(f); await c.probe(); f.expire();
  await c.tool('browser_navigate',{url:'https://example.com/'});
  assert.deepEqual(f.counts(),{initializations:2,tools:1,catalogs:2});
});
test('expired session cannot reuse a stale click reference',async()=>{
  const f=fixture(),c=createBrowserSession(f); await c.probe();f.expire();
  await assert.rejects(c.tool('browser_click',{ref:'old'}),/read_screen_first/);
  assert.equal(f.counts().tools,0);
  await c.tool('browser_snapshot');await c.tool('browser_click',{ref:'new'});
  assert.equal(f.counts().tools,2);
});
test('ready probes the server and cannot reuse initialized=true forever',async()=>{
  const f=fixture(),c=createBrowserSession(f); await c.probe(); f.expire(); await c.probe();
  assert.equal(f.counts().initializations,2);
});
test('recovery has a fixed limit when the server loses every session',async()=>{
  const f=fixture({always404:true}),c=createBrowserSession(f);
  await assert.rejects(c.probe(),/browser_http_404/);assert.equal(f.counts().initializations,2);assert.equal(f.counts().tools,0);
});
for(const message of ['browser_http_400','browser_service_authentication_failed','browser_request_timeout_no_automatic_retry'])
  test('metadata failure is not blindly retried: '+message,async()=>{
    const f=fixture(),c=createBrowserSession(f);f.fault(()=>{throw Error(message);});
    await assert.rejects(c.probe(),new RegExp(message));assert.equal(f.counts().initializations,1);assert.equal(f.counts().tools,0);
  });
test('failed initialized notification never marks client ready',async()=>{
  const f=fixture({ack:204}),c=createBrowserSession(f); await c.probe();assert.equal(f.counts().catalogs,1);
  const g=fixture({ack:200}),d=createBrowserSession(g); await assert.rejects(d.probe(),/ack_invalid/);assert.equal(g.counts().catalogs,0);
});
test('unsupported negotiated protocol is rejected',async()=>{
  const f=fixture({version:'2099-01-01'}),c=createBrowserSession(f);await assert.rejects(c.probe(),/version_unsupported/);
});
test('server selected supported protocol is echoed',async()=>{
  const f=fixture({version:'2025-06-18'}),c=createBrowserSession(f); await c.probe();
  assert.equal(f.requests.at(-1).h.get('mcp-protocol-version'),'2025-06-18');
});
test('stateless initialization does not invent a session ID',async()=>{
  const f=fixture({stateless:true}),c=createBrowserSession(f);await c.tool('browser_snapshot');
  assert(f.requests.every(x=>!x.h.has('mcp-session-id')));
});
test('SSE notifications are not confused with the matching response',async()=>{
  const f=fixture({sse:true}),c=createBrowserSession(f);assert.equal((await c.tool('browser_snapshot')).content[0].text,'observed-1');
});
for(const kind of ['wrong-id','duplicate','rpc-error']) test('reject '+kind,async()=>{
  const f=fixture(),c=createBrowserSession(f);f.fault(m=>{
    const x={jsonrpc:'2.0',id:kind==='wrong-id'?m.id+1:m.id,...(kind==='rpc-error'?{error:{code:-1,message:'private upstream detail'}}:{result:{tools:[]}})};
    return kind==='duplicate'?new Response('data: '+JSON.stringify(x)+'\n\ndata: '+JSON.stringify(x)+'\n\n',{headers:{'content-type':'text/event-stream'}}):
      new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  });await assert.rejects(c.probe(),/browser_(response_binding_invalid|rpc_error_no_automatic_retry)/);
});
test('concurrent identical requests share only the in-flight result',async()=>{
  const f=fixture(),c=createBrowserSession(f);await Promise.all([c.tool('browser_snapshot'),c.tool('browser_snapshot')]);
  assert.equal(f.counts().initializations,1);assert.equal(f.counts().tools,1);
  await c.tool('browser_snapshot');assert.equal(f.counts().tools,2);
});
test('concurrent different calls are serialized with one initialization',async()=>{
  const f=fixture(),c=createBrowserSession(f);await Promise.all([c.probe(),c.tool('browser_snapshot'),c.tool('browser_navigate',{url:'https://example.com/'})]);
  assert.equal(f.counts().initializations,1);assert.equal(f.counts().tools,2);
});
test('tool results reporting isError remain errors',async()=>{
  const f=fixture({toolError:true}),c=createBrowserSession(f);assert.equal((await c.tool('browser_snapshot')).isError,true);
});
test('unsupported methods are refused before any request',async()=>{
  const f=fixture(),c=createBrowserSession(f);await assert.rejects(c.rpc('resources/read'),/not_supported/);assert.equal(f.requests.length,0);
});
test('unavailable tool is not invoked',async()=>{
  const f=fixture(),c=createBrowserSession(f);await assert.rejects(c.tool('browser_absent'),/not_available/);assert.equal(f.counts().tools,0);
});
test('404 at tools/call is not replayed and subsequent fresh read reconnects',async()=>{
  const f=fixture();let failTool=true;
  const c=createBrowserSession({transport:{request:async o=>{
    const m=JSON.parse(o.body);const res=await f.transport.request(o);
    if(m.method==='tools/call'&&failTool){failTool=false;throw Error('browser_http_404');}return res;
  }}});
  await assert.rejects(c.tool('browser_click',{ref:'x'}),/action_not_replayed/);assert.equal(f.counts().tools,1);
  await c.tool('browser_snapshot');assert.equal(f.counts().tools,2);assert.equal(f.counts().initializations,2);
});
test('tool timeout has one dispatch and does not automatically reconnect',async()=>{
  const f=fixture();const c=createBrowserSession({transport:{request:async o=>{
    const res=await f.transport.request(o);if(JSON.parse(o.body).method==='tools/call')throw Error('browser_request_timeout_no_automatic_retry');return res;
  }}});
  await assert.rejects(c.tool('browser_click',{ref:'x'}),/timeout/);assert.equal(f.counts().tools,1);assert.equal(f.counts().initializations,1);
});
test('actual HTTP plus unchanged credential transport repairs metadata 404',async()=>{
  const f=fixture();let auth=0;
  const server=createServer(async(req,res)=>{
    try{assert.equal(req.headers.authorization,'Bearer '+ 'x'.repeat(32));auth++;
      let body='';for await(const b of req)body+=b;
      const out=await f.transport.request({body,headers:req.headers});
      res.writeHead(out.status,Object.fromEntries(out.headers));res.end(await out.text());
    }catch(e){res.writeHead(e.message==='browser_http_404'?404:500);res.end('redacted');}
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const realFetch=globalThis.fetch,local='http://127.0.0.1:'+server.address().port;
    const transport=createBrowserTransport({endpoint:'https://playwright-mcp-yzcy.onrender.com/mcp',token:'x'.repeat(32),
      fetchImpl:(_url,opts)=>realFetch(local,opts)});
    const c=createBrowserSession({transport});await c.probe();f.expire();await c.tool('browser_snapshot');await c.tool('browser_navigate',{url:'https://example.com/'});await c.tool('browser_snapshot');
    assert.equal(f.counts().tools,3);assert.equal(f.counts().initializations,2);assert(auth>=10);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('exact runtime patch preserves OAuth, phone and catalog bytes outside browser block',async()=>{
  await import('./verification/build-auth-candidate.mjs');
  const parent=readFileSync(prepareBrowserRuntime()); const out=patchBrowserSessionRuntime(parent);
  assert.match(out.toString(),/browserSession.probe/);assert(!out.toString().includes('return browserRpc(method,params,false)'));
  assert.throws(()=>patchBrowserSessionRuntime(Buffer.concat([parent,Buffer.from(' ')])),/identity/);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  mkdirSync('session-evidence',{recursive:true});
  const report={sessionSha256:hash(readFileSync(new URL('./browser-session.mjs',import.meta.url))),patchedRuntimeSha256:hash(out),parentRuntimeSha256:hash(parent)};
  writeFileSync('session-evidence/hashes.json',JSON.stringify(report,null,2));console.log('SESSION_CANDIDATE_HASHES '+JSON.stringify(report));
});
