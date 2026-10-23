import test from 'node:test';
import assert from 'node:assert/strict';
import {patchJH167RightWebUrl56} from './jh167-article-operational-review-composition.mjs';
const body=`const keep='chrome-native-launch';
  registerOAuthTool("life_open_service",{
    title:"Open on phone",inputSchema:{}
  },async()=>{
    const j=mk("open_url",{target:"chrome",url});
    const direct=mk("open_url",{target:"chrome",url:raw});
  });
  registerOAuthTool("life_naver_mail",{
    title:"Mail",inputSchema:{}
  },async()=>{const j=mk("open_url",{target:"chrome",url});});
`;
test('mapped websites and direct HTTPS URLs use FIX4 existing web URL handler',()=>{
 const out=patchJH167RightWebUrl56(body);
 const block=out.slice(out.indexOf('life_open_service'),out.indexOf('life_naver_mail'));
 assert.ok(block.includes('target:"right_web_link",url}'));
 assert.ok(block.includes('target:"right_web_link",url:raw}'));
 assert.equal(block.includes('target:"chrome",url'),false);
 assert.ok(out.includes('keep=\'chrome-native-launch\''));
 assert.ok(out.slice(out.indexOf('life_naver_mail')).includes('target:"chrome",url}'));
});
test('refuse already patched, source drift or missing exact anchored routes',()=>{
 const out=patchJH167RightWebUrl56(body);
 for(const broken of [out,body.replace('target:"chrome",url}','target:"browser",url}'),
   body.replace('  registerOAuthTool("life_naver_mail",','  registerOAuthTool("mail",')]){
   assert.throws(()=>patchJH167RightWebUrl56(broken),/JH_RIGHT_URL_/);
 }
});
test('no Android mutation, extra MCP catalog tool, OAuth or sensitive workflow change',()=>{
 const out=patchJH167RightWebUrl56(body);
 assert.equal(out.replaceAll('target:"right_web_link"','target:"chrome"'),body);
});
