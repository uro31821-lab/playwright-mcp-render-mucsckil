package com.koreanlifehub.bridge

import android.app.KeyguardManager
import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import com.koreanlifehub.bridge.JebiseoTextHandoffPolicy.Binding
import com.koreanlifehub.bridge.JebiseoTextHandoffPolicy.Request
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.Action
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.ActionKind
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.DataClass
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.ScreenRef
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.SurfaceTrust
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.Target
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.TargetRisk
import com.koreanlifehub.bridge.OrchestratorAndroidComputerUseAdapter.TaskPolicy

/**
 * Actual Android selection / toolbar click / Gemini submit executor.
 * Only native LEFT ChatGPT source text and an owned, exact Gemini toolbar item can be touched.
 * No clipboard, Intent, arbitrary LEFT click, input typing, coordinate guessing or action replay.
 */
internal object JebiseoTextHandoffRuntime {
    private class State {
        // Receipt expiry is the same corrected server epoch used by Secure56 signatures.
        val ledger=JebiseoTextHandoffPolicy.Ledger(now={SecureBridge56Runtime.session.transportNowMillis()})
        val results=ConcurrentHashMap<String,JSONObject>()
        val origins=ConcurrentHashMap<String,Origin>()
        val pending=ConcurrentHashMap<String,Pending>()
        val inFlight=ConcurrentHashMap.newKeySet<String>()
    }
    private val states=JebiseoTextHandoffPolicy.StateSlot(::State)
    private const val MAX_NODES=1800
    private val sendLabels=setOf("전송","보내기","Send","Submit")
    private val toolbarPackages=setOf(PanePolicy.CHAT,"android","com.android.systemui")
    private data class Tree(val nodes:List<AccessibilityNodeInfo>,val complete:Boolean)
    private data class PairView(val scope:AgentFocusPolicy.Scope,val windows:List<AccessibilityWindowInfo>)
    private data class Source(val node:AccessibilityNodeInfo,val text:String,val range:JebiseoTextHandoffPolicy.Range,
        val key:String)
    private data class Origin(val scope:AgentFocusPolicy.Scope,val sourceKey:String,val sourceText:String,
        val range:JebiseoTextHandoffPolicy.Range)
    private data class Click(val node:AccessibilityNodeInfo,val windowId:Int,val packageName:String,
        val key:String,val x:Int,val y:Int)
    private data class MenuView(val pair:PairView,val source:Source,val click:Click,val screenDigest:String)
    private data class GeminiView(val pair:PairView,val click:Click,val review:GeminiSubmitReviewPolicy.Review,
        val screen:ScreenRef,val action:Action,val target:Target,val summary:String,val messageCount:Int) {
        val screenDigest:String get()=OrchestratorAndroidComputerUseAdapter.digestScreen(screen)
        fun same(other:GeminiView)=pair.scope==other.pair.scope && click.key==other.click.key &&
            screen==other.screen && review==other.review && action==other.action && target==other.target
    }
    private data class Pending(val token:String,val actionDigest:String,val screenDigest:String,
        val packageName:String,val windowId:Int)
    private data class Attempt(val state:State,var dispatched:Boolean=false)

    // Called while BridgeService may hold siteFence. No execution lock or platform call here.
    fun clear(){states.clear()}
    private fun sha(s:String)=JebiseoTextHandoffPolicy.sha(s)
    private fun material(vararg s:String)=JebiseoTextHandoffPolicy.material(s.toList())
    private fun box(n:AccessibilityNodeInfo)=Rect().also{n.getBoundsInScreen(it)}
    private fun box(w:AccessibilityWindowInfo)=Rect().also{w.getBoundsInScreen(it)}
    private fun link(r:Rect)=LinkPolicy.Box(r.left,r.top,r.right,r.bottom)
    private fun pkg(w:AccessibilityWindowInfo)=runCatching{w.root?.packageName?.toString()}.getOrNull().orEmpty()
    private fun inside(b:LinkPolicy.Box,r:Rect)=r.width()>0 && r.height()>0 && r.left>=b.left &&
        r.top>=b.top && r.right<=b.right && r.bottom<=b.bottom
    private fun overlap(a:Rect,b:Rect)=a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom
    private fun sourceWindow(w:AccessibilityWindowInfo,chatId:Int):Boolean {
        if(w.id==chatId)return pkg(w)==PanePolicy.CHAT
        if(pkg(w) !in toolbarPackages || w.type !in setOf(AccessibilityWindowInfo.TYPE_APPLICATION,
                AccessibilityWindowInfo.TYPE_SYSTEM))return false
        var p=runCatching{w.parent}.getOrNull()
        repeat(4){if(p?.id==chatId)return true;p=runCatching{p?.parent}.getOrNull()}
        return false
    }
    private fun allWindows(s:BridgeService):List<AccessibilityWindowInfo>? {
        if(Build.VERSION.SDK_INT<30)return null
        return try {
            val groups=s.windowsOnAllDisplays;val out=mutableListOf<AccessibilityWindowInfo>()
            for(i in 0 until groups.size())for(w in groups.valueAt(i)){
                if(out.size>=128)return null
                out.add(w)
            }
            out
        }catch(_:Throwable){null}
    }
    private fun tree(w:AccessibilityWindowInfo):Tree {
        val root=runCatching{w.root}.getOrNull()?:return Tree(emptyList(),false)
        val q=ArrayDeque<AccessibilityNodeInfo>();q.add(root)
        val out=mutableListOf<AccessibilityNodeInfo>();val deadline=SystemClock.elapsedRealtime()+600L
        var complete=true
        while(q.isNotEmpty() && out.size<MAX_NODES && SystemClock.elapsedRealtime()<=deadline){
            val n=q.removeFirst();out.add(n)
            try {
                if(n.childCount>120){complete=false;break}
                for(i in 0 until n.childCount){
                    val child=n.getChild(i)
                    if(child==null){complete=false;break}
                    q.add(child)
                }
            }catch(_:Throwable){complete=false;break}
        }
        return Tree(out,complete&&q.isEmpty())
    }
    private fun visible(n:AccessibilityNodeInfo,w:AgentFocusPolicy.Window)=n.windowId==w.id &&
        n.packageName?.toString()==w.pkg && n.isVisibleToUser && n.isEnabled && !n.isPassword && inside(w.box,box(n))
    private fun key(n:AccessibilityNodeInfo)=sha(material(n.windowId.toString(),n.packageName?.toString().orEmpty(),
        n.viewIdResourceName.orEmpty(),n.className?.toString().orEmpty(),box(n).toShortString(),
        n.text?.toString().orEmpty(),n.contentDescription?.toString().orEmpty()))
    private fun pairKey(p:PairView)=sha(material(p.scope.chat.toString(),p.scope.work.toString()))
    private fun base(s:BridgeService):String? = when {
        !s.workExecutionAllowed() -> "jebiseo_command_discarded"
        (s.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.isKeyguardLocked!=false -> "jebiseo_device_locked"
        SensitiveGuard.paused(s) -> "jebiseo_sensitive_mode"
        LinkSplitController.routingActive -> "jebiseo_routing_busy"
        FormChoices.active() -> "jebiseo_other_choice_pending"
        else -> null
    }
    private fun current(s:BridgeService,r:Request,b:Binding,j:JSONObject,fence:Long,a:Attempt):Boolean {
        if(!states.current(a.state))return false
        val active=SecureBridge56Runtime.session.activeView()?:return false
        val now=SecureBridge56Runtime.session.transportNowMillis()
        return active.sessionId==b.sessionId && active.deviceDigest==b.deviceDigest &&
            s.workExecutionCurrent(fence) && base(s)==null && a.state.ledger.current(r,b) &&
            j.optLong("secureExpiresAt",0L)>=now && j.optLong("secureInvocationExpiresAt",0L)>=now &&
            states.current(a.state)
    }
    private fun livePair(s:BridgeService,origin:Origin?=null,allowToolbar:Boolean=false,
        requireGemini:Boolean=false,approvalToken:String?=null):PairView? {
        if(base(s)!=null)return null
        val ws=allWindows(s)?:return null
        val scope=if(origin==null)AndroidAgent.windowSelection(s).scope else {
            val old=origin.scope;val chat=old.chat?:return null
            val chatWindow=ws.singleOrNull{it.id==chat.id && it.type==AccessibilityWindowInfo.TYPE_APPLICATION &&
                pkg(it)==PanePolicy.CHAT && link(box(it))==chat.box && it.displayId==chat.displayId}?:return null
            val candidates=ws.filter { w ->
                w.id!=chat.id && w.type==AccessibilityWindowInfo.TYPE_APPLICATION && w.displayId==chat.displayId &&
                    link(box(w))==old.work.box && (if(requireGemini)pkg(w)==GeminiNativeContract.HOST
                    else w.id==old.work.id && pkg(w)==old.work.pkg) && box(w).left>=box(chatWindow).right
            }
            val work=candidates.singleOrNull()?:return null
            AgentFocusPolicy.Scope(AgentFocusPolicy.Window(work.id,pkg(work),link(box(work)),work.isActive,work.isFocused,
                false,work.displayId),AgentFocusPolicy.Window(chatWindow.id,PanePolicy.CHAT,link(box(chatWindow)),
                chatWindow.isActive,chatWindow.isFocused,true,chatWindow.displayId))
        }?:return null
        val chat=scope.chat?:return null
        if(chat.pkg!=PanePolicy.CHAT || chat.displayId==null || chat.displayId<0 || chat.displayId!=scope.work.displayId ||
            chat.box.right>scope.work.box.left || (requireGemini && scope.work.pkg!=GeminiNativeContract.HOST))return null
        if(SplitComfortStore.locked(s) && SplitComfortStore.lockedPackage(s)!=scope.work.pkg)return null
        val cr=Rect(chat.box.left,chat.box.top,chat.box.right,chat.box.bottom)
        val wr=Rect(scope.work.box.left,scope.work.box.top,scope.work.box.right,scope.work.box.bottom)
        for(w in ws.filter{it.displayId==chat.displayId}){
            if(w.id==chat.id || w.id==scope.work.id || w.type==AccessibilityWindowInfo.TYPE_INPUT_METHOD ||
                w.type==AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER)continue
            val rect=box(w)
            if(!overlap(rect,cr)&&!overlap(rect,wr))continue
            // Only this exact pending local review overlay may temporarily cover the pair.
            if(w.type==AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY && pkg(w)==s.packageName &&
                approvalToken!=null && AndroidComputerUseApprovalOverlay.state(approvalToken) in setOf(
                    "shown_non_focusable_overlay","existing_overlay_reused","approved_locally_same_scope"))continue
            if(allowToolbar && sourceWindow(w,chat.id) && inside(chat.box,rect))continue
            return null
        }
        return PairView(scope,ws)
    }
    private fun findSource(pair:PairView,prompt:String):Source? {
        val chat=pair.scope.chat?:return null
        val t=tree(pair.windows.singleOrNull{it.id==chat.id}?:return null)
        if(!t.complete)return null
        val choices=t.nodes.mapNotNull { n ->
            if(!visible(n,chat) || n.isEditable || n.isPassword)return@mapNotNull null
            // A generic long-click on a link/button is not text selection authority.
            val selectable=n.actionList.any{it.id==AccessibilityNodeInfo.ACTION_SET_SELECTION} ||
                (Build.VERSION.SDK_INT>=34 && n.isTextSelectable)
            if(!selectable || (Build.VERSION.SDK_INT>=34 && n.isAccessibilityDataSensitive))return@mapNotNull null
            val text=n.text?.toString()?:return@mapNotNull null
            if(FormPolicy.sensitive(text,n.isPassword,n.inputType))return@mapNotNull null
            val range=JebiseoTextHandoffPolicy.uniqueRange(text,prompt)?:return@mapNotNull null
            Source(n,text,range,key(n))
        }
        return choices.singleOrNull()
    }
    private fun selected(s:Source,r:Request,origin:Origin)=s.key==origin.sourceKey && s.text==origin.sourceText &&
        s.range==origin.range && JebiseoTextHandoffPolicy.selectionMatches(s.text,r.preparedPrompt,
            s.node.textSelectionStart,s.node.textSelectionEnd)
    private fun sourceUnobscured(pair:PairView,source:Source,allowToolbar:Boolean):Boolean {
        val chat=pair.scope.chat?:return false
        val owner=pair.windows.singleOrNull{it.id==chat.id}?:return false
        val target=box(source.node)
        return pair.windows.filter{it.displayId==owner.displayId && it.id!=owner.id && it.layer>owner.layer}.none { w ->
            if(w.type==AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER)return@none false
            if(allowToolbar && sourceWindow(w,chat.id) && inside(chat.box,box(w)))return@none false
            overlap(box(w),target)
        }
    }
    private fun clickTarget(n:AccessibilityNodeInfo,w:AccessibilityWindowInfo,container:LinkPolicy.Box,maxDepth:Int=4):Click? {
        var candidate:AccessibilityNodeInfo?=n
        repeat(maxDepth){
            val c=candidate?:return null
            if(c.windowId!=w.id || !c.isVisibleToUser || !c.isEnabled || c.isEditable || c.isPassword ||
                !inside(container,box(c)))return null
            if(c.isClickable && c.actionList.any{it.id==AccessibilityNodeInfo.ACTION_CLICK}){
                val rect=box(c)
                return Click(c,w.id,c.packageName?.toString().orEmpty(),key(c),rect.centerX(),rect.centerY())
            }
            candidate=runCatching{c.parent}.getOrNull()
        }
        return null
    }
    private fun unobscured(p:PairView,c:Click,approvalToken:String?=null):Boolean {
        val target=box(c.node);val owner=p.windows.singleOrNull{it.id==c.windowId}?:return false
        return p.windows.filter{it.displayId==owner.displayId && it.id!=owner.id && it.layer>owner.layer}.none { w ->
            if(w.type==AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER)return@none false
            if(w.type==AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY && pkg(w)=="com.koreanlifehub.bridge" &&
                approvalToken!=null && AndroidComputerUseApprovalOverlay.state(approvalToken) in setOf(
                    "shown_non_focusable_overlay","existing_overlay_reused","approved_locally_same_scope"))return@none false
            overlap(box(w),target)
        }
    }
    private fun menu(s:BridgeService,r:Request,origin:Origin,token:String?=null):MenuView? {
        val p=livePair(s,origin,allowToolbar=true,approvalToken=token)?:return null
        val chat=p.scope.chat?:return null
        val source=findSource(p,r.preparedPrompt)?:return null
        if(!selected(source,r,origin))return null
        val candidates=mutableListOf<Click>();val context=mutableListOf<String>()
        for(w in p.windows.filter{it.displayId==chat.displayId && sourceWindow(it,chat.id)}){
            val t=tree(w);if(!t.complete)return null
            for(n in t.nodes.filter{it.isVisibleToUser && !it.isPassword}){
                context.add(key(n))
                val labels=listOfNotNull(n.text?.toString(),n.contentDescription?.toString())
                if(labels.none{it in JebiseoTextHandoffPolicy.menuLabels} || n.isEditable || !n.isEnabled)continue
                // OS-owned selection menu resource evidence is mandatory even inside ChatGPT's
                // own window. Body links/buttons with the same words are never menu candidates.
                if(!JebiseoTextHandoffPolicy.toolbarItem(n.viewIdResourceName.orEmpty(),
                    n.className?.toString().orEmpty(),sourceWindow(w,chat.id)))continue
                val target=clickTarget(n,w,chat.box,maxDepth=2)?:continue
                if(target.packageName !in toolbarPackages || !unobscured(p,target,token))continue
                candidates.add(target)
            }
        }
        val click=candidates.distinctBy{it.key}.singleOrNull()?:return null
        return MenuView(p,source,click,sha(material(pairKey(p),source.key,source.range.toString(),
            click.key,context.joinToString("|"))))
    }
    private fun gemini(s:BridgeService,r:Request,origin:Origin,token:String?=null):GeminiView? {
        val p=livePair(s,origin,requireGemini=true,approvalToken=token)?:return null
        val w=p.windows.singleOrNull{it.id==p.scope.work.id}?:return null
        val t=tree(w);if(!t.complete)return null
        val nodes=t.nodes.filter{visible(it,p.scope.work)}
        val drafts=nodes.filter{it.isEditable}
        if(drafts.size!=1 || drafts.single().text?.toString()!=r.preparedPrompt)return null
        val clicks=nodes.filter{!it.isEditable && listOfNotNull(it.text?.toString(),it.contentDescription?.toString()).any(sendLabels::contains)}
            .mapNotNull{clickTarget(it,w,p.scope.work.box)}.distinctBy{it.key}
        val click=clicks.singleOrNull()?:return null
        if(!unobscured(p,click,token))return null
        val context=nodes.joinToString("|"){key(it)}
        val review=GeminiSubmitReviewPolicy.observe(p.scope.work.pkg,true,
            nodes.any{!it.isEditable && Regex("^Gemini(?:\\s|$)").containsMatchIn(it.text?.toString().orEmpty())},
            drafts.map{GeminiSubmitReviewPolicy.Editor(it.viewIdResourceName.orEmpty(),it.text?.toString().orEmpty(),it.isPassword)},
            nodes.filter{!it.isEditable && box(it).contains(click.x,click.y)}
                .flatMap{listOfNotNull(it.text?.toString(),it.contentDescription?.toString())},sha(context))?:return null
        if(review.draft!=r.preparedPrompt)return null
        val b=p.scope.work.box
        val screen=ScreenRef(w.id,p.scope.work.pkg,OrchestratorAndroidComputerUseAdapter.Rect(b.left,b.top,b.right,b.bottom),
            b.width,b.height,sha(material(pairKey(p),context)))
        val action=Action(0,ActionKind.CLICK,x=click.x-b.left,y=click.y-b.top,dataClass=DataClass.NONE)
        val target=Target(SurfaceTrust.ACCESSIBILITY_VERIFIED,TargetRisk.CONSEQUENTIAL,review.bindTarget(click.key))
        val summary=GeminiSubmitReviewPolicy.prompt(TaskPolicy(r.taskId,OrchestratorPolicy.Effect.REVERSIBLE_WRITE,
            currentDevicePreferred=true,maxActionsInCall=1,allowGlobalHome=false),screen,action,target,review)?:return null
        return GeminiView(p,click,review,screen,action,target,summary,nodes.count{!it.isEditable && it.text?.toString()==r.preparedPrompt})
    }
    private fun approval(s:BridgeService,r:Request,b:Binding,a:Attempt,packageName:String,windowId:Int,actionDigest:String,
        screenDigest:String,summary:String,validate:()->Boolean):Pair<String?,JSONObject?> {
        if(!states.current(a.state))return null to response(r,"jebiseo_command_discarded")
        var prior=a.state.pending[r.requestId]
        if(prior!=null && (prior.actionDigest!=actionDigest || prior.screenDigest!=screenDigest ||
            prior.packageName!=packageName || prior.windowId!=windowId)){
            AndroidComputerUseActionApprovalRuntime.denyLocally(prior.token)
            return null to response(r,"jebiseo_approval_target_changed")
        }
        if(prior==null){
            if(!validate())return null to response(r,"jebiseo_scope_changed_before_approval")
            val request=AndroidComputerUseActionApprovalRuntime.approvals.request(r.taskId,actionDigest,packageName,windowId,
                "CLICK","CONSEQUENTIAL","REVERSIBLE_WRITE",JebiseoTextHandoffPolicy.TTL_MS,screenDigest)
            val token=request.requestToken
            if(!request.ok || token.isNullOrBlank())return null to response(r,request.code)
            prior=Pending(token,actionDigest,screenDigest,packageName,windowId);a.state.pending[r.requestId]=prior
            if(!states.current(a.state)){
                AndroidComputerUseActionApprovalRuntime.denyLocally(token)
                return null to response(r,"jebiseo_command_discarded")
            }
            val scheduled=AndroidComputerUseApprovalOverlay.schedule(s,token,summary){
                states.current(a.state) && a.state.ledger.current(r,b) && validate() && states.current(a.state)
            }
            if(scheduled=="overlay_schedule_failed"){
                AndroidComputerUseActionApprovalRuntime.denyLocally(token)
                return null to response(r,scheduled)
            }
        }
        if(!states.current(a.state))return null to response(r,"jebiseo_command_discarded")
        val state=AndroidComputerUseActionApprovalRuntime.statusForRequest(prior.token)
        if(state.approved && !state.grantToken.isNullOrBlank())return state.grantToken to null
        if(!state.pending)return null to response(r,state.code)
        return null to response(r,"local_action_approval_required").put("approvalPending",true)
            .put("approvalRequestToken",prior.token)
    }
    private fun response(r:Request,code:String)=JebiseoTextHandoffTransport.error(code).put("phase",r.phase)
        .put("requestId",r.requestId).put("runDigest",r.runDigest)
    private fun finish(r:Request,b:Binding,code:String,verified:Boolean,a:Attempt,proof:String?=null):JSONObject {
        val stillCurrent=states.current(a.state) && a.state.ledger.current(r,b)
        val receipt=a.state.ledger.complete(r,b,verified && stillCurrent)
        val ok=verified && stillCurrent && states.current(a.state) &&
            (r.phase==JebiseoTextHandoffPolicy.SUBMIT || receipt!=null)
        val out=response(r,if(verified&&!ok)"jebiseo_scope_expired_after_action" else code)
            .put("ok",ok).put("resultVerified",ok).put("phoneActionDispatched",a.dispatched)
        if(proof!=null)out.put(proof,ok)
        if(receipt!=null && ok)out.put("receipt",receipt.token).put("expiresAt",receipt.expiresAt)
        a.state.pending.remove(r.requestId)?.let{AndroidComputerUseActionApprovalRuntime.denyLocally(it.token)}
        // This state may have been discarded meanwhile; never write through the active slot.
        a.state.results[r.requestId]=JSONObject(out.toString())
        return out
    }
    private fun pause(ms:Long){try{Thread.sleep(ms)}catch(_:InterruptedException){Thread.currentThread().interrupt()}}

    fun execute(s:BridgeService,j:JSONObject,r:Request,b:Binding):JSONObject {
        val state=states.capture()
        if(!state.inFlight.add(r.requestId))return response(r,"jebiseo_request_in_progress")
        val attempt=Attempt(state)
        return try {
            if(!states.current(state))return response(r,"jebiseo_command_discarded")
            val reserved=state.ledger.reserve(r,b)
            if(!reserved.ok)return response(r,reserved.code)
            state.results[r.requestId]?.let{
                if(!states.current(state))return response(r,"jebiseo_command_discarded")
                return JSONObject(it.toString()).put("duplicateRequest",true)
            }
            val fence=s.workExecutionToken()?:return finish(r,b,"jebiseo_command_discarded",false,attempt)
            if(!current(s,r,b,j,fence,attempt))return finish(r,b,"jebiseo_current_signed_scope_required",false,attempt)
            when(r.phase){
                JebiseoTextHandoffPolicy.SELECT -> select(s,j,r,b,fence,attempt)
                JebiseoTextHandoffPolicy.MENU -> clickMenu(s,j,r,b,fence,attempt)
                JebiseoTextHandoffPolicy.SUBMIT -> submit(s,j,r,b,fence,attempt)
                else -> finish(r,b,"jebiseo_unsupported_phase",false,attempt)
            }
        }catch(_:Throwable){finish(r,b,"jebiseo_execution_unverified_no_replay",false,attempt)}
        finally{state.inFlight.remove(r.requestId)}
    }
    private fun select(s:BridgeService,j:JSONObject,r:Request,b:Binding,fence:Long,a:Attempt):JSONObject {
        val pair=livePair(s)?:return finish(r,b,"jebiseo_native_split_required",false,a)
        val source=findSource(pair,r.preparedPrompt)?:return finish(r,b,"jebiseo_source_text_not_unique",false,a)
        if(!sourceUnobscured(pair,source,false))return finish(r,b,"jebiseo_source_text_obscured",false,a)
        val origin=Origin(pair.scope,source.key,source.text,source.range)
        // The semantic long-click opens Android's text toolbar, only on the exact source node.
        // It is not a generic coordinate gesture and cannot target another LEFT control.
        if(source.node.actionList.any{it.id==AccessibilityNodeInfo.ACTION_LONG_CLICK}){
            val again=livePair(s)?:return finish(r,b,"jebiseo_source_window_changed",false,a)
            val exact=findSource(again,r.preparedPrompt)?:return finish(r,b,"jebiseo_source_text_changed",false,a)
            if(exact.key!=source.key || !sourceUnobscured(again,exact,false) || !current(s,r,b,j,fence,a))
                return finish(r,b,"jebiseo_source_text_changed",false,a)
            a.dispatched=true
            if(!exact.node.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK))
                return finish(r,b,"jebiseo_selection_toolbar_unavailable",false,a)
            pause(150L)
        }
        val currentPair=livePair(s,origin,allowToolbar=true)?:return finish(r,b,"jebiseo_selection_layout_unverified",false,a)
        val exact=findSource(currentPair,r.preparedPrompt)?:return finish(r,b,"jebiseo_source_text_changed",false,a)
        if(exact.key!=origin.sourceKey || !sourceUnobscured(currentPair,exact,true) ||
            !exact.node.actionList.any{it.id==AccessibilityNodeInfo.ACTION_SET_SELECTION})
            return finish(r,b,"jebiseo_text_selection_api_unavailable",false,a)
        if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
        val args=Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT,exact.range.start)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT,exact.range.end)
        }
        a.dispatched=true
        if(!exact.node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION,args))
            return finish(r,b,"jebiseo_text_selection_rejected",false,a)
        repeat(4){
            if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
            val fresh=livePair(s,origin,allowToolbar=true)?.let{findSource(it,r.preparedPrompt)}
            if(fresh!=null && selected(fresh,r,origin)){
                a.state.origins[r.runDigest]=origin
                return finish(r,b,"jebiseo_selection_verified",true,a,"selectionVerified")
            }
            pause(100L)
        }
        return finish(r,b,"jebiseo_selection_readback_unverified",false,a)
    }
    private fun clickMenu(s:BridgeService,j:JSONObject,r:Request,b:Binding,fence:Long,a:Attempt):JSONObject {
        val origin=a.state.origins[r.runDigest]?:return finish(r,b,"jebiseo_source_origin_missing",false,a)
        val before=menu(s,r,origin,a.state.pending[r.requestId]?.token)
            ?:return finish(r,b,"jebiseo_owned_gemini_menu_not_verified",false,a)
        val actionDigest=sha(material(r.runDigest,r.phase,r.requestId,b.commandId,b.sessionId,before.screenDigest,before.click.key))
        val (grant,waiting)=approval(s,r,b,a,before.click.packageName,before.click.windowId,actionDigest,before.screenDigest,
            "선택한 글을 Google Gemini에게 전달하는 메뉴를 한 번 누릅니다. 메뉴가 내용을 즉시 보낼 수도 있습니다.\n\n"+
                "선택 내용 시작\n${r.preparedPrompt}\n선택 내용 끝\n\n이 승인은 이후 Gemini 실행 버튼이나 삼성 앱 작업의 승인이 아닙니다.") {
            s.workExecutionCurrent(fence) && base(s)==null && menu(s,r,origin,a.state.pending[r.requestId]?.token)?.let{
                it.screenDigest==before.screenDigest && it.click.key==before.click.key}==true
        }
        if(waiting!=null){
            if(waiting.optBoolean("approvalPending",false))return waiting
            return finish(r,b,waiting.optString("code"),false,a)
        }
        val fresh=menu(s,r,origin)?:return finish(r,b,"jebiseo_menu_changed_after_approval",false,a)
        if(fresh.screenDigest!=before.screenDigest || fresh.click.key!=before.click.key || !current(s,r,b,j,fence,a))
            return finish(r,b,"jebiseo_menu_changed_after_approval",false,a)
        val consumed=AndroidComputerUseActionApprovalRuntime.approvals.consumeExact(grant,r.taskId,
            fresh.click.packageName,fresh.click.windowId,actionDigest,fresh.screenDigest)
        if(!consumed.ok)return finish(r,b,consumed.code,false,a)
        if(grant!=null)AndroidComputerUseActionApprovalRuntime.markGrantConsumed(grant)
        if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
        a.dispatched=true
        if(!fresh.click.node.refresh() || key(fresh.click.node)!=fresh.click.key ||
            !fresh.click.node.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            return finish(r,b,"jebiseo_menu_click_unverified",false,a)
        repeat(6){
            pause(150L)
            if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
            val draft=gemini(s,r,origin)
            if(draft!=null){
                a.state.origins[r.runDigest]=origin.copy(scope=draft.pair.scope)
                return finish(r,b,"jebiseo_gemini_draft_verified",true,a,"draftVerified")
            }
        }
        return finish(r,b,"jebiseo_menu_dispatched_draft_unverified",false,a,"draftVerified")
    }
    private fun submit(s:BridgeService,j:JSONObject,r:Request,b:Binding,fence:Long,a:Attempt):JSONObject {
        val origin=a.state.origins[r.runDigest]?:return finish(r,b,"jebiseo_source_origin_missing",false,a)
        val before=gemini(s,r,origin,a.state.pending[r.requestId]?.token)
            ?:return finish(r,b,"jebiseo_exact_gemini_draft_required",false,a)
        val actionDigest=sha(material(r.runDigest,r.phase,r.requestId,b.commandId,b.sessionId,before.screenDigest,
            before.target.targetDigest,before.review.bindingDigest))
        val (grant,waiting)=approval(s,r,b,a,GeminiNativeContract.HOST,before.click.windowId,actionDigest,before.screenDigest,
            before.summary){s.workExecutionCurrent(fence) && base(s)==null &&
                gemini(s,r,origin,a.state.pending[r.requestId]?.token)?.let{before.same(it)}==true}
        if(waiting!=null){
            if(waiting.optBoolean("approvalPending",false))return waiting
            return finish(r,b,waiting.optString("code"),false,a)
        }
        val fresh=gemini(s,r,origin)?:return finish(r,b,"jebiseo_draft_changed_after_approval",false,a)
        if(!before.same(fresh) || !current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_draft_changed_after_approval",false,a)
        val consumed=AndroidComputerUseActionApprovalRuntime.approvals.consumeExact(grant,r.taskId,
            GeminiNativeContract.HOST,fresh.click.windowId,actionDigest,fresh.screenDigest)
        if(!consumed.ok)return finish(r,b,consumed.code,false,a)
        if(grant!=null)AndroidComputerUseActionApprovalRuntime.markGrantConsumed(grant)
        if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
        // Existing RIGHT executor still owns protected-click/occlusion/lock and the last re-read.
        val result=AndroidAgent.executeRightPane(s,AgentStep("click","coord:${fresh.click.x},${fresh.click.y}"),
            AndroidAgent.RightPaneExecutionScope(GeminiNativeContract.HOST,fresh.click.windowId,
                allowProtectedClick=true,beforeClick={
                    val ready=current(s,r,b,j,fence,a) && gemini(s,r,origin)?.let{fresh.same(it)}==true
                    // Crossing the last dispatch gate is potentially effectful even if Android
                    // throws or returns an indeterminate result afterwards. Never erase this.
                    if(ready)a.dispatched=true
                    ready
                }))
        if(result!="clicked")return finish(r,b,"jebiseo_submit_"+result.take(100),false,a,"submissionVerified")
        repeat(6){
            pause(150L)
            if(!current(s,r,b,j,fence,a))return finish(r,b,"jebiseo_command_changed",false,a)
            val pair=livePair(s,origin,requireGemini=true)
            val window=pair?.windows?.singleOrNull{it.id==pair.scope.work.id}
            if(pair!=null && window!=null){
                val t=tree(window);val nodes=t.nodes.filter{visible(it,pair.scope.work)}
                val inputs=nodes.filter{it.isEditable}
                val newMessageCount=nodes.count{!it.isEditable && it.text?.toString()==r.preparedPrompt}
                if(t.complete && inputs.size==1 && inputs.single().viewIdResourceName==GeminiSubmitReviewPolicy.INPUT &&
                    inputs.single().text?.toString().orEmpty().isEmpty() && newMessageCount>fresh.messageCount)
                    return finish(r,b,"jebiseo_submission_verified",true,a,"submissionVerified")
            }
        }
        return finish(r,b,"gemini_submit_dispatched_unverified",false,a,"submissionVerified")
    }
}
