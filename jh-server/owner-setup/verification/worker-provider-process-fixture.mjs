/** TEST ONLY: two exact production destinations mapped to localhost TLS, using the REAL private
 * config loader and scoped production main. No such mapping exists in the production entry. */
import {main} from '../server-worker/provider-entry.mjs';
const [origin,config,scope]=process.argv.slice(2);
if(!/^https:\/\/localhost:\d+$/.test(origin))throw Error('fixture_origin');
const actual=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 const u=new URL(url);
 if(u.origin===origin&&u.pathname==='/mcp')return actual(url,options);
 if(u.origin==='https://api.openai.com'&&u.pathname.startsWith('/v1/'))return actual(origin+'/openai'+u.pathname,options);
 throw Error('fixture_outbound_not_allowed');
};
await main([config,scope]);
