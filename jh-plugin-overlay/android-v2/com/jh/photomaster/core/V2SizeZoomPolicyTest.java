package com.jh.photomaster.core;
public final class V2SizeZoomPolicyTest {
    static int n=0;
    static void check(float actual,float expected,String what){
        n++;
        if(Float.isNaN(expected)?!Float.isNaN(actual):!Float.isFinite(actual)||Math.abs(actual-expected)>0.00015f)
            throw new AssertionError(what+": "+actual+" not "+expected);
    }
    public static void main(String[]args){
        check(V2SizeZoomPolicy.choose(1.5f,1,8,"IN","SMALL"),1.725f,"relative in15");
        check(V2SizeZoomPolicy.choose(1.5f,1,8,"IN","MEDIUM"),1.875f,"relative in25");
        check(V2SizeZoomPolicy.choose(1.5f,1,8,"OUT","SMALL"),1.275f,"relative out15");
        check(V2SizeZoomPolicy.choose(1.5f,1,8,"OUT","MEDIUM"),1.125f,"relative out25");
        check(V2SizeZoomPolicy.choose(1,1,8,"OUT","SMALL"),Float.NaN,"device floor");
        check(V2SizeZoomPolicy.choose(2,1,8,"IN","SMALL"),Float.NaN,"quality ceiling");
        check(V2SizeZoomPolicy.choose(1.95f,1,8,"IN","MEDIUM"),2f,"clamp");
        check(V2SizeZoomPolicy.choose(.9f,.5f,8,"OUT","SMALL"),.765f,"ultrawide");
        check(V2SizeZoomPolicy.choose(1,1,8,"DIAGONAL","SMALL"),Float.NaN,"invalid direction");
        check(V2SizeZoomPolicy.choose(1,1,8,"IN","HUGE"),Float.NaN,"invalid step");
        check(V2SizeZoomPolicy.choose(2.3f,1,8,"IN","SMALL"),Float.NaN,"never reverse zoom-in");
        check(V2SizeZoomPolicy.choose(2.3f,1,8,"OUT","MEDIUM"),Float.NaN,"manual over-quality cap");
        check(V2SizeZoomPolicy.choose(.99f,1,8,"OUT","SMALL"),Float.NaN,"out-of-hardware min");
        check(V2SizeZoomPolicy.choose(8.01f,1,8,"IN","SMALL"),Float.NaN,"out-of-hardware max");
        for(int i=0;i<220;i++){
            float cur=.5f+(i%25)*.065f;
            String dir=i%2==0?"IN":"OUT";
            String str=i%3==0?"SMALL":"MEDIUM";
            float factor="IN".equals(dir)?("SMALL".equals(str)?1.15f:1.25f):("SMALL".equals(str)?.85f:.75f);
            float expected=Math.max(.5f,Math.min(2f,cur*factor));
            if(cur>2f || Math.abs(expected-cur)<V2SizeZoomPolicy.EPSILON ||
               ("IN".equals(dir) ? expected<cur+V2SizeZoomPolicy.EPSILON : expected>cur-V2SizeZoomPolicy.EPSILON))
                expected=Float.NaN;
            check(V2SizeZoomPolicy.choose(cur,.5f,8f,dir,str),expected,"sweep"+i);
        }
        // Extra direction and device-boundary invariants, deterministic and repeatable.
        for(int i=0;i<2000;i++){
            float cur=.5f+(i%60)*.05f;
            float min=(i%3==0)? .5f:1f;
            float max=(i%5==0)?1.8f:8f;
            String dir=i%2==0?"IN":"OUT";
            String str=i%4==0?"SMALL":"MEDIUM";
            float got=V2SizeZoomPolicy.choose(cur,min,max,dir,str);
            n++;
            if(Float.isFinite(got)){
                if(got<min-.00001f || got>max+.00001f || got>2.00001f)
                    throw new AssertionError("out-of-bounds zoom at "+i);
                if("IN".equals(dir) && got-cur < V2SizeZoomPolicy.EPSILON-.00001f)
                    throw new AssertionError("zoom-in reversed at "+i);
                if("OUT".equals(dir) && cur-got < V2SizeZoomPolicy.EPSILON-.00001f)
                    throw new AssertionError("zoom-out reversed at "+i);
            }
        }
        System.out.println("JH_ZOOM_PASS checks="+n);
    }
}
