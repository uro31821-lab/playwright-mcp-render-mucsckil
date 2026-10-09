/** TEST ONLY process. Maps the TWO fixed external origins to the supplied localhost TLS fixture.
 * Production entry has NO such mapping switch. NODE_EXTRA_CA_CERTS is test trust, not TLS bypass. */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createProviderSession,serveProviderPipe} from '../server-worker/provider-session.mjs';
const [origin,mode,activeFile]=process.argv.slice(2);
if(!/^https:\/\/localhost:\d+$/.test(origin))throw Error('fixture_origin');
const current=()=>!activeFile||readFileSync(activeFile,'utf8')==='active';
const memoryEndpoint=origin+'/mcp/'+encodeURIComponent(mode);
const fetchImpl=async(url,options)=>{
 if(url===memoryEndpoint)return fetch(url,options);
 if(!url.startsWith('https://api.openai.com/v1/'))throw Error('fixture_outbound_not_allowed');
 return fetch(origin+'/openai/'+encodeURIComponent(mode)+new URL(url).pathname,options);
};
const s=createProviderSession({owner:'owner',workflow:'workflow',expiresAt:Date.now()+300000,
 actions:['memory_search','memory_answer','food_observe','food_advice','book_preview'],
 model:'gpt-fixture',responseModels:['gpt-fixture'],memoriaEndpoint:memoryEndpoint,
 memoriaAuthorization:()=> 'Bearer SYNTHETIC_MEMORY_CREDENTIAL_000000',
 gptKey:'SYNTHETIC_OPENAI_CREDENTIAL_000000',current,fetchImpl,maxOutputTokens:2048});
await serveProviderPipe(s);
