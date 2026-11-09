package com.jh.kabiseo.capture;

import java.nio.ByteBuffer;

/** Simple Y plane sampling only; NOT an AI classifier. Does not retain pixels. */
public final class FrameLuma {
    private FrameLuma(){}
    public static float sampleMean(ByteBuffer source,int width,int height,int rowStride,int pixelStride) {
        if(source==null||width<=0||height<=0||width>8192||height>8192
            ||rowStride<width||pixelStride<1)throw new IllegalArgumentException("invalid dimensions");
        ByteBuffer plane=source.duplicate();
        int limit=plane.limit();
        int stepX=Math.max(1,width/64),stepY=Math.max(1,height/48);
        long total=0;int samples=0;
        for(int y=0;y<height;y+=stepY){
            for(int x=0;x<width;x+=stepX){
                long idx=(long)y*rowStride+(long)x*pixelStride;
                if(idx>=0&&idx<limit){total+=plane.get((int)idx)&255;samples++;}
            }
        }
        if(samples==0)throw new IllegalArgumentException("empty y plane");
        return total/(float)samples;
    }
    public static String hint(float y) {
        if(!Float.isFinite(y)||y<0f||y>255f)return "UNKNOWN";
        if(y<45f)return "LOW_LIGHT";
        if(y>226f)return "VERY_BRIGHT";
        return "AUTO_EXPOSURE_RUNNING";
    }
}
