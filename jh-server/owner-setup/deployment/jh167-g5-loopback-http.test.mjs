/** G5 isolated loopback HTTP MCP — never starts the real JH host or books anything. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {registerJHGuide13Tools} from '../guide-13/host-tools.mjs';
import {registerReservationLinkTools} from '../reservation-link/host-tools.mjs';
import {officialLiveSupplierStatus} from '../reservation-link/providers/official-live.mjs';

const AUTH='Bearer jh167-g5-synthetic-token-not-real';
const NAMES=['life_guide13_catalog','life_guide13_plan',
 'life_reservation_link_assistant','life_reservation_screen_guide',
 'life_reservation_regional_handoff','life_reservation_provider_status',
 'life_reservation_live_search'];
function newMcp(state){
 const mcp=new McpServer({name:'jh167-g5-isolated-http',version:'0.6.0'},{capabilities:{tools:{}}});
 const registerOAuthTool=(name,meta,callback)=>mcp.registerTool(name,{
  title:meta.title,description:meta.description,inputSchema:meta.inputSchema,
  annotations:meta.annotations
 },async args=>({content:[{type:'text',text:JSON.stringify(await callback(args))}]}));
 const ports={registerOAuthTool,z,textResult:x=>x,
  getHostContext:()=>({command_id:state.command,generation:null,plan_revision:null}),
  readVerifiedRight:async()=>{state.reads++;return {verified:false,code:'RIGHT_PANE_UNVERIFIED'}},
  allowedBookingHosts:['booking.com'],liveProviders:[],
  liveProviderStatus:()=>officialLiveSupplierStatus({})};
 registerJHGuide13Tools(ports);
 registerReservationLinkTools(ports);
 return mcp;
}
async function fixture(){
 const state={command:'fixture-command',reads:0,rejected:0};
 const connections=[];
 const server=createServer(async(req,res)=>{
  if(req.url!=='/mcp')return void res.writeHead(404).end('not found');
  if(req.headers.authorization!==AUTH){
   state.rejected++;return void res.writeHead(401,{'content-type':'application/json'}).end('{"error":"AUTH_REQUIRED"}');
  }
  const mcp=newMcp(state);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  connections.push({mcp,transport});
  try{await mcp.connect(transport);await transport.handleRequest(req,res)}
  catch{if(!res.headersSent)res.writeHead(500).end('SERVER_ERROR');else if(!res.writableEnded)res.end()}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=new URL('http://127.0.0.1:'+server.address().port+'/mcp');
 const client=new Client({name:'jh167-g5-loopback-client',version:'0.6.0'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:AUTH}}});
 try{await client.connect(transport)}catch(e){await new Promise(r=>server.close(r));throw e}
 return {state,url,client,
  async call(name,args={}){
   const response=await client.callTool({name,arguments:args});
   assert.notEqual(response.isError,true,'MCP failure: '+name);
   const body=response.content?.find(x=>x.type==='text')?.text;
   assert.equal(typeof body,'string');return JSON.parse(body)
  },
  async close(){
   await client.close();await new Promise(r=>server.close(r));
   for(const c of connections){try{await c.transport.close()}catch{}try{await c.mcp.close()}catch{}}
  }
 }
}
test('G5 real localhost HTTP initialize and tools/list with seven read-only tools',{timeout:15000},async()=>{
 const x=await fixture();try{
  assert.equal(x.url.hostname,'127.0.0.1');
  const list=await x.client.listTools();
  assert.deepEqual(list.tools.map(t=>t.name),NAMES);
  assert(list.tools.every(t=>t.annotations?.readOnlyHint===true));
  assert(list.tools.every(t=>t.annotations?.destructiveHint===false));
 }finally{await x.close()}
});
test('G5 real HTTP unauthorized requests fail before tools/list',{timeout:15000},async()=>{
 const x=await fixture();try{
  const submit=async headers=>{
   const res=await fetch(x.url,{method:'POST',headers:{
    Accept:'application/json, text/event-stream','content-type':'application/json',...headers
   },body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list',params:{}})});
   assert.equal(res.status,401);assert.equal((await res.json()).error,'AUTH_REQUIRED')
  };
  await submit({});await submit({Authorization:'Bearer bad'});
  assert.equal(x.state.rejected,2);
  assert.equal((await x.client.listTools()).tools.length,7);
 }finally{await x.close()}
});
test('G5 real HTTP tool calls never execute, cannot invent booking seats',{timeout:15000},async()=>{
 const x=await fixture();try{
  const catalog=await x.call('life_guide13_catalog');
  assert.equal(catalog.scenarios.length,13);
  for(const request of ['어디 눌러?','눌러줘','계속','호텔 예약해줘']){
   const answer=await x.call('life_guide13_plan',{request});
   assert.equal(answer.guide_only,true);assert.equal(answer.perform_action,false);
   assert.equal(answer.external_effect_status,'NOT_EXECUTED');
  }
  const link=await x.call('life_reservation_link_assistant',{kind:'hotel',
   requirements:{location:'Osaka',check_in:'2026-11-18',check_out:'2026-11-19',adults:2,rooms:1},
   links:[{title:'valid candidate',booking_url:'https://www.booking.com/hotel/jp/example.html'},
    {title:'lookalike',booking_url:'https://booking.com.bad.invalid/path'}]});
  assert.equal(link.availability_verified,false);
  assert.equal(link.available.length,0);assert.equal(link.check_on_site.length,1);assert.equal(link.rejected.length,1);
  for(const kind of ['hotel','flight','taxi']){
   const handoff=await x.call('life_reservation_regional_handoff',{kind});
   assert.equal(handoff.live_inventory_status,'NOT_CONNECTED');assert.equal(handoff.booking_confirmed,false);
  }
  const status=await x.call('life_reservation_provider_status');
  assert(status.providers.every(p=>p.credentials_present===false));
  for(const kind of ['hotel','flight']){
   const result=await x.call('life_reservation_live_search',{kind,requirements:{location:'Osaka'}});
   assert.equal(result.provider_connection,'NOT_CONNECTED');assert.deepEqual(result.available,[]);
  }
  const screen=await x.call('life_reservation_screen_guide',{question:'어느 버튼을 눌러?'});
  assert.equal(screen.source_verified,false);assert.equal(screen.reason,'RIGHT_PANE_UNVERIFIED');
  assert.equal(x.state.reads,1);
  x.state.command='fresh-command';
  assert.equal((await x.call('life_guide13_catalog')).command_id,'fresh-command');
  x.state.command=null;
  const blocked=await x.call('life_guide13_catalog');
  assert.equal(blocked.code,'HOST_COMMAND_REQUIRED');
 }finally{await x.close()}
});
