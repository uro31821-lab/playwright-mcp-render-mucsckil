import com.jh.kabiseo.capture.AutoShutterGate;

public final class AutoShutterGateTests {
    private static int checked;
    private static final AutoShutterGate.Guide GUIDE=
        new AutoShutterGate.Guide(.10f,.10f,.90f,.90f);
    private static void ok(boolean b,String name){
        if(!b)throw new AssertionError(name);checked++;
        System.out.println("PASS "+name);
    }
    private static AutoShutterGate.Frame sample(long t){
        return sample(t,.30f,.30f,.70f,.70f,true,true,true,true,true);
    }
    private static AutoShutterGate.Frame sample(long t,float l,float top,float r,float b,
        boolean detected,boolean focus,boolean still,boolean ready,boolean visible){
        return new AutoShutterGate.Frame(t,l,top,r,b,detected,focus,still,ready,visible);
    }
    private static boolean hold(AutoShutterGate g,String id,long t){
        return g.observe(id,sample(t),GUIDE);
    }
    public static void main(String[] unused){
        AutoShutterGate gate=new AutoShutterGate();
        ok(gate.mode()==AutoShutterGate.Mode.MANUAL,"default manual");
        ok(!gate.armed(),"not armed on launch");
        ok(!hold(gate,"A",1000),"no remote/implicit auto");
        gate.selectAuto("A");
        ok(gate.armed(),"explicit auto is armed");
        ok(!hold(gate,"B",1000),"other session denied");
        ok(!hold(gate,"A",1000),"first frame insufficient");
        ok(!hold(gate,"A",1250),"second frame insufficient");
        ok(!hold(gate,"A",1500),"third frame insufficient");
        ok(!hold(gate,"A",1750),"hold less than one second");
        ok(hold(gate,"A",2000),"one shot after stable hold");
        ok(!hold(gate,"A",2250),"duplicate denied");
        ok(!gate.armed(),"auto disarmed immediately after shot");
        gate.selectAuto("B");
        ok(!hold(gate,"A",1000),"session rollover invalidates stale session");
        gate.selectManual();
        ok(!hold(gate,"B",1250),"manual cancels auto");

        gate.selectAuto("C");
        ok(!gate.observe("C",sample(1000,.30f,.30f,.70f,.70f,false,true,true,true,true),GUIDE),
            "no detector means no capture");
        ok(!gate.observe("C",sample(1250,.30f,.30f,.70f,.70f,true,false,true,true,true),GUIDE),
            "unconfirmed AF blocks");
        ok(!gate.observe("C",sample(1500,.30f,.30f,.70f,.70f,true,true,false,true,true),GUIDE),
            "moving hand blocks");
        ok(!gate.observe("C",sample(1750,.30f,.30f,.70f,.70f,true,true,true,false,true),GUIDE),
            "unbound camera blocks");
        ok(!gate.observe("C",sample(2000,.30f,.30f,.70f,.70f,true,true,true,true,false),GUIDE),
            "background app blocks");
        ok(!gate.observe("C",sample(2250,.01f,.30f,.55f,.70f,true,true,true,true,true),GUIDE),
            "edge outside dotted guide blocks");
        ok(!gate.observe("C",sample(2500,.30f,.30f,.70f,.70f,true,true,true,true,true),
            new AutoShutterGate.Guide(.4f,.4f,.6f,.6f)),"invalid tiny guide blocks");
        ok(!hold(gate,"C",2750),"all failed preconditions reset hold");
        ok(!hold(gate,"C",3000),"new hold starts fresh");
        ok(!gate.observe("C",sample(3250,.4f,.3f,.8f,.7f,true,true,true,true,true),GUIDE),
            "subject movement resets stability");
        ok(!hold(gate,"C",3500),"movement reset cannot fire");

        gate.selectAuto("D");
        ok(!hold(gate,"D",1000),"start D");
        ok(!hold(gate,"D",1250),"D sample 2");
        ok(!hold(gate,"D",2000),"late frame resets countdown");
        ok(!hold(gate,"D",2250),"late frame not enough");
        ok(!hold(gate,"D",2000),"clock rollback resets countdown");
        ok(!hold(gate,"D",2250),"rollback not enough");
        gate.onCameraRebind();
        ok(!hold(gate,"D",2500),"camera rebind resets countdown");
        gate.onBackground();
        ok(!hold(gate,"D",2750),"background disarms");
        ok(gate.mode()==AutoShutterGate.Mode.MANUAL,"background returns to manual");
        gate.selectAuto("E");
        ok(!gate.observe("E",sample(1000,Float.NaN,.3f,.7f,.7f,true,true,true,true,true),GUIDE),
            "NaN bbox rejected");
        ok(!gate.observe("E",sample(1250,.3f,.3f,.3f,.7f,true,true,true,true,true),GUIDE),
            "empty bbox rejected");
        ok(!gate.observe("E",sample(1500,.3f,.3f,.7f,.7f,true,true,true,true,true),
            new AutoShutterGate.Guide(Float.NaN,0,1,1)),"NaN guide rejected");
        ok(!hold(gate,"E",1750),"after invalid inputs first sample");
        ok(!hold(gate,"E",2000),"after invalid inputs second sample");
        ok(!hold(gate,"E",2250),"after invalid inputs third sample");
        ok(!hold(gate,"E",2500),"after invalid inputs still under one second");
        ok(hold(gate,"E",2750),"valid signal eventually captures");
        ok(!hold(gate,"E",3000),"no sequential auto capture");
        boolean throwsInvalid=false;
        try{gate.selectAuto("");}catch(IllegalArgumentException expected){throwsInvalid=true;}
        ok(throwsInvalid,"blank local session forbidden");
        ok(checked>=40,"minimum regression coverage");
        System.out.println("AUTO_SHUTTER_GATE_PASS="+checked);
        System.out.println("PHYSICAL_CAMERA_E2E=NOT_RUN; MODEL_ADAPTER=NOT_CONNECTED; APK_INSTALL=0");
    }
}
