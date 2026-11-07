import com.jh.kabiseo.capture.SubjectFramingPolicy;
import com.jh.kabiseo.capture.FrameLuma;
import java.nio.ByteBuffer;

public final class NativeCameraLogicTests {
    private static int checks=0;
    private static void ok(boolean yes,String name) {if(!yes)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    private static SubjectFramingPolicy.Box person(float l,float t,float r,float b,float conf) {
        return new SubjectFramingPolicy.Box(l,t,r,b,conf,"person");
    }
    public static void main(String[] args) {
        var f=new SubjectFramingPolicy();
        var b=person(.32f,.32f,.68f,.57f,.92f);
        ok(!f.observe("A",b,1f,1f,8f,1000).adjust(),"not_active_before_session");
        f.beginSession("A");
        ok(!f.observe("OLD",b,1f,1f,8f,1000).adjust(),"foreign_session_rejected");
        ok(!f.observe("A",null,1f,1f,8f,1000).adjust(),"no_model_detection_no_autozom");
        for(int i=0;i<3;i++)ok(!f.observe("A",b,1f,1f,8f,2000+i*200).adjust(),"needs_four_consistent_"+i);
        var p=f.observe("A",b,1f,1f,8f,2600);
        ok(p.adjust()&&p.zoomRatio()>1f&&p.zoomRatio()<=1.2f,"gentle_zoom_with_stable_detection");
        ok(p.focusX()>=0&&p.focusX()<=1&&p.focusY()>=0&&p.focusY()<=1,"normalized_focus");
        ok(!f.observe("A",b,1.2f,1f,8f,2800).adjust(),"proposal_rate_limited");
        f.manualOverride(3000);
        ok(!f.observe("A",b,1.2f,1f,8f,3500).adjust(),"user_manual_override_respected");
        ok(!f.observe("A",b,1.2f,1f,8f,18100).adjust(),"post_override_stability_rebuilt");
        f.beginSession("B");
        ok(!f.observe("A",b,1f,1f,8f,19000).adjust(),"new_opening_invalidates_old");
        ok(!f.observe("B",b,1f,0f,8f,19000).adjust(),"invalid_camera_state");
        ok(!f.observe("B",person(.32f,.30f,.68f,.55f,.2f),1f,1f,8f,19200).adjust(),"confidence_gate");
        var edge=person(.01f,.30f,.35f,.58f,.9f);
        f.beginSession("C");
        for(int i=0;i<4;i++) {
            var q=f.observe("C",edge,1f,1f,8f,1000+i*200);
            if(i==3)ok(!q.adjust()&&q.reason().contains("EDGE"),"edge_prevents_unwanted_crop");
        }
        f.beginSession("D");
        for(int i=0;i<4;i++) {
            var q=f.observe("D",b,1f,1f,1.05f,1000+i*200);
            if(i==3)ok(!q.adjust(),"hardware_zoom_limit_not_forced");
        }
        f.beginSession("E");
        for(int i=0;i<4;i++) {
            var q=f.observe("E",b,1f,1f,2f,1000+i*200);
            if(i==3)ok(q.adjust(),"fresh_session_allows_change");
        }
        ok(!f.observe("E",b,1f,1f,2f,1100).adjust(),"backwards_clock_rejected");
        ok(!person(-.2f,.4f,.4f,.6f,.99f).valid(),"invalid_model_box_rejected");
        ok(!person(.3f,.3f,.3f,.6f,.99f).valid(),"zero_area_rejected");
        ok(FrameLuma.sampleMean(ByteBuffer.wrap(new byte[]{0,10,20,30,40,50}),3,2,3,1)==25f,"luminance_sample_rows");
        ok(FrameLuma.sampleMean(ByteBuffer.wrap(new byte[]{20,20,0,0,40,40,0,0}),2,2,4,1)==30f,"stride_is_not_pixel_count");
        ok(FrameLuma.hint(30f).equals("LOW_LIGHT"),"lowlight_is_hint_not_ai");
        ok(FrameLuma.hint(125f).equals("AUTO_EXPOSURE_RUNNING"),"normal_hint");
        ok(FrameLuma.hint(Float.NaN).equals("UNKNOWN"),"malformed_frame_rejected");
        System.out.println("NATIVE_CAMERA_LOGIC_RESULT={\"tests\":"+checks+",\"physicalPhoneReads\":0,\"aiModelConnected\":false,\"cameraAppInstalled\":false}");
    }
}
