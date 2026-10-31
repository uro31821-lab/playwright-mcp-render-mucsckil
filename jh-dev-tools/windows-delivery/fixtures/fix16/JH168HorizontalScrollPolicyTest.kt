package com.koreanlifehub.bridge

import org.junit.Assert.*
import org.junit.Test

class JH168HorizontalScrollPolicyTest {
    private val scope = AndroidScrollTargetPolicy.Scope(2161, "com.android.chrome",
        AndroidScrollTargetPolicy.Box(1233, 0, 2448, 1713))
    private fun node(path:List<Int>, box:AndroidScrollTargetPolicy.Box,
                     actions:Set<AndroidScrollTargetPolicy.ScrollAction> = emptySet(),
                     pkg:String="com.android.chrome") = AndroidScrollTargetPolicy.Node(
        path,AndroidScrollTargetPolicy.pathIdentity(2161,path),2161,pkg,box,
        "android.view.View","",true,true,false,actions.isNotEmpty(),actions)
    private val outer = node(listOf(1),scope.bounds,setOf(AndroidScrollTargetPolicy.ScrollAction.DOWN))
    private val container = node(listOf(1,2),AndroidScrollTargetPolicy.Box(1233,300,2400,1300))
    private val child = node(listOf(1,2,3),AndroidScrollTargetPolicy.Box(1300,400,2200,900),
        setOf(AndroidScrollTargetPolicy.ScrollAction.LEFT,AndroidScrollTargetPolicy.ScrollAction.RIGHT))
    private val nodes = listOf(outer,container,child)
    private fun proof(inner:List<JH168HorizontalScrollPolicy.Anchor>,outerX:Int=1400,
                      targetPath:List<Int> = child.path):JH168HorizontalScrollPolicy.VisualProof =
        JH168HorizontalScrollPolicy.VisualProof(2161,"com.android.chrome",0,targetPath,child.bounds,inner,
            listOf(JH168HorizontalScrollPolicy.Anchor("stationary-header",outerX,350)))
    private fun initial()=proof(listOf(
        JH168HorizontalScrollPolicy.Anchor("unique-first|path=1.2.3.0",1850,600),
        JH168HorizontalScrollPolicy.Anchor("unique-second|path=1.2.3.1",2020,660)))
    private fun after()=proof(listOf(
        JH168HorizontalScrollPolicy.Anchor("unique-first|path=1.2.3.0",1550,600),
        JH168HorizontalScrollPolicy.Anchor("unique-second|path=1.2.3.1",1720,660)))
    @Test fun selectsNativeChildOnly(){
        val offers=JH168HorizontalScrollPolicy.offers(scope,nodes,true)
        assertEquals(1,offers.size)
        assertEquals(AndroidScrollTargetPolicy.ScrollAction.RIGHT,offers[0].right)
        assertEquals(AndroidScrollTargetPolicy.ScrollAction.LEFT,offers[0].left)
    }
    @Test fun rightScrollRequiresTwoMatchedXMovingAnchors(){
        val result=JH168HorizontalScrollPolicy.verify(initial(),after(),true)
        assertTrue(result.verified)
        assertEquals(2,result.moved)
    }
    @Test fun leftScrollProofIsInverse(){assertTrue(JH168HorizontalScrollPolicy.verify(after(),initial(),false).verified)}
    @Test fun oppositeDirectionIsRejected(){assertFalse(JH168HorizontalScrollPolicy.verify(initial(),after(),false).verified)}
    @Test fun movingOuterPageIsRejected(){
        assertFalse(JH168HorizontalScrollPolicy.verify(initial(),proof(after().inside,outerX=1360),true).verified)
    }
    @Test fun movingYIsRejected(){
        val changed=proof(listOf(JH168HorizontalScrollPolicy.Anchor("unique-first|path=1.2.3.0",1550,560),
            JH168HorizontalScrollPolicy.Anchor("unique-second|path=1.2.3.1",1720,590)))
        assertFalse(JH168HorizontalScrollPolicy.verify(initial(),changed,true).verified)
    }
    @Test fun noParentFallbackAtRightEdge(){
        val edge=node(child.path,child.bounds,setOf(AndroidScrollTargetPolicy.ScrollAction.LEFT))
        val offers=JH168HorizontalScrollPolicy.offers(scope,listOf(outer,container,edge),true)
        assertEquals(1,offers.size)
        assertNull(JH168HorizontalScrollPolicy.exact(JH168HorizontalScrollPolicy.offers(scope,nodes,true).single(),
            scope,listOf(outer,container,edge),true,true))
    }
    @Test fun legacyForwardIsNeverHorizontal(){
        val legacy=node(child.path,child.bounds,setOf(AndroidScrollTargetPolicy.ScrollAction.FORWARD))
        assertTrue(JH168HorizontalScrollPolicy.offers(scope,listOf(outer,container,legacy),true).isEmpty())
    }
    @Test fun wrongWindowNeverOffered(){
        val other=node(child.path,child.bounds,child.actions,pkg="com.other.app")
        assertTrue(JH168HorizontalScrollPolicy.offers(scope,listOf(outer,container,other),true).isEmpty())
    }
    @Test fun incompleteTreeNeverOffered(){assertTrue(JH168HorizontalScrollPolicy.offers(scope,nodes,false).isEmpty())}
    @Test fun duplicateNodePathNeverOffered(){assertTrue(JH168HorizontalScrollPolicy.offers(scope,nodes+child,true).isEmpty())}
}
