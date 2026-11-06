package com.jh.pobiseo.assist.review;

import com.jh.pobiseo.assist.CameraSurfacePolicy;
import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import com.jh.pobiseo.assist.review.CameraProfileReview.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.UnaryOperator;

/** All IDs and samples are FIXTURES, not captured ChatGPT resource IDs or phone evidence. */
public final class CameraProfileReviewTests {
    private static int scenarios,assertions;
    private static final String PKG="fixture.camera",P=PKG+":id/preview",A=PKG+":id/shutter",B=PKG+":id/close",C=PKG+":id/chat",R=PKG+":id/review";
    private static final Identity ID=new Identity(PKG,1,"a".repeat(64),"b".repeat(64));
    private static final Bounds WINDOW=new Bounds(0,0,1000,1800);
    private static Node n(String id,Bounds box){return new Node(id,box,true,true,false,false);}
    private static List<Node> camera(){return List.of(n(P,new Bounds(0,0,1000,1500)),n(A,new Bounds(400,1550,600,1700)),n(B,new Bounds(30,1550,120,1650)));}
    private static Sample sample(Screen type,String capture,String opening,List<Node> nodes){return new Sample(type,capture,opening,ID,WINDOW,nodes,true,true,true,true);}
    private static List<Sample> valid(){return new ArrayList<>(List.of(
        sample(Screen.CAMERA,"c1","open1",camera()),sample(Screen.CAMERA,"c2","open2",camera()),
        sample(Screen.CHAT,"c3","chat1",List.of(n(C,WINDOW))),sample(Screen.PHOTO_REVIEW,"c4","review1",List.of(n(R,WINDOW)))));}
    private static Review review(List<Sample> data){return CameraProfileReview.review(ID,data,List.of(A,B),P,Set.of(C,R));}
    private static Sample changeNodes(Sample s,List<Node> nodes){return new Sample(s.screen(),s.captureId(),s.openingId(),s.identity(),s.window(),nodes,s.applicationWindow(),s.active(),s.unoccluded(),s.complete());}
    private static Sample changeIdentity(Sample s,Identity id){return new Sample(s.screen(),s.captureId(),s.openingId(),id,s.window(),s.nodes(),s.applicationWindow(),s.active(),s.unoccluded(),s.complete());}
    private static List<Sample> changed(int at,UnaryOperator<Sample> f){var data=valid();data.set(at,f.apply(data.get(at)));return data;}
    private static void check(boolean value){assertions++;if(!value)throw new AssertionError("assertion "+assertions);}
    private static void reject(Review r,Reason reason){check(r.status()==Status.REJECTED);check(r.reason()==reason);check(r.draft()==null);}
    private static void scenario(String name,Runnable f){f.run();scenarios++;System.out.println("PASS "+name);}
    public static void main(String[] args){
        scenario("complete fixture yields unattested draft only",()->{
            var r=review(valid());check(r.status()==Status.DRAFT_REQUIRES_LOCAL_REVIEW);check(!r.draft().profile().cameraOnlySurfaceAttested());
            check(r.draft().identity().equals(ID));check(!r.cameraVerified()&&!r.physicalEvidenceVerified()&&!r.profileEnrolled()&&!r.permitsGesture()&&!r.permitsPixels());
            check(!r.toString().contains(PKG));
        });
        scenario("draft cannot pass the EXISTING runtime surface policy",()->{
            var p=review(valid()).draft().profile();var b=new Binding("cmd","open",PKG,1,7,0,"layout",1000);
            var o=new Observation("cmd","open",PKG,1,7,0,"layout",1100,true,true,true,true,WINDOW,camera());
            var r=CameraSurfacePolicy.inspect(b,new Permit(true,true,true,true,true),o,p,1100);
            check(r.state()==State.DENIED);check(!r.permitsGesture()&&!r.permitsPixels());
        });
        scenario("same opening repeated cannot replace a camera reopen",()->{
            var data=changed(1,s->new Sample(s.screen(),s.captureId(),"open1",ID,WINDOW,s.nodes(),true,true,true,true));
            reject(review(data),Reason.INSUFFICIENT_COVERAGE);
        });
        scenario("each negative screen type is required",()->{
            for(int index:new int[]{2,3}){var data=valid();data.remove(index);reject(review(data),Reason.INSUFFICIENT_COVERAGE);}
        });
        scenario("duplicate capture rejected even across screen labels",()->{
            var data=changed(3,s->new Sample(s.screen(),"c1",s.openingId(),ID,WINDOW,s.nodes(),true,true,true,true));
            reject(review(data),Reason.DUPLICATE_CAPTURE);
        });
        scenario("package version signer or fold-display scope cannot mix",()->{
            for(Identity id:List.of(new Identity("another.camera",1,ID.signerDigest(),ID.screenScope()),
                new Identity(PKG,2,ID.signerDigest(),ID.screenScope()),new Identity(PKG,1,"c".repeat(64),ID.screenScope()),
                new Identity(PKG,1,ID.signerDigest(),"d".repeat(64))))reject(review(changed(1,s->changeIdentity(s,id))),Reason.IDENTITY_CHANGED);
        });
        scenario("partial inactive or covered samples do not count as negative evidence",()->{
            for(int flag=0;flag<4;flag++){final int f=flag;
                reject(review(changed(2,s->new Sample(s.screen(),s.captureId(),s.openingId(),ID,WINDOW,s.nodes(),f!=0,f!=1,f!=2,f!=3))),Reason.INCOMPLETE_SAMPLE);
            }
        });
        scenario("chat and photo-review reusing camera signature rejected",()->{
            for(int index:new int[]{2,3})reject(review(changed(index,s->changeNodes(s,camera()))),Reason.NEGATIVE_SURFACE_COLLISION);
        });
        scenario("negative collision cannot hide behind disabled controls or input marker",()->{
            List<Node> ns=new ArrayList<>(camera());Node old=ns.get(1);ns.set(1,new Node(A,old.bounds(),true,false,false,false));
            ns.add(new Node(C,new Bounds(0,1720,1000,1790),true,true,true,false));
            reject(review(changed(2,s->changeNodes(s,ns))),Reason.NEGATIVE_SURFACE_COLLISION);
        });
        scenario("missing hidden duplicated and disabled camera anchor rejected",()->{
            for(int variant=0;variant<4;variant++){
                var ns=new ArrayList<>(camera());Node old=ns.get(1);
                if(variant==0)ns.remove(1);else if(variant==1)ns.set(1,new Node(A,old.bounds(),false,true,false,false));
                else if(variant==2)ns.add(old);else ns.set(1,new Node(A,old.bounds(),true,false,false,false));
                reject(review(changed(0,s->changeNodes(s,ns))),Reason.CAMERA_SIGNATURE_MISSING);
            }
        });
        scenario("coincident positive anchors are not independent controls",()->{
            var ns=new ArrayList<>(camera());ns.set(2,n(B,ns.get(1).bounds()));
            reject(review(changed(0,s->changeNodes(s,ns))),Reason.CAMERA_SIGNATURE_MISSING);
        });
        scenario("camera text entry or password field rejected",()->{
            for(boolean password:new boolean[]{false,true}){var ns=new ArrayList<>(camera());
                ns.add(new Node(PKG+":id/input",new Bounds(0,1720,1000,1790),true,true,!password,password));
                reject(review(changed(0,s->changeNodes(s,ns))),Reason.CAMERA_INPUT_PRESENT);
            }
        });
        scenario("visible forbidden marker cannot be on a positive sample",()->{
            var ns=new ArrayList<>(camera());ns.add(n(R,new Bounds(0,1720,1000,1790)));
            reject(review(changed(0,s->changeNodes(s,ns))),Reason.CAMERA_PROHIBITED_MARKER);
        });
        scenario("out of window metadata is incomplete even on negative controls",()->{
            reject(review(changed(2,s->changeNodes(s,List.of(n(C,new Bounds(0,0,1001,1800)))))),Reason.INCOMPLETE_SAMPLE);
        });
        scenario("invalid resource IDs and conflicting roles rejected",()->{
            reject(CameraProfileReview.review(ID,valid(),List.of(A,"text with spaces"),P,Set.of()),Reason.INVALID_INPUT);
            reject(CameraProfileReview.review(ID,valid(),List.of(A,A),P,Set.of()),Reason.INVALID_INPUT);
            reject(CameraProfileReview.review(ID,valid(),List.of(A,P),P,Set.of()),Reason.INVALID_INPUT);
            reject(CameraProfileReview.review(ID,valid(),List.of(A,B),P,Set.of(A)),Reason.INVALID_INPUT);
            reject(CameraProfileReview.review(ID,valid(),List.of(A,B),"other.camera:id/preview",Set.of()),Reason.INVALID_INPUT);
        });
        scenario("null empty and over-budget inputs fail closed",()->{
            reject(review(null),Reason.INVALID_INPUT);reject(review(List.of()),Reason.INSUFFICIENT_COVERAGE);
            var many=new ArrayList<Sample>();for(int i=0;i<33;i++)many.add(valid().get(0));reject(review(many),Reason.INVALID_INPUT);
            var ns=new ArrayList<Node>();for(int i=0;i<513;i++)ns.add(camera().get(0));
            try{sample(Screen.CAMERA,"c","o",ns);throw new AssertionError("size accepted");}catch(IllegalArgumentException e){assertions++;}
        });
        scenario("attested draft construction is forbidden",()->{
            try{new Draft(ID,new Profile(PKG,1,List.of(A,B),P,Set.of(),true));throw new AssertionError("attested accepted");}
            catch(IllegalArgumentException e){assertions++;}
        });
        System.out.println("PROFILE_REVIEW_RESULT={\"scenarios\":"+scenarios+",\"assertions\":"+assertions+",\"physicalSamples\":0,\"profilesEnrolled\":0,\"deviceActions\":0}");
    }
}
