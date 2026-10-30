import { createHash } from 'node:crypto';
/** Native UI candidates. These helpers NEVER authenticate receipts. Package +
 * title + exact editor/message IDs are needed; package alone is insufficient.
 * Work window can be LEFT; coordinates stay work-local until the shared host
 * deliberately converts them. No fixed full-screen or right-side assumptions. */
export const GEMINI_NATIVE_PROFILE = Object.freeze({
  hostPackage: 'com.google.android.googlequicksearchbox',
  inputViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet',
  accountViewId: 'com.google.android.googlequicksearchbox:id/assistant_action_robin_og_account_menu',
  userMessageViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_user_message_text',
  responseViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_text',
  actionCardTextViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_action_card_text',
  videoPlayerViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_toucan_native_player_view',
  videoPlayPauseViewId: 'com.google.android.googlequicksearchbox:id/assistant_robin_exo_play_pause_button',
  videoPositionViewId: 'com.google.android.googlequicksearchbox:id/exo_position',
  videoDurationViewId: 'com.google.android.googlequicksearchbox:id/exo_duration',
  submitViewId: null, // No labelled send control has been observed on the test device.
});

const fail = code => { throw new Error(code); };
function box(raw) {
  const v = typeof raw === 'string' ? raw.trim().split(/[ ,]+/).map(Number)
    : [raw?.left, raw?.top, raw?.right, raw?.bottom];
  if (v.length !== 4 || !v.every(Number.isSafeInteger) || v[2] <= v[0] || v[3] <= v[1])
    fail('INVALID_SCREEN_BOUNDS');
  return { left: v[0], top: v[1], right: v[2], bottom: v[3] };
}

/** Use the native WORK window size, not the full unfolded display size.
 * JH's screenshot runtime re-inspects with this default size before consuming its lease.
 * A full-display viewport changes the lease's screen digest even on an unchanged UI.
 */
export function nativeWorkViewport(screen) {
  const b = box(screen);
  return { viewport_width: b.right - b.left, viewport_height: b.bottom - b.top };
}

/** Snapshot node bounds are absolute; JH Computer Use points are work-window-relative.
 * The caller must freshly validate this candidate through JH inspect/prepare and keep
 * all existing leases, command bindings, approvals and occlusion checks unchanged.
 */
export function nodeToWorkPoint(screen, node) {
  if (!Number.isSafeInteger(screen?.windowId) || String(node?.windowId) !== String(screen.windowId) ||
      !screen.packageName || node?.package !== screen.packageName) fail('TARGET_WINDOW_MISMATCH');
  const work = box(screen), target = box(node.bounds);
  if (target.left < work.left || target.top < work.top || target.right > work.right || target.bottom > work.bottom)
    fail('TARGET_OUTSIDE_WORK_PANE');
  return { x: Math.floor((target.left + target.right) / 2) - work.left,
    y: Math.floor((target.top + target.bottom) / 2) - work.top, ...nativeWorkViewport(screen) };
}

/** Read-only discovery. Does not export an account identifier, draft text or coordinates.
 * The Google host package alone is insufficient; require both Gemini title and its
 * specific native editor. This partial-tree observation never proves quota or sending.
 */
export function discoverGeminiInput(nodes, screen) {
  if (!Array.isArray(nodes) || screen?.packageName !== GEMINI_NATIVE_PROFILE.hostPackage)
    return { code: 'GEMINI_SURFACE_NOT_IDENTIFIED', verified: false };
  const sameWindow = nodes.filter(n => n.package === screen.packageName && String(n.windowId) === String(screen.windowId));
  const title = sameWindow.some(n => /^Gemini(?:\s|$)/.test(n.text ?? '') && n.editable !== 'true' && n.editable !== true);
  const inputs = sameWindow.filter(n => n.viewId === GEMINI_NATIVE_PROFILE.inputViewId &&
    (n.editable === 'true' || n.editable === true) && n.sensitive !== 'true' && n.sensitive !== true);
  if (!title || inputs.length !== 1) return { code: 'GEMINI_INPUT_NOT_UNIQUE', verified: false };
  return { code: 'GEMINI_INPUT_CANDIDATE', verified: false,
    selector: inputs[0].viewId, needsFreshJhValidation: true,
    submitIdentified: false, entitlementVerified: false };
}

/** Read only. The host supplies nodes from one
 * fresh snapshot. This never manufactures signature, account or completion proof.
 * The visible text is useful for ChatGPT readback, but is not a full-conversation export.
 */
export function readGeminiReply(nodes, screen, expectedPrompt) {
  const no = code => ({ code, verified: false, response: null, fullReplyVerified: false, contentIsUntrusted: true, actionAuthority: false });
  if (!Array.isArray(nodes) || screen?.packageName !== GEMINI_NATIVE_PROFILE.hostPackage ||
      typeof expectedPrompt !== 'string' || !expectedPrompt.trim()) return no('GEMINI_REQUEST_REQUIRED');
  const scoped = nodes.filter(n => n.package === screen.packageName && String(n.windowId) === String(screen.windowId) &&
    [GEMINI_NATIVE_PROFILE.userMessageViewId, GEMINI_NATIVE_PROFILE.responseViewId].includes(n.viewId));
  // Android snapshots traverse breadth first, which is not chat-turn order.
  // Require nonoverlapping visible message bounds; never guess from array order.
  try {
    scoped.sort((a,b)=>box(a.bounds).top-box(b.bounds).top);
    for(let i=1;i<scoped.length;i++) if(box(scoped[i-1].bounds).bottom>box(scoped[i].bounds).top)
      return no('MESSAGE_LAYOUT_AMBIGUOUS');
  } catch { return no('MESSAGE_BOUNDS_REQUIRED'); }
  const expectedDigest=createHash('sha256').update(expectedPrompt).digest('hex');
  const matches = scoped.map((n, i) => n.viewId === GEMINI_NATIVE_PROFILE.userMessageViewId &&
    (n.geminiTextDigest ? n.geminiTextDigest===expectedDigest : n.text===expectedPrompt) &&
    n.sensitive !== true && n.sensitive !== 'true' ? i : -1).filter(i => i >= 0);
  if (matches.length !== 1) return no(matches.length ? 'SENT_REQUEST_AMBIGUOUS' : 'SENT_REQUEST_NOT_VISIBLE');
  const following = scoped.slice(matches[0] + 1);
  const nextRequest = following.findIndex(n => n.viewId === GEMINI_NATIVE_PROFILE.userMessageViewId);
  const turn = nextRequest < 0 ? following : following.slice(0, nextRequest);
  const reply = turn.filter(n => n.viewId === GEMINI_NATIVE_PROFILE.responseViewId &&
    typeof n.text === 'string' && n.text.trim() && n.sensitive !== true && n.sensitive !== 'true' &&
    n.editable !== true && n.editable !== 'true');
  if (!reply.length) return no('MATCHING_REPLY_NOT_VISIBLE');
  const response = reply.map(n => n.geminiPlainText ?? n.text).join('\n\n');
  if (response.length > 100_000) return no('REPLY_SIZE_EXCEEDED');
  const truncated=reply.some(n=>n.geminiTextPartial===true||n.geminiTextPartial==='true');
  return { code: 'MATCHING_VISIBLE_REPLY', verified: false, response,
    fullReplyVerified: false, coverage: 'VISIBLE_REPLY_ONLY', partial: true,
    truncated, contentIsUntrusted:true, actionAuthority:false, needsFreshJhValidation: true };
}

/** Any native snapshot string is a candidate, not authentication. The JH host
 * must still verify a fresh signed window, prepare the exact target, obtain
 * phone-local one-shot SEND approval and check the signed execution receipt.
 */
const SEND_LABELS = new Set([
  '전송', '보내기', '메시지 전송', '메시지 보내기',
  'Send', 'Submit', 'Send message'
]);
const isTrue = v => v === true || v === 'true';
const isFalse = v => v === false || v === 'false';
const fields = ['text', 'contentDescription', 'content_description',
  'accessibilityLabel', 'tooltipText', 'label'];
const isSendLabel = n => fields.some(k =>
  typeof n[k] === 'string' && SEND_LABELS.has(n[k].trim()));
function exactDraftInNativeSnapshot(editor, expectedPrompt) {
  if (!editor || typeof expectedPrompt !== 'string' || !expectedPrompt.trim() ||
      isTrue(editor.geminiTextPartial)) return false;
  // Prefer the native extracted text when available. Do not accept prefixes.
  if (typeof editor.geminiPlainText === 'string')
    return editor.geminiPlainText === expectedPrompt;
  if (editor.text === expectedPrompt) return true;
  // The original JH accessibility serializer appends this KNOWN Gemini
  // hint/resource ID to the exact draft; strip this exact suffix only.
  const serializerSuffix = ' Gemini에게 물어보세요 ' + GEMINI_NATIVE_PROFILE.inputViewId;
  return editor.text === expectedPrompt + serializerSuffix;
}
function isSafeClickable(n) {
  return isTrue(n.clickable) && !isTrue(n.editable) && !isTrue(n.sensitive);
}
function candidateRect(n, screen) {
  try {
    const b = box(n.bounds), w = box(screen);
    if (b.left < w.left || b.top < w.top || b.right > w.right ||
        b.bottom > w.bottom) return null;
    return b;
  } catch { return null; }
}
function nearComposerSendArea(node, editorRect, screen) {
  const b = candidateRect(node, screen);
  if (!b || b.right - b.left > 180 || b.bottom - b.top > 180) return false;
  const x = (b.left + b.right) / 2;
  const y = (b.top + b.bottom) / 2;
  return x >= editorRect.right - 195 &&
    y >= editorRect.top - 45 && y <= editorRect.bottom + 165 &&
    b.bottom >= editorRect.bottom - 35;
}
function unlabeledBottomRow(scoped, editorRect, screen) {
  const candidates = scoped.filter(n => {
    if (!isSafeClickable(n) || (n.viewId ?? '') !== '' || (n.text ?? '') !== '' ||
        isSendLabel(n)) return false;
    const b = candidateRect(n, screen);
    return !!b && b.right - b.left >= 60 && b.right - b.left <= 140 &&
      b.bottom - b.top >= 60 && b.bottom - b.top <= 140 &&
      Math.abs(b.top - editorRect.bottom) <= 20;
  });
  // Current Fold Gemini has one left toolbar icon and two adjacent right
  // icons. This is geometry ONLY, never proof that either icon means SEND.
  if (candidates.length !== 3) return null;
  const left = candidates.filter(n => candidateRect(n, screen).right <= editorRect.left + 100);
  const right = candidates.filter(n =>
    candidateRect(n, screen).left >= editorRect.right - 195)
    .sort((u, v) => candidateRect(u, screen).left - candidateRect(v, screen).left);
  if (left.length !== 1 || right.length !== 2 ||
      !right.every(n => nearComposerSendArea(n, editorRect, screen))) return null;
  const a = candidateRect(right[0], screen), b = candidateRect(right[1], screen);
  if (Math.abs(a.right - b.left) > 2 || Math.abs(a.top - b.top) > 2 ||
      Math.abs(a.bottom - b.bottom) > 2 ||
      b.right < editorRect.right - 5) return null;
  return right[1];
}

/** Return a review candidate, NEVER a grant, signed target, or permission.
 * A blank unlabeled icon can only be an UNVERIFIED visual candidate. Neither
 * this function nor its caller may auto-click it from geometry alone.
 */
export function discoverGeminiSubmit(nodes, screen, expectedPrompt) {
  const input = discoverGeminiInput(nodes, screen);
  const refuse = code => ({code, unique:false, verified:false,
    actionAuthority:false, automaticSend:false});
  if (input.code !== 'GEMINI_INPUT_CANDIDATE')
    return refuse('GEMINI_SURFACE_NOT_IDENTIFIED');
  const scoped = nodes.filter(n => n.package === screen.packageName &&
    String(n.windowId) === String(screen.windowId));
  const editor = scoped.find(n => n.viewId === GEMINI_NATIVE_PROFILE.inputViewId);
  if (!exactDraftInNativeSnapshot(editor, expectedPrompt))
    return refuse('DRAFT_NOT_EXACT');
  let editorRect;
  try { editorRect = box(editor.bounds); } catch {
    return refuse('GEMINI_EDITOR_BOUNDS_MISSING');
  }
  const labeled = scoped.filter(n => isSafeClickable(n) && isSendLabel(n));
  if (labeled.length > 1) return refuse('EXACT_SEND_CONTROL_NOT_UNIQUE');
  if (labeled.length === 1) {
    if (!nearComposerSendArea(labeled[0], editorRect, screen))
      return refuse('SEND_OUTSIDE_VERIFIED_WORK_WINDOW');
    try {
      return {code:'SEND_CANDIDATE_REQUIRES_LOCAL_REVIEW',unique:true,
        source:'EXPLICIT_ACCESSIBILITY_LABEL',
        point:nodeToWorkPoint(screen,labeled[0]),
        selector:labeled[0].viewId || null,
        verified:false,actionAuthority:false,automaticSend:false,
        needsFreshJhValidation:true};
    } catch { return refuse('SEND_OUTSIDE_VERIFIED_WORK_WINDOW'); }
  }
  const icon = unlabeledBottomRow(scoped, editorRect, screen);
  if (!icon) return refuse('EXACT_SEND_CONTROL_NOT_UNIQUE');
  // The 3-icon geometry is reproduced on the live JH168 Fold; a microphone
  // and a send icon may swap. No executable target is provided to the driver.
  return {...refuse('GEMINI_UNLABELED_SEND_VISUAL_PROOF_REQUIRED'),
    source:'UNLABELED_COMPOSER_GEOMETRY',candidatePoint:nodeToWorkPoint(screen,icon),
    visualProofRequired:true,needsFreshJhValidation:true};
}
