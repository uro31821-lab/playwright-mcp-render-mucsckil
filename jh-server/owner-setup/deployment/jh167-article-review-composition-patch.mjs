/** SOURCE-ONLY article read candidate for JH167. No operational files modified.
 * Uses exact anchors from the already-reviewed JH167 guide13 candidate; fails closed
 * on source drift or double application. Changes the MCP tool list when enabled:
 * Secure56 catalog digest / OAuth registration requires owner-side release review.
 */
const anchor=`    readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId)\n  });`;
const newImport="import {registerJHArticleReadCandidate as jhRegisterArticleReadCandidate} from '../guide-13/article-host-readonly.mjs';\n";
const addition=`\n  // NEWS ADDON REVIEW-ONLY. Never enable on live Secure56 without a catalog identity review.\n  if (process.env.JH_NEWS_FULLTEXT_REVIEW_ENABLED==='1') {\n    jhRegisterArticleReadCandidate({enabled:true,registerOAuthTool,z,textResult,\n      getHostContext:()=>{const device=chooseDevice();return {command_id:jhRequireCommand56(device)};},\n      readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId),\n      browserTool\n    });\n  }`;
export function makeJH167ArticleReadReviewCandidate(generatedSource){
 if(typeof generatedSource!=='string'||generatedSource.split(anchor).length!==2||
   generatedSource.includes('jhRegisterArticleReadCandidate(')||generatedSource.includes(newImport.trim()))
   throw Error('ARTICLE_REVIEW_BASE_MISMATCH_OR_ALREADY_PATCHED');
 if(!generatedSource.includes('jhRegisterGuide13Tools({')||!generatedSource.includes('jhRegisterReservationLinkTools('))
   throw Error('ARTICLE_REVIEW_BASE_TOOLS_MISSING');
 return newImport+generatedSource.replace(anchor,anchor+addition);
}
