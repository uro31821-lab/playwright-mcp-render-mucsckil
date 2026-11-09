package com.jh.kabiseo.capture;

/**
 * Pure, offline recommendation policy for a FUTURE on-device object detector.
 * No image read, network, camera actuation, or scheduled camera operation here.
 * Never call with fabricated detections. A model+input adapter is NOT installed.
 */
public final class SubjectFramingPolicy {
    public record Box(float left,float top,float right,float bottom,float confidence,String category) {
        public boolean valid() {
            return category!=null&&!category.isBlank()&&Float.isFinite(left)&&Float.isFinite(top)
                &&Float.isFinite(right)&&Float.isFinite(bottom)&&Float.isFinite(confidence)
                &&left>=0&&top>=0&&right<=1&&bottom<=1&&right>left&&bottom>top
                &&confidence>=0.65f&&confidence<=1f;
        }
        public float x(){return (left+right)/2f;}
        public float y(){return (top+bottom)/2f;}
        public float height(){return bottom-top;}
    }
    public record Proposal(boolean adjust,float zoomRatio,float focusX,float focusY,String reason) {}
    private String sessionId;
    private Box previous;
    private int stableFrames;
    private long previousAt=-1L;
    private long lastProposalAt=-1L;
    private long manualUntil=-1L;

    public synchronized void beginSession(String id) {
        if(id==null||id.isBlank())throw new IllegalArgumentException("session id required");
        sessionId=id;
        previous=null; stableFrames=0; previousAt=-1L; lastProposalAt=-1L; manualUntil=-1L;
    }
    public synchronized void manualOverride(long nowMillis) {
        if(nowMillis<0)throw new IllegalArgumentException("clock");
        manualUntil=nowMillis+15000L;
        previous=null; stableFrames=0; previousAt=-1L;
    }
    private Proposal no(float zoom,String why){return new Proposal(false,zoom,Float.NaN,Float.NaN,why);}
    public synchronized Proposal observe(String id,Box subject,float currentZoom,
                                         float deviceMinZoom,float deviceMaxZoom,long nowMillis) {
        if(sessionId==null||!sessionId.equals(id))return no(currentZoom,"SESSION_NOT_CURRENT");
        if(nowMillis<0||!Float.isFinite(currentZoom)||!Float.isFinite(deviceMinZoom)
            ||!Float.isFinite(deviceMaxZoom)||deviceMinZoom<=0f||deviceMaxZoom<deviceMinZoom
            ||currentZoom<deviceMinZoom-0.01f||currentZoom>deviceMaxZoom+0.01f)
            return no(currentZoom,"CAMERA_STATE_UNAVAILABLE");
        if(previousAt>=0&&nowMillis<previousAt) {
            previous=null;stableFrames=0;previousAt=-1;
            return no(currentZoom,"CLOCK_WENT_BACKWARDS");
        }
        if(manualUntil>=0&&nowMillis<manualUntil)return no(currentZoom,"MANUAL_CONTROL_ACTIVE");
        if(subject==null||!subject.valid()) {
            previous=null;stableFrames=0;previousAt=nowMillis;
            return no(currentZoom,"NO_TRUSTED_OBJECT");
        }
        boolean consistent=previous!=null&&previous.category().equals(subject.category())
            &&Math.abs(previous.x()-subject.x())<=0.07f
            &&Math.abs(previous.y()-subject.y())<=0.07f
            &&Math.abs(previous.height()-subject.height())<=0.08f
            &&previousAt>=0&&nowMillis-previousAt<=1250L;
        stableFrames=consistent?Math.min(stableFrames+1,30):1;
        previous=subject;previousAt=nowMillis;
        if(stableFrames<4)return no(currentZoom,"NEEDS_STABLE_DETECTIONS");
        if(lastProposalAt>=0&&nowMillis-lastProposalAt<2500L)return no(currentZoom,"RATE_LIMITED");
        if(subject.left()<0.08f||subject.right()>0.92f
            ||subject.top()<0.06f||subject.bottom()>0.94f)
            return no(currentZoom,"SUBJECT_NEAR_EDGE_NO_AUTO_CROP");
        float allowedMin=Math.max(1f,deviceMinZoom);
        float allowedMax=Math.min(1.8f,deviceMaxZoom);
        if(allowedMax<allowedMin)return no(currentZoom,"NO_SAFE_ZOOM_RANGE");
        // Do not force narrow framing: leave a wide margin for movement and group photos.
        float desired=Math.max(allowedMin,Math.min(allowedMax,0.38f/subject.height()));
        if(Math.abs(desired-currentZoom)<0.18f)return no(currentZoom,"ZOOM_ALREADY_APPROPRIATE");
        // A gentle step avoids sudden crop or runaway oscillations.
        float step=desired>currentZoom?Math.min(desired,currentZoom+0.20f):
            Math.max(desired,currentZoom-0.20f);
        if(step<deviceMinZoom||step>deviceMaxZoom||Math.abs(step-currentZoom)<0.01f)
            return no(currentZoom,"UNSUPPORTED_STEP");
        lastProposalAt=nowMillis;
        return new Proposal(true,step,subject.x(),subject.y(),"STABLE_LOCAL_DETECTION_PROPOSAL");
    }
}
