import test from 'node:test';
import assert from 'node:assert/strict';
import {patchJH167OfficialWebServiceNames56} from './jh167-article-operational-review-composition.mjs';
const source=`  registerOAuthTool("life_open_service",{},async({service})=>{
    const raw=String(service||"").trim();
    const s=raw.toLowerCase();
    if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k))){
      const j=mk("open_url",{target:"카카오T",url:"카카오T"});
    }
    const webMap=[
      [["라프텔","laftel"],"https://laftel.net"],
      [["유튜브","youtube"],"https://www.youtube.com"],
      [["네이버","naver"],"https://www.naver.com"]
    ];
    for(const [keys,url] of webMap)if(keys.some(k=>s.includes(k)))return url;
  });
  registerOAuthTool("life_naver_mail",{},async()=>("EXISTING_NEVER_MODIFIED"));
`;
test('three restored official website names precede generic YouTube route',()=>{
 const x=patchJH167OfficialWebServiceNames56(source);
 for(const url of [
   'https://www.kakaocorp.com/page/service/service/KakaoTalk',
   'https://www.kakaocorp.com/page/service/service/KakaoT',
   'https://music.youtube.com/'
 ])assert.ok(x.includes(url),url);
 assert.ok(x.indexOf('https://music.youtube.com/')<x.indexOf('https://www.youtube.com'));
 assert.ok(x.includes('&& /(?:앱|native app)/.test(s)'));
});
test('old Naver Mail and explicit Kakao T native entry stay unchanged',()=>{
 const x=patchJH167OfficialWebServiceNames56(source);
 assert.ok(x.includes('EXISTING_NEVER_MODIFIED'));
 assert.ok(x.includes('target:"카카오T",url:"카카오T"'));
 assert.ok(x.includes('["네이버","naver"],"https://www.naver.com"'));
 const old='      [["라프텔","laftel"],"https://laftel.net"],';
 const restored=[
   '      [["카카오톡","카톡","kakaotalk"],"https://www.kakaocorp.com/page/service/service/KakaoTalk"],',
   '      [["카카오t","카카오티","카카오 티","kakao t"],"https://www.kakaocorp.com/page/service/service/KakaoT"],',
   '      [["유튜브 뮤직","유튜브뮤직","youtube music","yt music","ytmusic"],"https://music.youtube.com/"],',
   old
 ].join('\n');
 const nativeNew='if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k)) && /(?:앱|native app)/.test(s)){';
 const nativeOld='if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k))){';
 assert.equal(x.replace(restored,old).replace(nativeNew,nativeOld),source);
});
test('unexpected source, reapplication and changed auth/route guard fail closed',()=>{
 const x=patchJH167OfficialWebServiceNames56(source);
 assert.throws(()=>patchJH167OfficialWebServiceNames56(x),/JH_WEB_NAMES_/);
 assert.throws(()=>patchJH167OfficialWebServiceNames56(source.replace('["라프텔","laftel"]','["laftel"]')),/JH_WEB_NAMES_/);
 assert.throws(()=>patchJH167OfficialWebServiceNames56(source.replace('["카카오t","카카오티","kakao t","카카오 택시"]','["카카오t"]')),/JH_WEB_NAMES_/);
});
