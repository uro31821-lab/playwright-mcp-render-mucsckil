package com.koreanlifehub.bridge

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Build
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo as Node
import android.view.accessibility.AccessibilityWindowInfo
import java.security.SecureRandom
import java.util.ArrayDeque

/** FIX16 Chrome-only horizontal child scroll through the original signed FormTransport.
 * Does NOT alter the FIX15 vertical runtime, Secure56, or permission prompts.
 * ONE native ACTION_SCROLL_LEFT/RIGHT for ONE exact child, no fallback or replay.
 */
internal object JH168RightHorizontalScrollRuntime {
    data class Outcome(val ok:Boolean,val code:String,val dispatched:Boolean=false,
                       val resultVerified:Boolean=false,val displayId:Int?=null,
                       val workWindowId:Int?=null,val matched:Int=0)
    data class InternalOffer(val id:String,val relativeBounds:String,val safeViewId:String,
                             val left:Boolean,val right:Boolean)
    data class Discovery(val ok:Boolean,val code:String,val targets:List<InternalOffer> = emptyList())
    private data class WindowPair(val displayId:Int,val work:AccessibilityWindowInfo,
                                  val scope:AgentFocusPolicy.Scope)
    private data class Tree(val entries:List<Pair<Node,AndroidScrollTargetPolicy.Node>>,val complete:Boolean,
                            val failureCode:String="")
    private data class ReservedTarget(val createdAt:Long,val pair:WindowPair,
                                      val offer:JH168HorizontalScrollPolicy.Offer,
                                      val signature:String)
    private val secureRandom=SecureRandom()
    private val reservations=linkedMapOf<String,ReservedTarget>()
    private fun deny(code:String)=Outcome(false,code)
    private fun box(r:Rect)=AndroidScrollTargetPolicy.Box(r.left,r.top,r.right,r.bottom)
    private fun rect(n:Node)=Rect().also { n.getBoundsInScreen(it) }
    private fun currentPair(s:AccessibilityService,original:AgentFocusPolicy.Scope):WindowPair? {
        return try {
        if(Build.VERSION.SDK_INT<30 || original.work.pkg!=PanePolicy.CHROME ||
           original.chat?.pkg!=PanePolicy.CHAT || original.chat.box.right>original.work.box.left)
            return null
        val fresh=AndroidAgent.formScope(s) ?: return null
        if(!AgentFocusPolicy.same(original,fresh))return null
        val chat=fresh.chat ?: return null
        val all=s.windows
        val workW=all.singleOrNull{it.id==fresh.work.id && it.type==AccessibilityWindowInfo.TYPE_APPLICATION}
            ?: return null
        val chatW=all.singleOrNull{it.id==chat.id && it.type==AccessibilityWindowInfo.TYPE_APPLICATION}
            ?: return null
        val wr=Rect();workW.getBoundsInScreen(wr)
        val cr=Rect();chatW.getBoundsInScreen(cr)
        val wpkg=workW.root?.packageName?.toString().orEmpty()
        val cpkg=chatW.root?.packageName?.toString().orEmpty()
        val proof=JH168RightVerticalPolicy.PairProof(cpkg,wpkg,chatW.id,workW.id,
            chatW.displayId,workW.displayId,box(cr),box(wr))
        if(!JH168RightVerticalPolicy.pairValid(proof) ||
            box(wr)!=JH168RightVerticalPolicy.boxOf(fresh.work.box) ||
            box(cr)!=JH168RightVerticalPolicy.boxOf(chat.box))return null
        WindowPair(workW.displayId,workW,fresh)
        }catch(_:Exception){null}
    }

    private fun actionSet(n:Node):Set<AndroidScrollTargetPolicy.ScrollAction> = n.actionList.mapNotNull { a -> when(a.id) {
        Node.AccessibilityAction.ACTION_SCROLL_DOWN.id -> AndroidScrollTargetPolicy.ScrollAction.DOWN
        Node.AccessibilityAction.ACTION_SCROLL_UP.id -> AndroidScrollTargetPolicy.ScrollAction.UP
        Node.AccessibilityAction.ACTION_SCROLL_LEFT.id -> AndroidScrollTargetPolicy.ScrollAction.LEFT
        Node.AccessibilityAction.ACTION_SCROLL_RIGHT.id -> AndroidScrollTargetPolicy.ScrollAction.RIGHT
        Node.ACTION_SCROLL_FORWARD -> AndroidScrollTargetPolicy.ScrollAction.FORWARD
        Node.ACTION_SCROLL_BACKWARD -> AndroidScrollTargetPolicy.ScrollAction.BACKWARD
        else -> null
    }}.toSet()
    // FIX13: diagnostics ONLY. Never accept an incomplete accessibility tree.
    // Fixed reason codes, no node text/IDs/paths/account information in the response.
    private fun tree(p:WindowPair):Tree {
        val entries=mutableListOf<Pair<Node,AndroidScrollTargetPolicy.Node>>()
        val rt=p.work.root ?: return Tree(entries,false,"root_unavailable")
        val q=ArrayDeque<Pair<Node,List<Int>>>()
        q.add(rt to emptyList())
        return try {
            while(q.isNotEmpty()) {
                if(entries.size>=AndroidScrollTargetPolicy.MAX_NODES)
                    return Tree(entries,false,"node_limit")
                val (n,path)=q.removeFirst()
                if(path.size>AndroidScrollTargetPolicy.MAX_DEPTH)
                    return Tree(entries,false,"depth_limit")
                // FIX14: Chrome dialog pages can expose >100 native children in one node.
                // Iterate them in bounded groups, without raising the whole-tree node or depth caps.
                // Reject before enumeration if the entire pending queue cannot fit the 2500-node budget.
                val children=n.childCount
                if(children<0) return Tree(entries,false,"native_child_count_invalid")
                if(children>AndroidScrollTargetPolicy.MAX_NODES)
                    return Tree(entries,false,"child_fanout_exceeds_global_budget")
                if(entries.size.toLong()+q.size.toLong()+children.toLong()+1L >
                    AndroidScrollTargetPolicy.MAX_NODES.toLong())
                    return Tree(entries,false,"pending_node_limit")
                val r=rect(n)
                val model=AndroidScrollTargetPolicy.Node(path,
                    AndroidScrollTargetPolicy.pathIdentity(n.windowId,path),n.windowId,
                    n.packageName?.toString().orEmpty(),box(r),
                    n.className?.toString().orEmpty(),n.viewIdResourceName.orEmpty(),
                    n.isVisibleToUser,n.isEnabled,n.isPassword,n.isScrollable,actionSet(n))
                entries.add(n to model)
                // Keep each enumeration batch <=100 and preserve the original child index path.
                // A missing/changed native child fails closed; no incomplete tree can authorize scroll.
                var offset=0
                while(offset<children){
                    val end=minOf(offset+100,children)
                    for(i in offset until end){
                        val child=n.getChild(i) ?: return Tree(entries,false,"child_unavailable")
                        q.add(child to (path+i))
                    }
                    offset=end
                }
            }
            Tree(entries,true)
        }catch(_:Exception){Tree(entries,false,"native_tree_exception")}
    }

    private fun fixedScope(p:WindowPair)=AndroidScrollTargetPolicy.Scope(p.scope.work.id,
        p.scope.work.pkg,JH168RightVerticalPolicy.boxOf(p.scope.work.box))

    private fun sceneSignature(p:WindowPair,offer:JH168HorizontalScrollPolicy.Offer):String {
        val v=offer.node
        return FormPolicy.hash(listOf("JH168_HORIZONTAL_V1",p.scope.work.pkg,
            p.scope.work.id,p.displayId,p.scope.work.box,p.scope.chat?.id,p.scope.chat?.box,
            v.path.joinToString("/"),v.identity,v.bounds,v.className,v.viewId,
            v.scrollable,v.actions.map{it.name}.sorted().joinToString(","),
            offer.ancestorPath.joinToString("/"),offer.left,offer.right).joinToString("|"))
    }
    private fun newToken():String {
        val random=ByteArray(12);secureRandom.nextBytes(random)
        return "sc_"+random.joinToString(""){(it.toInt() and 255).toString(16).padStart(2,'0')}
    }

    /** Discover only exact nested Chrome children with explicit horizontal actions.
     * The token is bound to the verified split panes, Android child path and 45s TTL.
     */
    @Synchronized fun discoverInternal(s:AccessibilityService):Discovery {
        reservations.clear()
        if(s is BridgeService && !s.workExecutionAllowed())return Discovery(false,"site_switch_discarded")
        if(SensitiveGuard.paused(s))return Discovery(false,"secure_local_required")
        val scope=AndroidAgent.formScope(s) ?: return Discovery(false,"work_window_unavailable")
        val p=currentPair(s,scope) ?: return Discovery(false,"right_chrome_window_display_unverified")
        val t=tree(p)
        if(!t.complete)return Discovery(false,"horizontal_scroll_tree_incomplete_"+t.failureCode.ifEmpty { "unknown" })
        val offers=JH168HorizontalScrollPolicy.offers(fixedScope(p),t.entries.map{it.second},true)
        if(offers.isEmpty())return Discovery(false,"horizontal_scroll_targets_not_proven")
        val time=System.currentTimeMillis()
        val scoped=fixedScope(p).bounds
        val items=offers.map { offer ->
            val token=newToken()
            reservations[token]=ReservedTarget(time,p,offer,sceneSignature(p,offer))
            val b=offer.node.bounds
            val rel="${b.left-scoped.left},${b.top-scoped.top},${b.right-scoped.left},${b.bottom-scoped.top}"
            val safe=offer.node.viewId.take(72).takeIf{it.matches(Regex("[a-zA-Z0-9_./:-]*"))}.orEmpty()
            InternalOffer(token,rel,safe,offer.left!=null,offer.right!=null)
        }
        return Discovery(true,"horizontal_scroll_targets_ready",items)
    }

    /** Data never leaves the device: hash of inner (node path + label/class/viewId)
     * plus X/Y, and hash of outside document sibling + X/Y. Never use Chrome toolbar.
     * Do not use rectangles to invent ancestor relationships.
     */
    private fun readback(p:WindowPair,selected:AndroidScrollTargetPolicy.Node,
                         postScroll:Boolean=false):JH168HorizontalScrollPolicy.VisualProof? {
        val t=tree(p)
        if(!t.complete)return null
        val live=t.entries.singleOrNull{it.second.path==selected.path}?.second ?: return null
        if(live.windowId!=selected.windowId||live.packageName!=selected.packageName||
            live.bounds!=selected.bounds||live.viewId!=selected.viewId||
            live.className!=selected.className)return null
        val inside=mutableListOf<JH168HorizontalScrollPolicy.Anchor>()
        val outside=mutableListOf<JH168HorizontalScrollPolicy.Anchor>()
        val b=selected.bounds
        val top=p.scope.work.box.top+240
        for((node,desc) in t.entries){
            if(!node.isVisibleToUser||!node.isEnabled||node.isPassword||node.isEditable||
                node.childCount!=0||desc.windowId!=p.scope.work.id||
                desc.packageName!=PanePolicy.CHROME)continue
            val label=node.text?.toString()?.trim().orEmpty()
            if(label.length !in 4..250 || FormPolicy.sensitive(label,false,node.inputType))continue
            val r=rect(node)
            if(r.width()<10||r.height()<9||r.top<top||
                !fixedScope(p).bounds.encloses(box(r)))continue
            val descendant=desc.path.size>selected.path.size&&
                desc.path.take(selected.path.size)==selected.path
            val nodePath=if(descendant)"|nodePath="+desc.path.joinToString(".") else ""
            val key=FormPolicy.hash(node.viewIdResourceName.orEmpty()+"|"+
                node.className?.toString().orEmpty()+"|"+label+nodePath)
            val anchor=JH168HorizontalScrollPolicy.Anchor(key,r.left,r.top)
            val centerX=(r.left+r.right)/2
            val centerY=(r.top+r.bottom)/2
            val inBox=b.contains(centerX,centerY)
            val near=postScroll && r.bottom>=b.top && r.top<=b.bottom &&
                r.right>=b.left-(b.right-b.left) && r.left<=b.right+(b.right-b.left)
            if(descendant && (inBox||near))inside.add(anchor)
            else if(!descendant && !(desc.path.size<=selected.path.size &&
                selected.path.take(desc.path.size)==desc.path) && !inBox)
                outside.add(anchor)
        }
        return JH168HorizontalScrollPolicy.VisualProof(p.scope.work.id,p.scope.work.pkg,
            p.displayId,selected.path,selected.bounds,inside,outside)
    }

    /** Exactly ONE ACTION_SCROLL_LEFT/RIGHT, using one consumed single-use sc_ token.
     * Never automatically replay after any uncertain result; no parent fallback.
     */
    @Synchronized fun scrollInternal(s:AccessibilityService,direction:String,
                                      scope:AgentFocusPolicy.Scope,targetId:String):Outcome {
        val reservation=reservations.remove(targetId) ?:
            return deny("horizontal_target_unbound_or_consumed_rescan")
        reservations.clear()
        if(direction!="left"&&direction!="right")return deny("invalid_horizontal_direction")
        if(s is BridgeService && !s.workExecutionAllowed())return deny("site_switch_discarded")
        if(SensitiveGuard.paused(s))return deny("secure_local_required")
        if(Looper.myLooper()==Looper.getMainLooper())return deny("scroll_requires_worker")
        if(System.currentTimeMillis()-reservation.createdAt !in 0..45_000)
            return deny("horizontal_target_expired_rescan")
        val firstPair=currentPair(s,scope) ?: return deny("right_chrome_window_display_unverified")
        if(!AgentFocusPolicy.same(reservation.pair.scope,firstPair.scope)||
            reservation.pair.displayId!=firstPair.displayId)
            return deny("horizontal_window_layout_changed_rescan")
        val t=tree(firstPair)
        if(!t.complete)return deny("horizontal_scroll_tree_incomplete_"+t.failureCode.ifEmpty { "unknown" })
        val offers=JH168HorizontalScrollPolicy.offers(fixedScope(firstPair),t.entries.map{it.second},true)
        val offer=offers.singleOrNull{it.node==reservation.offer.node &&
            it.ancestorPath==reservation.offer.ancestorPath} ?:
            return deny("horizontal_target_changed_no_parent_fallback")
        if(sceneSignature(firstPair,offer)!=reservation.signature)
            return deny("horizontal_target_changed_no_parent_fallback")
        val right=direction=="right"
        val expectedAction=JH168HorizontalScrollPolicy.exact(offer,fixedScope(firstPair),
            t.entries.map{it.second},true,right) ?: return deny("horizontal_direction_not_advertised")
        val before=readback(firstPair,offer.node) ?: return deny("horizontal_readback_before_unavailable")
        if(before.inside.size<2||before.outside.isEmpty())
            return deny("horizontal_readback_before_insufficient")
        // No looser evidence than original pre-dispatch safety gate.
        val verificationBefore=readback(firstPair,offer.node,true)
            ?:return deny("horizontal_verification_before_unavailable")
        if(verificationBefore.windowId!=before.windowId||
            verificationBefore.packageName!=before.packageName||
            verificationBefore.displayId!=before.displayId||
            verificationBefore.targetPath!=before.targetPath||
            verificationBefore.targetBox!=before.targetBox)
            return deny("horizontal_verification_before_changed")
        // Fresh native tree/target/action attestation just before dispatch.
        val freshPair=currentPair(s,scope) ?: return deny("horizontal_window_changed_before_dispatch")
        if(freshPair.displayId!=firstPair.displayId||
            !AgentFocusPolicy.same(firstPair.scope,freshPair.scope))
            return deny("horizontal_window_changed_before_dispatch")
        val freshTree=tree(freshPair)
        if(!freshTree.complete)return deny("horizontal_tree_incomplete_before_dispatch")
        val freshOffer=JH168HorizontalScrollPolicy.offers(fixedScope(freshPair),freshTree.entries.map{it.second},true)
            .singleOrNull{it.node==offer.node&&it.ancestorPath==offer.ancestorPath}
            ?:return deny("horizontal_exact_target_changed_before_dispatch")
        if(sceneSignature(freshPair,freshOffer)!=reservation.signature||
            JH168HorizontalScrollPolicy.exact(freshOffer,fixedScope(freshPair),
                freshTree.entries.map{it.second},true,right)!=expectedAction)
            return deny("horizontal_exact_target_changed_before_dispatch")
        val node=freshTree.entries.singleOrNull{it.second==freshOffer.node}?.first
            ?:return deny("horizontal_exact_native_node_missing")
        val action=when(expectedAction){
            AndroidScrollTargetPolicy.ScrollAction.RIGHT -> Node.AccessibilityAction.ACTION_SCROLL_RIGHT.id
            AndroidScrollTargetPolicy.ScrollAction.LEFT -> Node.AccessibilityAction.ACTION_SCROLL_LEFT.id
            else -> return deny("horizontal_semantic_action_missing_no_gesture")
        }
        if(!node.actionList.any{it.id==action})return deny("horizontal_native_action_changed")
        if(s is BridgeService && !s.workExecutionAllowed())return deny("site_switch_discarded")
        // No ACTION_SCROLL_FORWARD/BACKWARD, no coordinate gesture, no parent fallback.
        val accepted=try{node.performAction(action)}catch(_:Exception){false}
        if(!accepted)return Outcome(false,"horizontal_action_not_confirmed_no_parent_fallback",true,false,
            firstPair.displayId,firstPair.scope.work.id)
        var lastReason="horizontal_readback_missing"
        for(delay in listOf(180L,340L)){
            try{Thread.sleep(delay)}catch(_:InterruptedException){Thread.currentThread().interrupt();break}
            val afterPair=currentPair(s,scope) ?:
                return Outcome(false,"horizontal_window_changed_after_dispatch",true,false,
                    firstPair.displayId,scope.work.id)
            val after=readback(afterPair,offer.node,true)
            val verdict=JH168HorizontalScrollPolicy.verify(verificationBefore,after,right)
            if(verdict.verified)return Outcome(true,verdict.code,true,true,afterPair.displayId,
                afterPair.scope.work.id,verdict.moved)
            lastReason=verdict.code
        }
        return Outcome(true,"horizontal_dispatched_unverified_no_replay_"+lastReason,true,false,
            firstPair.displayId,scope.work.id)
    }
}
