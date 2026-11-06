# Independent AutoJs6 split-screen experiment

Scope: native ChatGPT on the LEFT and native Gemini on the RIGHT. This directory is a standalone experiment, not a JH runtime route. No production imports, server changes, installation, or automatic merge.

Required flow: exact text selection -> selection-toolbar More (`…` / `⋯`) -> exact Gemini menu item -> matching Gemini draft -> one submit -> observed submission. The More step is mandatory. A dispatch acknowledgement alone is not success.

## Module ownership

- `core.js` and `tests/core.test.cjs`: core agent.
- `autojs-adapter.js` and `tests/adapter.test.cjs`: adapter agent.
- `main.js`, `profile.example.json`, `package.json`, README, verification/checkpoint, Git publication: root.

All phone JavaScript uses ES5 syntax and CommonJS exports. No Node built-ins in core or adapter. Node 18+ tests are offline contracts only, never phone E2E evidence.

## Stable API

`core.run(request, io, journal)` is synchronous and returns a plain JSON result, never a raw node. `core.inspect(request, snapshot)` may provide read-only diagnostics. `module.exports = {run, inspect}` (additional pure helpers allowed).

Request:

```
{
  requestId: string,
  expectedText: string, // ephemeral; not copied into reports/journal
  sourcePackage: 'com.openai.chatgpt',
  targetPackage: 'com.google.android.googlequicksearchbox', // current UI host; bard is the launcher
  targetInputIds: ['com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet'],
  targetTitleLabels: ['Gemini'],
  targetSendIds: [], // optional exact IDs observed for nonstandard button classes
  targetStopIds: [],
  mode: 'probe' | 'selection' | 'more' | 'handoff' | 'submit',
  timeoutMs: 8000,
  pollMs: 200,
  moreLabels: ['옵션 더보기','더보기','더 보기','More','More options','⋯','…'],
  menuLabels: ['Gemini로 보내기','Gemini에게 물어보기','Send to Gemini','Ask Gemini'],
  sendLabels: ['보내기','전송','Send','Submit'],
  stopLabels: ['응답 중지','생성 중지','Stop response','Stop generating'],
  gestureSelection: null // optional observed calibration, see below
}
```

`io.now()` monotonic milliseconds; `io.sleep(ms)`; `io.read()` takes a fresh snapshot; `io.perform(action)` attempts exactly once, returns `{dispatched:boolean, reason?:string}`; `io.cancelled()` boolean.

Snapshot:

```
{
  observedAt: number,
  display: {id:number,width:number,height:number,rotation:number},
  windows: [{
    id:number, displayId:number, type:number, packageName:string,
    parentId:number|null, title:string, active:boolean, focused:boolean, layer:number,
    bounds:{left:number,top:number,right:number,bottom:number},
    nodes:[{
      key:string, windowId:number, packageName:string, path:number[],
      text:string, desc:string, viewId:string, className:string,
      bounds:{left:number,top:number,right:number,bottom:number},
      visible:boolean, enabled:boolean, clickable:boolean, editable:boolean,
      selectionStart:number, selectionEnd:number, actions:number[]
    }]
  }]
}
```

`io.perform` action: `{kind:'long_press'|'set_selection'|'gesture_select'|'click', node:<snapshot node>, window:<snapshot window>, guards?:<snapshot nodes[]>, surfaceGuard?:{verificationMethod:'observed_gemini_editor',window:<target snapshot window>,node:<exact editor>}, start?:number,end?:number, gesture?:<calibration>}`. The adapter must re-read the window and resolve the node's path, refresh it, compare package/window ID/text/description/view ID/bounds before mutating, require visible enabled nodes, and restrict any clickable-ancestor fallback to the same window and node bounds within it. Optional guards (selected source, draft, Gemini title) must be re-resolved and compared at dispatch too. A titleless handoff/submit click also carries `surfaceGuard`: the native adapter's fresh capture must still contain the exact observed Gemini package/editor, a unique eligible input and no higher overlay covering that editor. Reject malformed guards and changes before dispatch. This special target guard does not impose blanket overlay rejection on source-selection guards under their own toolbar. No coordinate click fallback. A long press may use node action or bounded center gesture; coordinates are prohibited if covered by another higher window. `set_selection` uses Android ACTION_SET_SELECTION with exact UTF-16 offsets. `gesture_select` is optional and requires explicit calibration `{display, sourceBounds, sourceText, longPress:{x,y,durationMs}, drags:[{from:{x,y},to:{x,y},durationMs}]}` matching the current source window and text. Do not guess text-handle coordinates. A real readback of selected offsets is still required after gestures.

Journal: `get(requestId)` -> record|null; `claim(requestId, record)` -> boolean, atomic exclusive creation; `put(requestId, record)` -> durable update. Persist a running claim before any action, `handoff_intent` before the Gemini menu click (some native menu handlers may send immediately), and `submit_intent` before the submit click. Any existing claim blocks replay (return saved terminal result when available). The launcher also refuses a new effectful request while any old running/handoff_intent/submit_intent/completion_unknown record exists. Journal/report must not contain expectedText, draft or conversation text, credentials, or full snapshots. Bounded accessible menu/button labels from the scoped diagnostics below are permitted. Failure to persist stops the action. Entry point will implement a process lock + atomic file writes. A request fingerprint supplied by the entry point may be added to records but must not expose text.

Result: `{schema:'jebiseo.autojs6.result.v1',requestId,status,stage,code,trace:[{stage,status,at}],submissionDispatched:boolean,submissionObserved:boolean,liveDeviceVerified:false|true}`. Status uses `probe_ok`, `selection_verified`, `menu_verified`, `handoff_verified`, `submission_observed`, `blocked`, `cancelled`, or `completion_unknown`. Only actual adapter runs may identify live execution; offline tests never assert live phone success. A successful live run records only the evidence stages it observed, not Gemini answer quality.

The `more` mode stops at stage `MENU` with `status:'menu_verified'` and `code:'GEMINI_MENU_VERIFIED'` after the mandatory More click and observation of exactly one source-owned, configured Gemini menu item. It never clicks that item, creates a handoff/submit intent, or sends text. Existing Gemini drafts need not be empty and remain untouched. The initial split, Gemini surface, exact source selection, fresh reads, ownership, timeout, cancellation, and durable no-replay checks still apply. Its `diagnostics` uses the already verified menu snapshot; unsupported optional diagnostics do not change an observed menu success into a failed action. `liveDeviceVerified` remains false because no full submission was observed.

### Scoped read-only diagnostics

`jebiseo.autojs6.probe.v1` adds `observedMenuControls`, at most 16 observations in snapshot order:

```
{
  role: 'more' | 'menu_item',
  text: string, description: string, // each at most 80 UTF-16 code units
  viewId: string, windowId: number,
  clickable: boolean, enabled: boolean
}
```

Candidates must be visible noneditable nodes in the source window or a verified descendant popup, with source/framework/SystemUI ownership and a known framework selection-toolbar ancestor or exact supported framework control ID. Containers, the matched source content node, unrelated conversation nodes, other-app windows, and unowned popups are excluded. Strings containing `expectedText` are omitted, as are unlabeled candidates. Disabled controls may appear with `enabled:false`; observation never makes them actionable. Unknown actual toolbar labels can therefore be diagnosed without being added to any action allowlist.

Existing `more`, `geminiMenu`, and `sendControls` metadata add bounded `text` and `description`. For send controls, these come from the actual matched child `labelNode` when present, while the existing key/ID/bounds continue to describe the clickable button. No editor draft, source message, raw node, or full UI tree is added. A `probe_ok` still means the split Gemini surface is identifiable; the separate source/selection/menu fields describe each observation and do not claim a completed handoff.

## Required controller behavior

1. Identify exactly one source and target application window (type=1) on the same display, nonoverlapping horizontal LEFT/RIGHT geometry. Ambiguous, missing, reversed, stacked, or occluded target -> stop. Background accessibility windows alone are not evidence of a visible split pair.
   The Google host package alone is not Gemini identity. The normal path requires both configured editor and surface title. The v0.3.2 phone observation separately establishes the exact `com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet` in that package without an accessible title. Only this fixed observed package/ID may use the titleless path, with a visible/enabled/editable editor, one eligible input, correct window ownership and no occlusion. Both handoff and submit carry the explicit fresh native `surfaceGuard`. Unknown IDs and ordinary Google Search inputs remain blocked.
2. Exact unique visible source substring, unambiguous occurrence. Long press to open selection mode, then ACTION_SET_SELECTION when supported or calibrated gestures. Verify exact selection offsets before More.
3. Find one visible selection-toolbar More control, scoped to the source window or an observed child popup, with a framework toolbar ID or verified toolbar ancestry. A generic ChatGPT conversation ellipsis must not match. Click and wait for the exact Gemini item to appear; reread popup roots, do not reuse a stale node or active-window-only selector. Stop here in `more` mode with `menu_verified`, before clicking the Gemini item.
4. Click one source-owned Gemini menu item. Wait for one visible target editable draft exactly equal to expectedText; no automatic clipboard paste or setText substitute. Stop at this stage in handoff mode. If dispatch occurs but no matching unsent draft can be verified, return completion_unknown and block replay, because the native menu handler may have sent immediately. Results distinguish handoffDispatched/handoffObserved from the separate explicit submission flags.
5. In submit mode, find exact target send control, verify split placement and unchanged draft again, persist intent, click once. Observe draft cleared AND a newly observed matching noneditable conversation message or newly observed generation/stop indicator compared with the pre-submit snapshot. Timeout after dispatch -> completion_unknown, no retry.
   Send/stop labels must belong to an actual Button/ImageButton (or its child label), or an exact configured observed control ID. Plain conversation text reading 'Send'/'Stop response' is not a button or submission evidence. A saved terminal receipt may be reused only with equal nonempty request fingerprints; otherwise the existing ID blocks actions without misattributing an old result.
6. Each stage is bounded and cancellable. Refresh roots after window changes. Allow normal keyboard resizing only while the same window identities/display/LEFT-RIGHT placement remain valid. Any calibrated gesture must match exact geometry. Do not issue extra UI actions to recover a blocked stage.
7. Probe is read only and reports capabilities, window IDs/packages/bounds, bounded scoped menu/button labels and matching control metadata, and booleans/lengths rather than all app text. Diagnostic values never automatically change execution selectors. The report records the explicit surface verification method and bounded private-storage failure stage/kind; it never exports raw exceptions or input contents. Configured eligible editor hint diagnostics contain booleans only (text empty, optional hint API availability, nonempty hint availability, equality and showing-hint state). These observations never normalize editor text or relax draft/effect checks.

## Later JH integration gate

Phone E2E on the user's actual split screen, including More, correct text, exactly one submit, failure stage evidence, cancellation, and no replay after interruption. Only then adapt to the existing JH request/approval/receipt contract. The standalone journal is NOT a JH approval or a signed JH completion receipt.
