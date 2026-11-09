package com.jh.kabiseo.session;

import com.jh.kabiseo.session.CameraSettingsSession.*;
import java.util.EnumMap;
import java.util.Map;

/** Simulated observations only; NO actual driver/Android/phone/API authorization. */
public final class CameraSettingsSessionTests {
    static int scenarios,assertions;
    static void check(boolean b){assertions++;if(!b)throw new AssertionError("assertion "+assertions);}
    static void test(String n,Runnable f){f.run();scenarios++;System.out.println("PASS "+n);}
    static final Scope S=new Scope("opening-1","rear","unfolded-portrait",Backend.VERIFIED_HOST_UI);
    static final Map<Control,Support> SUPPORT=Map.of(Control.ZOOM_RATIO,new Support(1,3,true,true,true),
        Control.EXPOSURE_INDEX,new Support(-3,3,true,true,true),Control.TORCH,new Support(0,1,true,true,true));
    static final class Fixture {
        Scope scope=S;long sequence=1,now=1000;boolean open=true,settled=true;
        EnumMap<Control,Double> values=new EnumMap<>(Control.class);
        CameraSettingsSession session;
        Fixture(){this(S,SUPPORT);}
        Fixture(Scope scope,Map<Control,Support> supports){this.scope=scope;
            values.put(Control.ZOOM_RATIO,1.5);values.put(Control.EXPOSURE_INDEX,-1.0);values.put(Control.TORCH,1.0);
            session=new CameraSettingsSession(new Capabilities(scope,supports),view(),now);
        }
        View view(){return new View(scope,sequence,now,open,settled,values);}
        Plan propose(Control c,double v){return session.propose(c,v,view(),now).orElseThrow();}
        void accept(Plan p){values.put(p.control(),p.target());sequence++;now++;check(session.complete(p,true,view(),now));}
        void apply(Control c,double v){accept(propose(c,v));}
        void restore(){for(int i=0;i<4;i++){var p=session.nextRestore(view(),now);if(p.isEmpty())break;accept(p.get());}}
    }
    public static void main(String[] args){
        test("restore original 1.5x and -1 exposure index, NOT defaults 1x/0",()->{
            var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.apply(Control.EXPOSURE_INDEX,1);f.apply(Control.TORCH,0);
            check(!f.session.restorationVerified());f.restore();check(f.session.restorationVerified());
            check(f.values.get(Control.ZOOM_RATIO)==1.5);check(f.values.get(Control.EXPOSURE_INDEX)==-1);check(f.values.get(Control.TORCH)==1);
        });
        test("device zoom range clamps visibly and EV is an index",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,10);check(p.target()==3&&p.clamped());f.accept(p);
            check(f.session.propose(Control.EXPOSURE_INDEX,0.5,f.view(),f.now).isEmpty());
            check(f.session.propose(Control.TORCH,2,f.view(),f.now).isEmpty());
            f.restore();check(f.session.restorationVerified());
        });
        test("repeated adjustments keep the first snapshot",()->{
            var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.apply(Control.ZOOM_RATIO,2.5);f.restore();check(f.values.get(Control.ZOOM_RATIO)==1.5);
        });
        test("read-only and unsupported or nonrestorable controls never propose a write",()->{
            var f=new Fixture(new Scope("o","c","l",Backend.READ_ONLY),SUPPORT);
            check(f.session.propose(Control.ZOOM_RATIO,2,f.view(),f.now).isEmpty());
            var missing=new Fixture(S,Map.of());check(missing.session.propose(Control.ZOOM_RATIO,2,missing.view(),missing.now).isEmpty());
            var partial=new Fixture(S,Map.of(Control.ZOOM_RATIO,new Support(1,3,true,true,false)));
            check(partial.session.propose(Control.ZOOM_RATIO,2,partial.view(),partial.now).isEmpty());
        });
        test("one outstanding proposal, no implicit resend or foreign completion",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,2);var foreign=new Fixture().propose(Control.ZOOM_RATIO,2);
            check(f.session.propose(Control.ZOOM_RATIO,2,f.view(),f.now).isEmpty());
            check(f.session.nextRestore(f.view(),f.now).isEmpty());check(!f.session.complete(foreign,true,f.view(),f.now));
            check(!p.grantsDevicePermission());f.accept(p);check(!f.session.complete(p,true,f.view(),f.now));
        });
        test("uncertain result halts, does not replay or claim restoration",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,2);check(!f.session.complete(p,false,f.view(),f.now));
            check(f.session.state()==State.NEEDS_RECONCILIATION);check(f.session.nextRestore(f.view(),f.now).isEmpty());check(!f.session.restorationVerified());
        });
        test("optimistic ZoomState is insufficient before a settled completion",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,2);f.values.put(Control.ZOOM_RATIO,2.0);f.sequence++;f.settled=false;
            check(!f.session.complete(p,true,f.view(),f.now));check(f.session.state()==State.NEEDS_RECONCILIATION);
        });
        test("manual user change is not overwritten by a restore",()->{
            var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.values.put(Control.ZOOM_RATIO,2.5);f.sequence++;
            check(f.session.nextRestore(f.view(),f.now).isEmpty());check(f.session.state()==State.CONFLICT);check(!f.session.restorationVerified());
        });
        test("new camera opening, lens or fold layout invalidates old plan",()->{
            for(Scope other:new Scope[]{new Scope("opening-2","rear","unfolded-portrait",Backend.VERIFIED_HOST_UI),
                new Scope("opening-1","front","unfolded-portrait",Backend.VERIFIED_HOST_UI),
                new Scope("opening-1","rear","folded",Backend.VERIFIED_HOST_UI)}){
                var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.scope=other;
                check(f.session.nextRestore(f.view(),f.now).isEmpty());check(f.session.state()==State.INVALIDATED);
            }
        });
        test("closing camera is not proof of original value restoration",()->{
            var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.open=false;
            check(f.session.nextRestore(f.view(),f.now).isEmpty());check(!f.session.restorationVerified());
        });
        test("stale observation and clock rollback invalidate without execution",()->{
            var f=new Fixture();check(f.session.propose(Control.ZOOM_RATIO,2,f.view(),1751).isEmpty());check(f.session.state()==State.INVALIDATED);
            var g=new Fixture();check(g.session.propose(Control.ZOOM_RATIO,2,g.view(),999).isEmpty());check(g.session.state()==State.INVALIDATED);
        });
        test("late callback after cancellation is ignored",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,2);f.session.invalidate();
            check(!f.session.complete(p,true,f.view(),f.now));check(f.session.state()==State.INVALIDATED);
        });
        test("restore is complete only after every applied setting is acknowledged",()->{
            var f=new Fixture();f.apply(Control.ZOOM_RATIO,2);f.apply(Control.EXPOSURE_INDEX,2);
            var first=f.session.nextRestore(f.view(),f.now).orElseThrow();check(first.control()==Control.EXPOSURE_INDEX);f.accept(first);
            check(!f.session.restorationVerified());var second=f.session.nextRestore(f.view(),f.now).orElseThrow();f.accept(second);
            check(!f.session.restorationVerified());check(f.session.nextRestore(f.view(),f.now).isEmpty());check(f.session.restorationVerified());
        });
        test("inconsistent completion is not marked applied",()->{
            var f=new Fixture();var p=f.propose(Control.ZOOM_RATIO,2);f.sequence++;
            check(!f.session.complete(p,true,f.view(),f.now));check(f.session.state()==State.NEEDS_RECONCILIATION);
        });
        System.out.println("SESSION_RESULT={\"scenarios\":"+scenarios+",\"assertions\":"+assertions+",\"deviceActions\":0,\"scope\":\"SIMULATED_SETTING_PLANS_ONLY\"}");
    }
}
