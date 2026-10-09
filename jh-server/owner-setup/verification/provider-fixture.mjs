// Synthetic provider responses only; no accounts, tokens or network destinations.
const tools=()=>[
 {name:'search_memory',description:'Search text memories',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:8}},required:['query']}},
 {name:'fetch_memory',description:'Fetch exact memory',inputSchema:{type:'object',properties:{memory_id:{type:'string'}},required:['memory_id']}}];
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
const record=()=>({id:'mem_fixture',content:'재조회 원문',category:'합성 기록',deleted_at:'',media:[]});
export function fixture({sse=false,edit,drop=false}={}){
 const seen=[];
 const fetchImpl=async(url,o)=>{
  seen.push({url,method:o.method,auth:o.headers.authorization,body:o.body?JSON.parse(o.body):null});let b=seen.at(-1).body;
  if(url.includes('/models/'))return json({object:'model',id:'gpt-fixture'});
  if(url.endsWith('/responses')){
   if(drop)throw Error('PRIVATE_DROP_CANARY');
   const raw={object:'response',id:'resp_fixture',status:'completed',model:'gpt-fixture',error:null,incomplete_details:null,
    output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'생성된 합성 답변'}]}]};
   return json(raw);
  }
  let result;
  if(b.method==='notifications/initialized')return new Response(null,{status:202});
  if(b.method==='initialize')result={protocolVersion:'2025-11-25',serverInfo:{name:'Memoria',version:'fixture'},capabilities:{tools:{}}};
  if(b.method==='tools/list')result={tools:tools()};
  if(b.method==='tools/call'){
   const value=b.params.name==='search_memory'?{query:b.params.arguments.query,count:1,memories:[{...record(),content:'과거 검색 요약'}]}:{found:true,memory:record()};
   result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }
  let raw={jsonrpc:'2.0',id:b.id,result};
  if(edit)raw=edit(raw,b,seen);
  return sse?new Response('event: message\ndata: '+JSON.stringify(raw)+'\n\n',{headers:{'content-type':'text/event-stream'}}):json(raw);
 };
 return {fetchImpl,seen};
}
