/** Optional, review-only service-name overlay for an already generated Mobile13
 * source. Nothing imports or applies it from production startup. The existing
 * fixed-URL OPEN path does not need this overlay.
 *
 * Only add names to the original resolver. Keep its tool schema, command and
 * durable authorities, RIGHT URL job, completion reader and MANUAL fallback.
 */
export const JEBISEO_RIGHT_OPEN_URL = 'https://gemini.google.com/app';
const START = '  registerOAuthTool("life_open_service",{';
const END = '  registerOAuthTool("life_naver_mail",{';
const MAP = '    const webMap=[\n';
const ENTRY = `      [["제미나이","제미니","gemini","제비서"],${JSON.stringify(JEBISEO_RIGHT_OPEN_URL)}],\n`;
const occurrences = (source, text) => source.split(text).length - 1;
const fail = code => {throw new Error(code);};

export function patchJebiseoRightOpenRoute(source) {
  if (typeof source !== 'string') fail('JEBISEO_RIGHT_OPEN_SOURCE_REQUIRED');
  if (occurrences(source, START) !== 1 || occurrences(source, END) !== 1)
    fail('JEBISEO_RIGHT_OPEN_SCOPE_CHANGED');
  const begin = source.indexOf(START), end = source.indexOf(END, begin);
  if (end <= begin) fail('JEBISEO_RIGHT_OPEN_SCOPE_CHANGED');
  const block = source.slice(begin, end);
  if (block.includes(JEBISEO_RIGHT_OPEN_URL)) fail('JEBISEO_RIGHT_OPEN_ALREADY_PRESENT');
  for (const [anchor, count] of [
    ['  },(jhRightWebOpen56=async({service})=>{', 1],
    [MAP, 1],
    ['const j=mk("open_url",{target:"right_web_link",url});', 1],
    ['const j=mk("open_url",{target:"right_web_link",url:raw});', 1],
    ['const completion=await jhOpenCompletion56(j);', 2],
    ['code:"RIGHT_WEB_URL_NOT_MAPPED"', 1]
  ]) {
    if (occurrences(block, anchor) !== count) fail('JEBISEO_RIGHT_OPEN_ORIGINAL_ROUTE_REQUIRED');
  }
  const candidate = source.slice(0, begin) + block.replace(MAP, MAP + ENTRY) + source.slice(end);
  if (candidate.replace(ENTRY, '') !== source) fail('JEBISEO_RIGHT_OPEN_OUTSIDE_SCOPE_CHANGED');
  return candidate;
}
