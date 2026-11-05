package com.koreanlifehub.bridge

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class JebiseoTextHandoffPolicyTest {
    private val binding=JebiseoTextHandoffPolicy.Binding("secure-session","a".repeat(32),"b".repeat(64))
    private fun request(phase:String=JebiseoTextHandoffPolicy.SELECT,previous:String="",id:String="1".repeat(32),
        text:String="이 유튜브 내용을 요약해 주세요."):JebiseoTextHandoffPolicy.Request {
        val seed=JebiseoTextHandoffPolicy.Request(JebiseoTextHandoffPolicy.SCHEMA,phase,"gemini-task-001",
            "c".repeat(64),"d".repeat(64),JebiseoTextHandoffPolicy.sha(text),"0".repeat(64),text,id,previous)
        return seed.copy(runDigest=JebiseoTextHandoffPolicy.runDigest(seed))
    }
    @Test fun sourceSelectionMustBeAnExactUniqueUtf16Range() {
        val prompt="요약해 줘 🙂";val source="앞말\n$prompt\n뒷말"
        val range=JebiseoTextHandoffPolicy.uniqueRange(source,prompt)!!
        assertEquals(3,range.start)
        assertTrue(JebiseoTextHandoffPolicy.selectionMatches(source,prompt,range.start,range.end))
        assertFalse(JebiseoTextHandoffPolicy.selectionMatches(source,prompt,range.start,range.end-1))
        assertFalse(JebiseoTextHandoffPolicy.selectionMatches(source,prompt,0,source.length))
        assertNull(JebiseoTextHandoffPolicy.uniqueRange("$prompt / $prompt",prompt))
        assertNull(JebiseoTextHandoffPolicy.uniqueRange("요약해줘 🙂",prompt))
    }
    @Test fun existingNativeTextLimitsAndDigestCannotBeBypassed() {
        assertNull(JebiseoTextHandoffPolicy.validate(request()))
        assertNotNull(JebiseoTextHandoffPolicy.validate(request(text="가".repeat(683))))
        assertNotNull(JebiseoTextHandoffPolicy.validate(request(text="a".repeat(1201))))
        assertNotNull(JebiseoTextHandoffPolicy.validate(request(text="hello\u202eunsafe")))
        val original=request()
        assertNotNull(JebiseoTextHandoffPolicy.validate(original.copy(preparedPrompt="다른 글")))
        assertNotNull(JebiseoTextHandoffPolicy.validate(original.copy(sourceDigest="e".repeat(64))))
        assertNotNull(JebiseoTextHandoffPolicy.validate(original.copy(threadDigest="e".repeat(64))))
    }
    @Test fun menuAndSubmitRequireActualOrderedPhoneReceipts() {
        val ledger=JebiseoTextHandoffPolicy.Ledger()
        val forged="jhr_"+"e".repeat(48)
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.MENU,forged),binding).ok)
        val select=request();assertTrue(ledger.reserve(select,binding).ok)
        val selection=ledger.complete(select,binding,true)!!
        assertTrue(selection.token.matches(Regex("jhr_[a-f0-9]{48}")))
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.SUBMIT,selection.token,"2".repeat(32)),binding).ok)
        val menu=request(JebiseoTextHandoffPolicy.MENU,selection.token,"2".repeat(32))
        assertTrue(ledger.reserve(menu,binding).ok)
        val draft=ledger.complete(menu,binding,true)!!
        assertNotEquals(selection.token,draft.token)
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.SUBMIT,selection.token,"3".repeat(32)),binding).ok)
        val submit=request(JebiseoTextHandoffPolicy.SUBMIT,draft.token,"3".repeat(32))
        assertTrue(ledger.reserve(submit,binding).ok)
        assertNull(ledger.complete(submit,binding,true))
        assertFalse(ledger.current(submit,binding))
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.SUBMIT,draft.token,"4".repeat(32)),binding).ok)
    }
    @Test fun sameRequestCanResumePendingButCannotMutateThePromptOrSession() {
        val ledger=JebiseoTextHandoffPolicy.Ledger()
        val r=request();assertTrue(ledger.reserve(r,binding).ok)
        assertTrue(ledger.reserve(r,binding).duplicate)
        assertFalse(ledger.reserve(request(text="다른 원문"),binding).ok)
        assertFalse(ledger.reserve(r,binding.copy(sessionId="other-session")).ok)
        assertFalse(ledger.reserve(r,binding.copy(commandId="f".repeat(32))).ok)
        assertFalse(ledger.reserve(r,binding.copy(deviceDigest="f".repeat(64))).ok)
        assertFalse(ledger.reserve(request(id="2".repeat(32)),binding).ok)
    }
    @Test fun uncertainDispatchIsTerminalAndDuplicatesAreReadOnly() {
        val ledger=JebiseoTextHandoffPolicy.Ledger()
        val r=request();assertTrue(ledger.reserve(r,binding).ok)
        assertNull(ledger.complete(r,binding,false))
        assertFalse(ledger.current(r,binding))
        assertTrue(ledger.reserve(r,binding).duplicate)
        assertFalse(ledger.reserve(request(id="2".repeat(32)),binding).ok)
    }
    @Test fun expiryAndCommandDiscardCannotRevivePhoneCapabilities() {
        var now=1000L;val ledger=JebiseoTextHandoffPolicy.Ledger(now={now})
        val first=request();assertTrue(ledger.reserve(first,binding).ok)
        val proof=ledger.complete(first,binding,true)!!
        now=proof.expiresAt+1
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.MENU,proof.token,"2".repeat(32)),binding).ok)
        ledger.clear()
        assertFalse(ledger.reserve(request(JebiseoTextHandoffPolicy.MENU,proof.token,"2".repeat(32)),binding).ok)
    }
    @Test fun localApprovalRemainsExactAndOneShot() {
        val approvals=AndroidComputerUseActionApproval()
        val action="a".repeat(64);val screen="b".repeat(64)
        val pending=approvals.request("gemini-task-001",action,GeminiNativeContract.HOST,42,
            "CLICK","CONSEQUENTIAL","REVERSIBLE_WRITE",screenDigest=screen)
        assertNull(approvals.checkExact(null,"gemini-task-001",GeminiNativeContract.HOST,42,action,screen).evidence)
        val grant=approvals.approveLocally(pending.requestToken!!,true).grantToken!!
        assertFalse(approvals.consumeExact(grant,"gemini-task-001",GeminiNativeContract.HOST,42,action,"c".repeat(64)).ok)
        assertTrue(approvals.consumeExact(grant,"gemini-task-001",GeminiNativeContract.HOST,42,action,screen).ok)
        assertFalse(approvals.consumeExact(grant,"gemini-task-001",GeminiNativeContract.HOST,42,action,screen).ok)
    }
    @Test fun clearDoesNotWaitForWorkerAndLateWritesStayInDiscardedState() {
        val slot=JebiseoTextHandoffPolicy.StateSlot{ConcurrentHashMap<String,String>()}
        val original=slot.capture()
        val started=CountDownLatch(1);val release=CountDownLatch(1);val done=CountDownLatch(1)
        val worker=Thread {
            synchronized(original){
                started.countDown()
                release.await(3,TimeUnit.SECONDS)
                original["late-result"]="old"
            }
            done.countDown()
        }
        worker.isDaemon=true;worker.start()
        assertTrue(started.await(1,TimeUnit.SECONDS))
        val cleared=CountDownLatch(1)
        val canceller=Thread{slot.clear();cleared.countDown()}.apply{isDaemon=true;start()}
        try {
            assertTrue("Cancellation must not await the execution monitor",cleared.await(1,TimeUnit.SECONDS))
            assertFalse(slot.current(original))
            slot.capture()["new-command"]="current"
        } finally { release.countDown() }
        assertTrue(done.await(1,TimeUnit.SECONDS))
        canceller.join(1000);worker.join(1000)
        assertNull(slot.capture()["late-result"])
        assertEquals("current",slot.capture()["new-command"])
    }
    @Test fun conversationBodyWithMenuWordsIsNeverAnAndroidSelectionToolbarItem() {
        assertTrue(JebiseoTextHandoffPolicy.toolbarItem("android:id/floating_toolbar_menu_item_text",
            "android.widget.TextView",true))
        assertFalse(JebiseoTextHandoffPolicy.toolbarItem("com.openai.chatgpt:id/message",
            "android.widget.TextView",true))
        assertFalse(JebiseoTextHandoffPolicy.toolbarItem("","android.widget.TextView",true))
        assertFalse(JebiseoTextHandoffPolicy.toolbarItem("android:id/floating_toolbar_menu_item_text",
            "android.widget.TextView",false))
        assertFalse(JebiseoTextHandoffPolicy.toolbarItem("android:id/floating_toolbar_menu_item_text",
            "android.webkit.WebView",true))
    }
}
