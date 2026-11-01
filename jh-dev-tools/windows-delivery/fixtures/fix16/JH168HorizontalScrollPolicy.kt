package com.koreanlifehub.bridge

import kotlin.math.abs

/** FIX16 policy candidate, NOT wired to the installed Android agent.
 * Native ACTION_SCROLL_LEFT/RIGHT only, exact child selection and X-only readback.
 * No generic gesture, FORWARD/BACKWARD, parent fallback or automatic replay.
 */
internal object JH168HorizontalScrollPolicy {
    data class Offer(
        val node: AndroidScrollTargetPolicy.Node,
        val ancestorPath: List<Int>,
        val left: AndroidScrollTargetPolicy.ScrollAction?,
        val right: AndroidScrollTargetPolicy.ScrollAction?
    )
    data class Anchor(val digest: String, val x: Int, val y: Int)
    data class VisualProof(
        val windowId: Int, val packageName: String, val displayId: Int,
        val targetPath: List<Int>, val targetBox: AndroidScrollTargetPolicy.Box,
        val inside: List<Anchor>, val outside: List<Anchor>
    )
    data class Verdict(val verified: Boolean, val code: String, val moved: Int = 0, val outsideStill: Int = 0)

    private fun isAncestor(a: List<Int>, b: List<Int>): Boolean =
        a.size < b.size && b.take(a.size) == a

    /** Only explicit native horizontal actions; never infer them from FORWARD/BACKWARD. */
    private fun horizontalAction(n: AndroidScrollTargetPolicy.Node, right: Boolean): AndroidScrollTargetPolicy.ScrollAction? {
        val required = if (right) AndroidScrollTargetPolicy.ScrollAction.RIGHT else AndroidScrollTargetPolicy.ScrollAction.LEFT
        return required.takeIf { it in n.actions }
    }

    fun offers(
        scope: AndroidScrollTargetPolicy.Scope,
        nodes: List<AndroidScrollTargetPolicy.Node>,
        complete: Boolean
    ): List<Offer> {
        if (!complete || !scope.bounds.valid() || scope.packageName != "com.android.chrome" ||
            nodes.isEmpty() || nodes.size > AndroidScrollTargetPolicy.MAX_NODES ||
            nodes.any { it.path.size > AndroidScrollTargetPolicy.MAX_DEPTH || it.path.any { p -> p < 0 } || it.identity.isBlank() } ||
            nodes.map { it.path }.toSet().size != nodes.size ||
            nodes.map { it.identity }.toSet().size != nodes.size
        ) return emptyList()

        val eligible = nodes.filter { node ->
            val b = node.bounds
            node.windowId == scope.windowId && node.packageName == scope.packageName &&
                node.visible && node.enabled && !node.password &&
                scope.bounds.encloses(b) && b.right - b.left >= 85 && b.bottom - b.top >= 90 &&
                (horizontalAction(node, true) != null || horizontalAction(node, false) != null)
        }
        val matches = eligible.mapNotNull { node ->
            val parents = nodes.filter { p ->
                isAncestor(p.path, node.path) && p.windowId == node.windowId &&
                    p.packageName == node.packageName && p.visible && p.enabled && !p.password &&
                    p.bounds.encloses(node.bounds) && p.bounds != node.bounds
            }
            val b = node.bounds
            val w = scope.bounds
            val bounded = node.path.size >= 3 &&
                (w.right - w.left - (b.right - b.left) >= 80 ||
                    w.bottom - w.top - (b.bottom - b.top) >= 220)
            val pageLike = (b.right - b.left) * 100L >= (w.right - w.left) * 90L &&
                (b.bottom - b.top) * 100L >= (w.bottom - w.top) * 78L
            if (parents.isEmpty() || pageLike || !bounded) null
            else Offer(node, parents.maxByOrNull { it.path.size }!!.path,
                horizontalAction(node, false), horizontalAction(node, true))
        }
        // Do not silently choose by size or position when discovery is excessive.
        return if (matches.size in 1..24) matches.sortedWith(
            compareBy<Offer> { it.node.bounds.top }.thenBy { it.node.bounds.left }.thenBy { it.node.path.size }
        ) else emptyList()
    }

    /** Re-discover exact same child/path/ancestor and advertised action. */
    fun exact(
        original: Offer, scope: AndroidScrollTargetPolicy.Scope,
        nodes: List<AndroidScrollTargetPolicy.Node>, complete: Boolean,
        right: Boolean
    ): AndroidScrollTargetPolicy.ScrollAction? {
        val current = offers(scope, nodes, complete).singleOrNull {
            it.node == original.node && it.ancestorPath == original.ancestorPath
        } ?: return null
        return if (right) current.right else current.left
    }

    /** A rightward viewport scroll moves the *content* toward negative X.
     * The selected child must stay in the identical window/box and must move
     * two stable, path-identified leaf anchors coherently along X (>=20px).
     * Outside document anchors must remain stationary in BOTH axes.
     */
    fun verify(before: VisualProof?, after: VisualProof?, right: Boolean): Verdict {
        if (before == null || after == null) return Verdict(false, "horizontal_readback_missing")
        if (before.windowId != after.windowId || before.packageName != after.packageName ||
            before.displayId != after.displayId || before.targetPath != after.targetPath
        ) return Verdict(false, "horizontal_target_or_window_changed")
        if (before.targetBox != after.targetBox) return Verdict(false, "horizontal_target_box_moved")
        if (before.inside.size < 2 || after.inside.size < 2) return Verdict(false, "horizontal_inner_anchors_insufficient")

        val old = before.inside.groupBy { it.digest }.filterValues { it.size == 1 }
        val now = after.inside.groupBy { it.digest }.filterValues { it.size == 1 }
        val pairs = old.mapNotNull { (key, v) -> now[key]?.singleOrNull()?.let { v.single() to it } }
        val aligned = pairs.filter { abs(it.second.y - it.first.y) <= 5 }
        val moved = aligned.count { (a, b) -> if (right) b.x - a.x <= -20 else b.x - a.x >= 20 }
        val conflict = pairs.any { (a, b) ->
            abs(b.y - a.y) > 5 || (if (right) b.x - a.x >= 20 else b.x - a.x <= -20)
        }
        if (moved < 2 || conflict) return Verdict(false, "horizontal_inner_motion_unverified", moved)
        if (before.outside.isEmpty() || after.outside.isEmpty()) return Verdict(false, "horizontal_outer_anchors_insufficient", moved)
        val outsideBefore = before.outside.groupBy { it.digest }.filterValues { it.size == 1 }
        val outsideAfter = after.outside.groupBy { it.digest }.filterValues { it.size == 1 }
        val outsidePairs = outsideBefore.mapNotNull { (key, v) -> outsideAfter[key]?.singleOrNull()?.let { v.single() to it } }
        val stationary = outsidePairs.count { (a, b) -> abs(b.x - a.x) <= 5 && abs(b.y - a.y) <= 5 }
        val movedOutside = outsidePairs.any { (a, b) -> abs(b.x - a.x) > 5 || abs(b.y - a.y) > 5 }
        if (stationary < 1 || movedOutside) return Verdict(false, "horizontal_outer_document_moved_or_unproven", moved, stationary)
        return Verdict(true, "nested_horizontal_scroll_verified", moved, stationary)
    }
}
