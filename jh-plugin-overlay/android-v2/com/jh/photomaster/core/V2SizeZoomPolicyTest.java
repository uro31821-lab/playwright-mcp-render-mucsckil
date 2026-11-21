package com.jh.photomaster.core;
public final class V2SizeZoomPolicyTest {
    static int n=0;
    static void check(float actual,float expected,String what){
        n++;
        if(Float.isNaN(expected)?!Float.isNaN(actual):!Float.isFinite(actual)||Math.abs(actual-expected)>0.0001f)
            throw new AssertionError(what+": "+actual+" not "+expected);
    }
    public static void main(String[]args){
        check(V2SizeZoomPolicy.choose(1,1,8,"IN","SMALL"),1.1f,"in");
        check(V2SizeZoomPolicy.choose(1.5f,1,8,"OUT","MEDIUM"),1.3f,"out");
        check(V2SizeZoomPolicy.choose(1,1,8,"OUT","SMALL"),Float.NaN,"device floor");
        check(V2SizeZoomPolicy.choose(2,1,8,"IN","SMALL"),Float.NaN,"quality ceiling");
        check(V2SizeZoomPolicy.choose(1.95f,1,8,"IN","MEDIUM"),2f,"clamp");
        check(V2SizeZoomPolicy.choose(.9f,.5f,8,"OUT","SMALL"),.8f,"ultrawide");
        check(V2SizeZoomPolicy.choose(1,1,8,"DIAGONAL","SMALL"),Float.NaN,"invalid direction");
        check(V2SizeZoomPolicy.choose(1,1,8,"IN","HUGE"),Float.NaN,"invalid step");
        for(int i=0;i<200;i++){
            float cur=.5f+(i%17)*.1f;
            float out=V2SizeZoomPolicy.choose(cur,.5f,8,i%2==0?"IN":"OUT","MEDIUM");
            n++;
            if(Float.isFinite(out)&&(out>2.0001f||out<.5f||Math.abs(out-cur)>.2001f))
                throw new AssertionError("unbounded zoom at "+i);
        }
        System.out.println("JH_ZOOM_PASS checks="+n);
    }
}
