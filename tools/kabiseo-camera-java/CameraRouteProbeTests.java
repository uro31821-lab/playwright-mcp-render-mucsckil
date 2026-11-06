import java.nio.file.*;
import java.io.*;
import java.util.*;

public final class CameraRouteProbeTests {
    static int checks;
    interface Task{void run()throws Exception;}
    static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    static void denied(Task task,String code)throws Exception{try{task.run();throw new AssertionError("not blocked: "+code);}catch(CameraRouteProbe.Blocked e){check(code.equals(e.code),code);}}
    static String f(String pkg,String token,boolean caller){return "  * Hist #0: ActivityRecord{"+token+" u0 "+pkg+"/.MainActivity t25}\n"+(caller?"    launchedFromUid=123 launchedFromPackage=com.openai.chatgpt launchedFromFeature=null\n    Intent { act=android.media.action.IMAGE_CAPTURE dat=content://PRIVATE_URI }\n":"")+" topResumedActivity=ActivityRecord{"+token+" u0 "+pkg+"/.MainActivity t25}\n";}
    static String c(String pkg,String pid){return "Active Camera Clients:\n[\n(Camera ID: 0, Cost: 100, PID: "+pid+", Client Package Name: "+pkg+", Conflicting Client Devices: {})\n]\nAllowed users:\n0\nCamera service events log:\nCONNECT secret.history.app\n";}
    public static void main(String[] args)throws Exception{
        String g="com.openai.chatgpt",s="com.sec.android.app.camera";
        var fg=CameraRouteProbe.focus(f(g,"abc",false));var cg=CameraRouteProbe.camera(c(g,"123"));
        check(CameraRouteProbe.route(fg,cg,fg,cg).get("route").equals("CHATGPT_OWNS_CAMERA_OBSERVED"),"GPT owner observed");
        var fs=CameraRouteProbe.focus(f(s,"bbb",true));var cs=CameraRouteProbe.camera(c(s,"456"));
        var delegated=CameraRouteProbe.route(fs,cs,fs,cs);
        check(delegated.get("route").equals("GPT_IMAGE_CAPTURE_DELEGATION_OBSERVED"),"exact caller plus intent and active client");
        check(Boolean.FALSE.equals(delegated.get("automaticControlVerified")),"ownership does not authorize control");
        var fs0=CameraRouteProbe.focus(f(s,"bbb",false));
        check(CameraRouteProbe.route(fs0,cs,fs0,cs).get("route").equals("OTHER_APP_OWNS_CAMERA_CALLER_UNPROVEN"),"other camera is not assumed GPT delegation");
        check(CameraRouteProbe.route(fg,cg,fs,cs).get("reason").equals("OBSERVATION_CHANGED"),"changed foreground rejected");
        check(CameraRouteProbe.route(fg,cg,fg,CameraRouteProbe.camera(c(g,"999"))).get("reason").equals("OBSERVATION_CHANGED"),"changed camera client rejected");
        check(CameraRouteProbe.route(fg,cs,fg,cs).get("reason").equals("FOREGROUND_CAMERA_OWNER_MISMATCH"),"split-pane mismatch rejected");
        check(CameraRouteProbe.camera("Active Camera Clients:\n[]\nCONNECT PID: 9, Client Package Name: "+g).count()==0,"historical event never active proof");
        denied(()->CameraRouteProbe.camera("CONNECT "+g),"ACTIVE_CLIENT_FORMAT_UNSUPPORTED");
        denied(()->CameraRouteProbe.camera("Active Camera Clients: []\nActive Camera Clients: []\n"),"ACTIVE_CLIENT_FORMAT_UNSUPPORTED");
        denied(()->CameraRouteProbe.focus(f(g,"abc",false)+f(s,"bbb",false)),"FOREGROUND_MISSING_OR_AMBIGUOUS");
        denied(()->CameraRouteProbe.focus("Permission Denial: current window"),"DUMP_UNAVAILABLE_NO_ELEVATION");
        denied(()->CameraRouteProbe.camera(c(g,"123").replace("Client Package Name:","VendorField:")),"CAMERA_CLIENT_MISSING_OR_MULTIPLE");
        var otherF=CameraRouteProbe.focus(f("private.other.app","abc",true));var otherC=CameraRouteProbe.camera(c("private.other.app","123"));
        String redacted=CameraRouteProbe.json(CameraRouteProbe.route(otherF,otherC,otherF,otherC));
        check(!redacted.contains("private.other.app")&&!redacted.contains("PRIVATE_URI")&&!redacted.contains("123"),"unrelated names URI and PID excluded");
        check(CameraRouteProbe.serial("List of devices attached\nABC123\tdevice\n").equals("ABC123"),"one authorized device");
        denied(()->CameraRouteProbe.serial("List of devices attached\nABC123 unauthorized\n"),"DEVICE_NOT_AUTHORIZED_OR_OFFLINE");
        denied(()->CameraRouteProbe.serial("List of devices attached\nABC123 device\nDEF456 device\n"),"EXACTLY_ONE_AUTHORIZED_DEVICE_REQUIRED");
        denied(()->CameraRouteProbe.command(Path.of("adb.exe"),"ABC123","install"),"OPERATION_NOT_ALLOWED");
        denied(()->CameraRouteProbe.command(Path.of("adb.exe"),"ABC & whoami","camera"),"SERIAL_INVALID");
        check(CameraRouteProbe.command(Path.of("adb.exe"),"ABC123","activity").equals(List.of("adb.exe","-s","ABC123","shell","dumpsys","-t","5","activity","activities")),"fixed read-only argument vector");
        var expected=new ArrayDeque<>(List.of("activity","camera","camera","activity"));
        var observed=CameraRouteProbe.observe(op->{if(!op.equals(expected.removeFirst()))throw new AssertionError("wrong sequence");return op.equals("activity")?f(g,"abc",false):c(g,"123");});
        check(expected.isEmpty()&&observed.get("route").equals("CHATGPT_OWNS_CAMERA_OBSERVED"),"full four-read fixture sequence");
        try{CameraRouteProbe.bounded(new ByteArrayInputStream(new byte[CameraRouteProbe.LIMIT+1]));throw new AssertionError("unbounded");}catch(IOException ex){check(true,"oversized output rejected");}
        Path root=Files.createTempDirectory("camera-route-tests-");
        try{
            CameraRouteProbe.save(root,observed);CameraRouteProbe.save(root,CameraRouteProbe.base());
            try(var log=Files.list(root.resolve("logs"))){check(log.count()==3,"new summary and previous result retained");}
            check(Files.readString(root.resolve("RESULT.txt")).contains("\"status\":\"BLOCKED\""),"latest result replaces old success");
        }finally{try(var files=Files.walk(root)){for(Path p:files.sorted(Comparator.reverseOrder()).toList())Files.delete(p);}}
        System.out.println("JAVA_PROBE_TEST_RESULT={\"checks\":"+checks+",\"physicalPhoneReads\":0,\"scope\":\"SYNTHETIC_METADATA_AND_LOCAL_FILES\"}");
    }
}
