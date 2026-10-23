/** SOURCE-ONLY article read candidate for JH167. No operational files modified.
 * Uses exact anchors from the already-reviewed JH167 guide13 candidate; fails closed
 * on source drift or double application. Changes the MCP tool list when enabled:
 * Secure56 catalog digest / OAuth registration requires owner-side release review.
 */
const anchor=`    readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId)\n  });`;
const newImport="import {registerJHArticleReadCandidate as jhRegisterArticleReadCandidate} from '../guide-13/article-host-readonly.mjs';\n";
const addition=`\n  // NEWS ADDON REVIEW-ONLY. Fail CLOSED on Render or without explicit synthetic scope.\n  // The native Secure56 digest and trust session remain unchanged.\n  const jhNewsReviewRequested=process.env.JH_NEWS_FULLTEXT_REVIEW_ENABLED==='1';\n  const jhNewsReviewCatalogAuthorized=process.env.JH_NEWS_FULLTEXT_CATALOG_SCOPE==='CI_SYNTHETIC_LOCAL_ONLY' &&\n    process.env.RENDER_SERVICE_ID===undefined && process.env.JH_OWNER_DEFER_LISTEN==='1';\n  if (jhNewsReviewRequested && !jhNewsReviewCatalogAuthorized)\n    console.warn('JH_NEWS_REVIEW_DISABLED_BY_CATALOG_GATE');\n  // Explicit controlled-release route; no new Android actions or signing changes.
  const jhNewsProductionAuthorized=process.env.JH_DURABLE_RELEASE==='SERVE_READY_V1' &&
    process.env.RENDER_SERVICE_ID==='srv-db0fjl2d0e5s73be114g' &&
    process.env.JH_OWNER_DEFER_LISTEN==='1';
  if ((jhNewsReviewRequested && jhNewsReviewCatalogAuthorized) || jhNewsProductionAuthorized) {\n    jhRegisterArticleReadCandidate({enabled:true,registerOAuthTool,z,textResult,\n      getHostContext:()=>{const device=chooseDevice();return {command_id:jhRequireCommand56(device)};},\n      readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId),\n      browserTool\n    });\n  }`;
export function makeJH167ArticleReadReviewCandidate(generatedSource){
 if(typeof generatedSource!=='string'||generatedSource.split(anchor).length!==2||
   generatedSource.includes('jhRegisterArticleReadCandidate(')||generatedSource.includes(newImport.trim()))
   throw Error('ARTICLE_REVIEW_BASE_MISMATCH_OR_ALREADY_PATCHED');
 if(!generatedSource.includes('jhRegisterGuide13Tools({')||!generatedSource.includes('jhRegisterReservationLinkTools('))
   throw Error('ARTICLE_REVIEW_BASE_TOOLS_MISSING');
 return newImport+generatedSource.replace(anchor,anchor+addition);
}
