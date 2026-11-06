package com.jh.pobiseo.assist;
import com.jh.pobiseo.assist.CameraCommandGate.*;
import java.util.function.UnaryOperator;
public final class CameraCommandGateTests {
    static int cases,assertions;
    static final String CMD="a".repeat(32),DEVICE="b".repeat(64),TASK="c".repeat(64);
    static Command good(){return new Command("job-1",CMD,"session-1",CameraCommandGate.JOB_TYPE,CameraCommandGate.TOOL,
        CameraMetadataRoute.ACTION,"READ_ONLY",CameraCommandGate.PACKAGE,DEVICE,TASK,120000);}
    static Live live(){return new Live(true,true,true,true,CMD,"session-1",DEVICE);}
    static void ok(boolean value){assertions++;if(!value)throw new AssertionError("assertion "+assertions);}
    static void test(String name,Runnable task){task.run();System.out.println("PASS gate "+(++cases)+": "+name);}
    static Decision check(Command c,Live l){return CameraCommandGate.check(c,l,"secure_verified",100000);}
    static Command replace(int field,String value){var c=good();String[] a={c.id(),c.commandId(),c.sessionId(),c.type(),c.tool(),c.action(),c.effect(),c.targetPackage(),c.deviceDigest(),c.taskDigest()};a[field]=value;return new Command(a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8],a[9],c.expiresAt());}
    public static void main(String[] args){
        test("current signed read-only camera request",()->ok(check(good(),live())==Decision.ALLOW_METADATA_ONLY));
        test("disabled host denies",()->ok(check(good(),new Live(false,true,true,true,CMD,"session-1",DEVICE))==Decision.DISABLED));
        test("missing live state denies",()->ok(check(good(),null)==Decision.DISABLED));
        test("legacy authentication cannot enter",()->ok(CameraCommandGate.check(good(),live(),"legacy_job",100000)==Decision.SIGNATURE_NOT_VERIFIED));
        test("null verified code denies",()->ok(CameraCommandGate.check(good(),live(),null,100000)==Decision.SIGNATURE_NOT_VERIFIED));
        test("null command denies",()->ok(check(null,live())==Decision.INVALID_REQUEST));
        test("empty job ID",()->ok(check(replace(0,""),live())==Decision.INVALID_REQUEST));
        test("oversized job ID",()->ok(check(replace(0,"x".repeat(129)),live())==Decision.INVALID_REQUEST));
        test("invalid command ID",()->ok(check(replace(1,"not-a-command"),live())==Decision.INVALID_REQUEST));
        test("missing session",()->ok(check(replace(2,null),live())==Decision.INVALID_REQUEST));
        test("ordinary snapshot is not a camera request",()->ok(check(replace(3,"agent_snapshot"),live())==Decision.SCOPE_MISMATCH));
        test("ordinary agent step is not a camera request",()->ok(check(replace(3,"agent_step"),live())==Decision.SCOPE_MISMATCH));
        test("other tool cannot inherit scope",()->ok(check(replace(4,"life_android_computer_inspect"),live())==Decision.SCOPE_MISMATCH));
        test("legacy action must not be silently rewritten",()->ok(check(replace(5,CameraMetadataRoute.LEGACY_ACTION),live())==Decision.SCOPE_MISMATCH));
        test("write effect rejected",()->ok(check(replace(6,"WRITE_REVERSIBLE"),live())==Decision.SCOPE_MISMATCH));
        test("missing effect rejected",()->ok(check(replace(6,null),live())==Decision.SCOPE_MISMATCH));
        test("different app rejected",()->ok(check(replace(7,"com.android.chrome"),live())==Decision.SCOPE_MISMATCH));
        test("package suffix spoof rejected",()->ok(check(replace(7,CameraCommandGate.PACKAGE+".fake"),live())==Decision.SCOPE_MISMATCH));
        test("invalid device digest",()->ok(check(replace(8,"bad"),live())==Decision.INVALID_REQUEST));
        test("invalid task digest",()->ok(check(replace(9,"bad"),live())==Decision.INVALID_REQUEST));
        test("disconnected",()->ok(check(good(),new Live(true,false,true,true,CMD,"session-1",DEVICE))==Decision.INACTIVE));
        test("device locked",()->ok(check(good(),new Live(true,true,false,true,CMD,"session-1",DEVICE))==Decision.INACTIVE));
        test("discarded generation",()->ok(check(good(),new Live(true,true,true,false,CMD,"session-1",DEVICE))==Decision.INACTIVE));
        test("new command invalidates old job",()->ok(check(good(),new Live(true,true,true,true,"d".repeat(32),"session-1",DEVICE))==Decision.SCOPE_MISMATCH));
        test("session rotation invalidates job",()->ok(check(good(),new Live(true,true,true,true,CMD,"session-2",DEVICE))==Decision.SCOPE_MISMATCH));
        test("device mismatch",()->ok(check(good(),new Live(true,true,true,true,CMD,"session-1","d".repeat(64)))==Decision.SCOPE_MISMATCH));
        test("signed expiry boundary",()->ok(CameraCommandGate.check(good(),live(),"secure_verified",120000)==Decision.EXPIRED));
        test("future expiry bounded",()->ok(CameraCommandGate.check(good(),live(),"secure_verified",59999)==Decision.EXPIRED));
        test("negative clock rejected",()->ok(CameraCommandGate.check(good(),live(),"secure_verified",-1)==Decision.EXPIRED));
        test("lease deadline is exclusive",()->{ok(CameraCommandGate.localLeaseLive(1000,2499));ok(!CameraCommandGate.localLeaseLive(1000,2500));});
        test("clock rollback cannot renew local lease",()->{ok(!CameraCommandGate.localLeaseLive(1000,999));ok(!CameraCommandGate.localLeaseLive(-1,0));});
        test("live revocation is not cached",()->{ok(check(good(),live())==Decision.ALLOW_METADATA_ONLY);ok(check(good(),new Live(true,true,true,false,CMD,"session-1",DEVICE))==Decision.INACTIVE);});
        System.out.println("CameraCommandGateTests: "+cases+" scenarios, "+assertions+" assertions; synthetic scope checks, not HMAC or phone tests.");
    }
}
