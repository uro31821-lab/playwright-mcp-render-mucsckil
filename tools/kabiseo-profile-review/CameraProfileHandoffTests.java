package com.jh.pobiseo.assist.review;

import com.jh.pobiseo.assist.CameraSurfacePolicy;
import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import com.jh.pobiseo.assist.review.CameraProfileReview.*;
import com.jh.pobiseo.assist.review.CameraProfileHandoff.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Synthetic trusted-host responses ONLY. No physical capture, consent, installed app or device. */
public final class CameraProfileHandoffTests {
    private static int scenarios,assertions;
    private static final String PKG="fixture.camera",P=PKG+":id/preview",A=PKG+":id/shutter",B=PKG+":id/close",C=PKG+":id/chat",R=PKG+":id/review";
    private static final Identity ID=new Identity(PKG,1,"a".repeat(64),"b".repeat(64));
    private static final Bounds WINDOW=new Bounds(0,0,1000,1800);
    private static final Scope SCOPE=new Scope("enrollment1","cmd1","c".repeat(64),ID,1000,10000);
    private static Node node(String id,Bounds box){return new Node(id,box,true,true,false,false);}
    private static List<Node> camera(){return List.of(node(P,new Bounds(0,0,1000,1500)),node(A,new Bounds(400,1550,600,1700)),node(B,new Bounds(30,1550,120,1650)));}
    private static Sample sample(Screen type,String capture,String opening,List<Node> nodes){return new Sample(type,capture,opening,ID,WINDOW,nodes,true,true,true,true);}
    private static List<Sample> samples(){return List.of(sample(Screen.CAMERA,"c1","o1",camera()),sample(Screen.CAMERA,"c2","o2",camera()),sample(Screen.CHAT,"c3","chat",List.of(node(C,WINDOW))),sample(Screen.PHOTO_REVIEW,"c4","review",List.of(node(R,WINDOW))));}
    private static final class Fixture {
        long now=1100;Scope active=SCOPE;boolean collection=true,verified=true,still=true;
        int verifies,consumes;String approvalDigest;Runnable duringCapture=()->{},duringConsume=()->{},duringStill=()->{};
        final CameraProfileHandoff controller=new CameraProfileHandoff(SCOPE,new Host(){
            @Override public Scope currentScope(){return active;}
            @Override public boolean collectionApproved(Scope s){return collection;}
            @Override public boolean verifyCapture(Scope s,Captured c){verifies++;duringCapture.run();return verified;}
            @Override public boolean consumeLocalApproval(Scope s,ApprovalRequest r){consumes++;duringConsume.run();return r.evidenceDigest().equals(approvalDigest);}
            @Override public boolean enrollmentStillApproved(Scope s,String digest){duringStill.run();return still&&digest.equals(approvalDigest);}
        },()->now);
        Receipt add(Sample sample){return controller.accept(new Captured(sample,now));}
        void fill(){for(Sample s:samples())check(add(s).reason()==CameraProfileHandoff.Reason.ACCEPTED);}
        Ticket prepare(){return controller.prepare(List.of(A,B),P,Set.of(C,R));}
        Ticket ready(){fill();Ticket t=prepare();check(t!=null);return t;}
        Ticket enroll(){Ticket t=ready();approvalDigest=t.evidenceDigest();check(controller.commit(t).reason()==CameraProfileHandoff.Reason.ENROLLED_LOCAL_LEASE);return t;}
    }
    private static void check(boolean ok){assertions++;if(!ok)throw new AssertionError("assertion "+assertions);}
    private static void scenario(String name,Runnable test){test.run();scenarios++;System.out.println("HANDOFF PASS "+name);}
    private static boolean closed(Fixture f){return f.controller.status().state()==CameraProfileHandoff.State.CLOSED&&f.controller.status().retainedSamples()==0;}
    public static void main(String[] args){
        scenario("default host denies without any local enrollment",()->{
            var flow=new CameraProfileHandoff(SCOPE,new Host(){},()->1100);
            check(flow.accept(new Captured(samples().get(0),1100)).reason()==CameraProfileHandoff.Reason.SESSION_INVALID);check(flow.resolve(ID)==null);
        });
        scenario("metadata alone cannot enroll without exact local approval",()->{
            var f=new Fixture();var t=f.ready();check(!t.draft().profile().cameraOnlySurfaceAttested());check(f.controller.resolve(ID)==null);
            check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.APPROVAL_REJECTED);check(closed(f));check(f.consumes==1);
        });
        scenario("fixture capture review approval and dynamic lookup reach existing READ ONLY policy",()->{
            var f=new Fixture();f.enroll();Profile p=f.controller.resolve(ID);check(p!=null&&p.cameraOnlySurfaceAttested());
            var b=new Binding("cmd1","o3",PKG,1,7,0,"layout",1000);
            var o=new Observation("cmd1","o3",PKG,1,7,0,"layout",1100,true,true,true,true,WINDOW,camera());
            var r=CameraSurfacePolicy.inspect(b,new Permit(true,true,true,true,true),o,p,1100);
            check(r.state()==CameraSurfacePolicy.State.READ_ONLY_CAMERA_SURFACE);check(!r.permitsGesture()&&!r.permitsPixels());
            check(!f.controller.status().permitsGesture()&&!f.controller.status().permitsPixels()&&!f.controller.status().cameraSettingsChanged());
            check(f.controller.status().retainedSamples()==0);
        });
        scenario("foreign tickets and repeated commit cannot consume approval",()->{
            var f=new Fixture();var t=f.ready();var g=new Fixture();var other=g.ready();
            check(f.controller.commit(other).reason()==CameraProfileHandoff.Reason.TICKET_MISMATCH);check(f.consumes==0);
            f.approvalDigest=t.evidenceDigest();check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.ENROLLED_LOCAL_LEASE);
            check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.WRONG_STATE);check(f.consumes==1);
        });
        scenario("canonical evidence digest binds exact capture and selected markers",()->{
            var a=new Fixture();var ta=a.ready();var b=new Fixture();var tb=b.ready();check(ta.evidenceDigest().equals(tb.evidenceDigest()));
            var c=new Fixture();c.fill();var tc=c.controller.prepare(List.of(A,B),P,Set.of(C));check(tc!=null);check(!ta.evidenceDigest().equals(tc.evidenceDigest()));
            var d=new Fixture();var data=new ArrayList<>(samples());var old=data.get(0);
            data.set(0,new Sample(old.screen(),"different-capture",old.openingId(),ID,WINDOW,old.nodes(),true,true,true,true));
            for(Sample s:data)check(d.add(s).reason()==CameraProfileHandoff.Reason.ACCEPTED);
            check(!d.prepare().evidenceDigest().equals(ta.evidenceDigest()));
        });
        scenario("old approval cannot approve new evidence",()->{
            var a=new Fixture();var old=a.ready();var b=new Fixture();b.fill();var fresh=b.controller.prepare(List.of(A,B),P,Set.of(C));
            b.approvalDigest=old.evidenceDigest();check(b.controller.commit(fresh).reason()==CameraProfileHandoff.Reason.APPROVAL_REJECTED);check(closed(b));
        });
        scenario("package version signer and fold scope cannot mix",()->{
            for(Identity id:List.of(new Identity("another.camera",1,ID.signerDigest(),ID.screenScope()),new Identity(PKG,2,ID.signerDigest(),ID.screenScope()),new Identity(PKG,1,"d".repeat(64),ID.screenScope()),new Identity(PKG,1,ID.signerDigest(),"e".repeat(64)))){
                var f=new Fixture();var s=samples().get(0);var altered=new Sample(s.screen(),s.captureId(),s.openingId(),id,WINDOW,s.nodes(),true,true,true,true);
                check(f.add(altered).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);check(f.verifies==0);
            }
        });
        scenario("stale future and pre-session captures rejected before verifier",()->{
            for(long observed:new long[]{999,1101}){var f=new Fixture();check(f.controller.accept(new Captured(samples().get(0),observed)).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);check(f.verifies==0);}
            var f=new Fixture();f.now=1451;check(f.controller.accept(new Captured(samples().get(0),1100)).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);
        });
        scenario("sample freshness rechecked after host callback",()->{
            var f=new Fixture();f.duringCapture=()->f.now=1451;
            check(f.controller.accept(new Captured(samples().get(0),1100)).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);check(f.controller.status().retainedSamples()==0);
        });
        scenario("missing provenance and incomplete or text-like metadata rejected",()->{
            var f=new Fixture();f.verified=false;check(f.add(samples().get(0)).reason()==CameraProfileHandoff.Reason.UNVERIFIED_CAPTURE);check(f.controller.status().retainedSamples()==0);
            for(int n=0;n<4;n++){var g=new Fixture();var s=samples().get(0);var bad=new Sample(s.screen(),s.captureId(),s.openingId(),ID,WINDOW,s.nodes(),n!=0,n!=1,n!=2,n!=3);check(g.add(bad).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);}
            var g=new Fixture();check(g.add(sample(Screen.CHAT,"bad","chat",List.of(node("private text",WINDOW)))).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);
            check(g.add(sample(Screen.CHAT,"bad2","chat",List.of(new Node(C,WINDOW,true,true,false,true)))).reason()==CameraProfileHandoff.Reason.INVALID_CAPTURE);
        });
        scenario("duplicate capture rejected without repeat verification",()->{
            var f=new Fixture();var s=samples().get(0);f.add(s);check(f.add(s).reason()==CameraProfileHandoff.Reason.DUPLICATE_CAPTURE);check(f.verifies==1);
        });
        scenario("bounded collection and frozen reviewed snapshot",()->{
            var f=new Fixture();for(int i=0;i<32;i++)check(f.add(sample(Screen.CAMERA,"x"+i,"o"+i,camera())).reason()==CameraProfileHandoff.Reason.ACCEPTED);
            check(f.add(sample(Screen.CAMERA,"overflow","o",camera())).reason()==CameraProfileHandoff.Reason.CAPACITY);check(f.verifies==32);
            var g=new Fixture();g.ready();check(g.add(samples().get(0)).reason()==CameraProfileHandoff.Reason.WRONG_STATE);
        });
        scenario("uncertain approval failure closes once and is never retried",()->{
            var f=new Fixture();var t=f.ready();f.approvalDigest=t.evidenceDigest();f.duringConsume=()->{throw new IllegalStateException("private payload");};
            var receipt=f.controller.commit(t);check(receipt.reason()==CameraProfileHandoff.Reason.HOST_FAILURE);check(!receipt.toString().contains("private payload"));
            f.controller.commit(t);check(f.consumes==1);check(closed(f));check(f.controller.resolve(ID)==null);
        });
        scenario("cancellation during capture cannot be overwritten",()->{
            var f=new Fixture();f.duringCapture=f.controller::close;check(f.add(samples().get(0)).reason()==CameraProfileHandoff.Reason.SESSION_INVALID);check(closed(f));
        });
        scenario("revocation or expiry during approval prevents lease",()->{
            for(int variant=0;variant<3;variant++){var f=new Fixture();var t=f.ready();f.approvalDigest=t.evidenceDigest();final int v=variant;
                f.duringConsume=()->{if(v==0)f.controller.close();else if(v==1)f.active=null;else f.now=10000;};
                check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.SESSION_INVALID);check(closed(f));check(f.controller.resolve(ID)==null);
            }
        });
        scenario("changed session device or command clears retained samples",()->{
            for(Scope other:List.of(new Scope("new","cmd1",SCOPE.deviceDigest(),ID,1000,10000),new Scope("enrollment1","cmd2",SCOPE.deviceDigest(),ID,1000,10000),new Scope("enrollment1","cmd1","d".repeat(64),ID,1000,10000))){
                var f=new Fixture();f.add(samples().get(0));f.active=other;check(f.prepare()==null);check(closed(f));
            }
        });
        scenario("clock rollback and exact expiry invalidate session",()->{
            var f=new Fixture();f.add(samples().get(0));f.now=1099;check(f.prepare()==null);check(closed(f));
            var g=new Fixture();g.enroll();g.now=10000;check(g.controller.resolve(ID)==null);check(closed(g));
        });
        scenario("lookup requires full identity and live revocable approval",()->{
            var f=new Fixture();f.enroll();check(f.controller.resolve(new Identity(PKG,1,ID.signerDigest(),"d".repeat(64)))==null);
            check(f.controller.resolve(ID)!=null);f.still=false;check(f.controller.resolve(ID)==null);check(closed(f));
        });
        scenario("revocation inside lookup callback prevents stale profile return",()->{
            var f=new Fixture();f.enroll();f.duringStill=f.controller::close;check(f.controller.resolve(ID)==null);check(closed(f));
        });
        scenario("host reentry cannot double consume approval",()->{
            var f=new Fixture();var t=f.ready();f.approvalDigest=t.evidenceDigest();f.duringConsume=()->check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.BUSY);
            check(f.controller.commit(t).reason()==CameraProfileHandoff.Reason.ENROLLED_LOCAL_LEASE);check(f.consumes==1);
        });
        scenario("colliding negative screen never reaches approval",()->{
            var f=new Fixture();var data=new ArrayList<>(samples());data.set(2,sample(Screen.CHAT,"c3","chat",camera()));
            for(Sample s:data)check(f.add(s).reason()==CameraProfileHandoff.Reason.ACCEPTED);check(f.prepare()==null);check(f.consumes==0);
        });
        scenario("closed sessions and fresh controller do not inherit enrollment",()->{
            var f=new Fixture();f.enroll();f.controller.close();check(f.controller.resolve(ID)==null);check(closed(f));
            var fresh=new Fixture();check(fresh.controller.resolve(ID)==null);check(fresh.controller.status().retainedSamples()==0);
        });
        scenario("bounded scope and sanitized object summaries",()->{
            try{new Scope("e","c",SCOPE.deviceDigest(),ID,0,CameraProfileHandoff.MAX_SESSION_MS+1);throw new AssertionError("unbounded scope");}catch(IllegalArgumentException e){assertions++;}
            var f=new Fixture();var t=f.ready();check(!SCOPE.toString().contains(PKG));check(!new Captured(samples().get(0),1100).toString().contains(PKG));check(!t.toString().contains(PKG));
        });
        System.out.println("PROFILE_HANDOFF_RESULT={\"scenarios\":"+scenarios+",\"assertions\":"+assertions+",\"physicalSamples\":0,\"physicalProfilesEnrolled\":0,\"deviceActions\":0,\"authority\":\"SYNTHETIC_HOST_ONLY\"}");
    }
}
