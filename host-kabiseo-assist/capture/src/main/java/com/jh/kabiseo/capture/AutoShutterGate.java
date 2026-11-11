package com.jh.kabiseo.capture;

/**
 * Foreground-only, explicitly user-armed, one-shot automatic shutter policy.
 * This class does not infer image content and cannot touch camera hardware.
 * A separate vetted on-device frame analyzer must provide real verified boxes.
 * A rule-of-thirds grid or brightness alone is NEVER trusted detection.
 */
public final class AutoShutterGate {
    public enum Mode { MANUAL, AUTO }
    private static final long REQUIRED_HOLD_MS = 1000L;
    private static final long MAX_SAMPLE_GAP_MS = 450L;
    private static final int REQUIRED_SAMPLES = 4;
    private static final float MAX_CENTER_DRIFT = 0.045f;
    private Mode mode=Mode.MANUAL;
    private String activeSession;
    private boolean armed;
    private boolean fired;
    private long stableSince=-1L;
    private long lastAt=-1L;
    private int stableFrames;
    private Frame lastFrame;

    public record Guide(float left,float top,float right,float bottom) {
        public boolean valid(){
            return Float.isFinite(left)&&Float.isFinite(top)&&Float.isFinite(right)
                &&Float.isFinite(bottom)&&left>=0f&&top>=0f&&right<=1f
                &&bottom<=1f&&right-left>=0.3f&&bottom-top>=0.3f;
        }
    }
    public record Frame(long atMillis,
                        float left,float top,float right,float bottom,
                        boolean detectorVerified,boolean focusReady,
                        boolean motionStable,boolean cameraReady,
                        boolean appInForeground) {
        public boolean valid(){
            return atMillis>=0&&Float.isFinite(left)&&Float.isFinite(top)
                &&Float.isFinite(right)&&Float.isFinite(bottom)
                &&left>=0f&&top>=0f&&right<=1f&&bottom<=1f
                &&right>left&&bottom>top;
        }
        float centerX(){return (left+right)/2f;}
        float centerY(){return (top+bottom)/2f;}
    }

    /** Only the visible user's AUTO selection may arm a fresh local session. */
    public synchronized void selectAuto(String sessionId) {
        if(sessionId==null||sessionId.isBlank())throw new IllegalArgumentException("session");
        activeSession=sessionId;
        mode=Mode.AUTO;
        armed=true;fired=false;
        resetSamples();
    }
    public synchronized void selectManual(){
        mode=Mode.MANUAL;armed=false;fired=false;activeSession=null;resetSamples();
    }
    public synchronized void onBackground(){selectManual();}
    public synchronized void onCameraRebind(){resetSamples();}
    public synchronized Mode mode(){return mode;}
    public synchronized boolean armed(){return armed&&!fired&&mode==Mode.AUTO;}

    private void resetSamples(){
        stableSince=-1L;lastAt=-1L;stableFrames=0;lastFrame=null;
    }
    private boolean eligible(Frame f,Guide g){
        if(f==null||g==null||!f.valid()||!g.valid()
            ||!f.detectorVerified()||!f.focusReady()||!f.motionStable()
            ||!f.cameraReady()||!f.appInForeground())return false;
        // Leave a safety margin between the trusted box and on-screen guide.
        float m=0.015f;
        return f.left()>=g.left()+m&&f.right()<=g.right()-m
            &&f.top()>=g.top()+m&&f.bottom()<=g.bottom()-m;
    }

    /**
     * Returns true precisely once when a current, truly verified subject has
     * remained inside the actual guide for >=1s and >=4 timely stable samples.
     * No detector / no AF-ready / motion / stale session => NO shutter.
     */
    public synchronized boolean observe(String sessionId,Frame frame,Guide guide){
        if(!armed()||sessionId==null||!sessionId.equals(activeSession))return false;
        if(!eligible(frame,guide)){resetSamples();return false;}
        long at=frame.atMillis();
        if(lastAt>=0&&(at<=lastAt||at-lastAt>MAX_SAMPLE_GAP_MS)){
            resetSamples();
        }
        boolean same=lastFrame!=null
            &&Math.abs(lastFrame.centerX()-frame.centerX())<=MAX_CENTER_DRIFT
            &&Math.abs(lastFrame.centerY()-frame.centerY())<=MAX_CENTER_DRIFT;
        if(!same){resetSamples();stableSince=at;stableFrames=1;}
        else stableFrames++;
        lastFrame=frame;lastAt=at;
        if(stableFrames<REQUIRED_SAMPLES||at-stableSince<REQUIRED_HOLD_MS)return false;
        armed=false;fired=true;resetSamples(); // latch BEFORE calling ImageCapture
        return true;
    }
}
