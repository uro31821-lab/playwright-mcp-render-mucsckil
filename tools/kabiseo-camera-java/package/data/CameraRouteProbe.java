/* JH camera route observation FIX2. Independent Java implementation.
 * No PowerShell, downloads, installs, policy changes, pixels or phone writes.
 * Existing JDK and authorized ADB only. Raw diagnostics are memory-only.
 */
import java.io.*;
import java.nio.*;
import java.nio.channels.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

public final class CameraRouteProbe {
    static final String TARGET="com.openai.chatgpt";
    static final Set<String> KNOWN=Set.of(TARGET,"com.sec.android.app.camera","com.android.camera2","com.google.android.GoogleCamera","com.android.chrome");
    static final int LIMIT=8*1024*1024;
    static final String RECORD="ActivityRecord\\{([a-fA-F0-9]+)\\s+u(\\d+)\\s+([A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+)/([A-Za-z0-9_.$]+)\\s";
    static final class Blocked extends Exception {
        private static final long serialVersionUID=1L;
        final String code;
        Blocked(String code){super(code);this.code=code;}
    }
    record Focus(String token,String user,String pkg,String activity,boolean caller,boolean capture){}
    record Camera(int count,String pkg,String signature){}
    interface Reader {String read(String operation) throws Exception;}
    static List<MatchResult> matches(String regex,String text){return Pattern.compile(regex).matcher(text).results().toList();}
    static void dump(String text)throws Blocked{
        if(text==null||text.isBlank()||text.length()>LIMIT)throw new Blocked("DUMP_EMPTY_OR_OVERSIZED");
        if(Pattern.compile("permission denial|permission denied|cannot find service|can't find service|dump timed out|may be deadlocked",Pattern.CASE_INSENSITIVE).matcher(text).find())throw new Blocked("DUMP_UNAVAILABLE_NO_ELEVATION");
    }
    static Focus focus(String text)throws Blocked{
        dump(text);
        var rows=matches("(?m)^\\h*(?:topResumedActivity|mTopResumedActivity)\\h*[:=]\\h*"+RECORD,text);
        if(rows.isEmpty())rows=matches("(?m)^\\h*(?:mResumedActivity|ResumedActivity)\\h*[:=]\\h*"+RECORD,text);
        Set<String> unique=new HashSet<>();
        for(var row:rows)unique.add(row.group(1)+"|"+row.group(2)+"|"+row.group(3)+"|"+row.group(4));
        if(unique.size()!=1)throw new Blocked("FOREGROUND_MISSING_OR_AMBIGUOUS");
        var selected=rows.get(0);boolean caller=false,capture=false;
        var histories=matches("(?m)^\\h*\\*\\h*Hist #\\d+:\\h*"+RECORD,text);
        var same=histories.stream().filter(h->h.group(1).equals(selected.group(1))).toList();
        if(same.size()==1){
            var h=same.get(0);int end=text.length();
            for(var next:histories)if(next.start()>h.start()){end=next.start();break;}
            String block=text.substring(h.start(),end);
            var callers=matches("(?m)^\\h*launchedFromUid=\\d+\\h+launchedFromPackage=([A-Za-z0-9_.]+)(?:\\h|$)",block);
            var intents=matches("(?m)^\\h*Intent\\h*\\{([^\\r\\n}]*)\\}",block);
            if(callers.size()==1)caller=TARGET.equals(callers.get(0).group(1));
            if(intents.size()==1)capture=Pattern.compile("(?:^|\\s)act=android\\.media\\.action\\.IMAGE_CAPTURE(?:\\s|$)").matcher(intents.get(0).group(1)).find();
        }
        return new Focus(selected.group(1),selected.group(2),selected.group(3),selected.group(4),caller,capture);
    }
    static Camera camera(String text)throws Blocked{
        dump(text);
        var sections=matches("(?m)^\\h*Active Camera Clients:\\h*(?:\\R\\h*)?\\[([^\\]]*)\\]\\h*(?:\\R|$)",text);
        if(sections.size()!=1)throw new Blocked("ACTIVE_CLIENT_FORMAT_UNSUPPORTED");
        String body=sections.get(0).group(1);
        if(body.isBlank())return new Camera(0,"","");
        var starts=matches("(?m)^\\h*\\(Camera ID:",body);
        var packages=matches("Client Package Name:\\h*([A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+)(?=,|\\)|\\s|$)",body);
        var pids=matches("\\bPID:\\h*(\\d+)(?=,|\\s|$)",body);
        var ids=matches("Camera ID:\\h*([A-Za-z0-9_.:-]+),",body);
        if(starts.size()!=1||packages.size()!=1||pids.size()!=1||ids.size()!=1)throw new Blocked("CAMERA_CLIENT_MISSING_OR_MULTIPLE");
        String pkg=packages.get(0).group(1);
        return new Camera(1,pkg,pkg+"|"+pids.get(0).group(1)+"|"+ids.get(0).group(1));
    }
    static String serial(String text)throws Blocked{
        var rows=text.lines().map(String::trim).filter(s->!s.isEmpty()&&!s.startsWith("List of devices attached")&&!s.startsWith("*")).toList();
        if(rows.size()!=1)throw new Blocked("EXACTLY_ONE_AUTHORIZED_DEVICE_REQUIRED");
        var m=Pattern.compile("([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\\s+(\\w+)").matcher(rows.get(0));
        if(!m.matches())throw new Blocked("DEVICE_LIST_FORMAT_UNSUPPORTED");
        if(!"device".equals(m.group(2)))throw new Blocked("DEVICE_NOT_AUTHORIZED_OR_OFFLINE");
        return m.group(1);
    }
    static Map<String,Object> base(){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("schema","KABISEO_CAMERA_ROUTE_JAVA_V022_FIX2");
        m.put("status","BLOCKED");m.put("route","UNKNOWN");
        m.put("powerShellUsed",false);m.put("securitySettingsChanged",false);
        m.put("phoneAccessAttempted",false);m.put("cameraObservation","NOT_RUN");
        m.put("rawDumpSaved",false);m.put("pixelsRead",false);m.put("textContentSaved",false);m.put("deviceSerialSaved",false);
        m.put("cameraSettingsChanged",false);m.put("appInstalled",false);m.put("automaticControlVerified",false);m.put("restoreVerified",false);
        return m;
    }
    static Map<String,Object> route(Focus f1,Camera c1,Focus f2,Camera c2){
        var m=base();String route="UNKNOWN",reason="NO_ACTIVE_CAMERA";
        boolean stable=f1.token.equals(f2.token)&&f1.user.equals(f2.user)&&f1.pkg.equals(f2.pkg)&&f1.activity.equals(f2.activity)&&c1.equals(c2);
        if(!stable)reason="OBSERVATION_CHANGED";
        else if(c2.count==1){
            if(!f2.pkg.equals(c2.pkg))reason="FOREGROUND_CAMERA_OWNER_MISMATCH";
            else if(TARGET.equals(c2.pkg)){route="CHATGPT_OWNS_CAMERA_OBSERVED";reason="MATCHED_ACTIVE_CLIENT_AND_FOREGROUND";}
            else if(f1.caller&&f1.capture&&f2.caller&&f2.capture){route="GPT_IMAGE_CAPTURE_DELEGATION_OBSERVED";reason="CURRENT_ACTIVITY_CALLER_ACTION_AND_CAMERA_MATCH";}
            else{route="OTHER_APP_OWNS_CAMERA_CALLER_UNPROVEN";reason="DOES_NOT_PROVE_GPT_DELEGATION";}
        }
        m.put("route",route);m.put("reason",reason);m.put("status",route.equals("UNKNOWN")?"BLOCKED":"OBSERVED_NOT_CONTROL_VERIFIED");
        m.put("cameraObservation","TWO_READS_EVALUATED");m.put("stableDuringTwoReads",stable);
        m.put("focusedPackage",KNOWN.contains(f2.pkg)?f2.pkg:"OTHER_REDACTED");
        m.put("focusedActivity",KNOWN.contains(f2.pkg)?f2.activity:null);
        m.put("activeClientPackage",c2.count==0?null:KNOWN.contains(c2.pkg)?c2.pkg:"OTHER_REDACTED");
        m.put("launchedFromChatGPT",f2.caller);m.put("imageCaptureIntent",f2.capture);
        m.put("limits",List.of("SEQUENTIAL_NOT_ATOMIC","OWNER_IS_NOT_EXTERNAL_CONTROL_PERMISSION","MANUFACTURER_FORMAT_MAY_BE_UNSUPPORTED"));
        return m;
    }
    static Map<String,Object> observe(Reader reader)throws Exception{
        long start=System.nanoTime();
        Focus f1=focus(reader.read("activity"));Camera c1=camera(reader.read("camera"));
        Camera c2=camera(reader.read("camera"));Focus f2=focus(reader.read("activity"));
        var m=route(f1,c1,f2,c2);long elapsed=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start);
        m.put("observationDurationMs",elapsed);
        if(elapsed>20000){m.put("route","UNKNOWN");m.put("status","BLOCKED");m.put("reason","OBSERVATION_TOO_SLOW");}
        return m;
    }
    static List<String> command(Path adb,String serial,String operation)throws Blocked{
        if(operation.equals("devices"))return List.of(adb.toString(),"devices");
        if(!Set.of("activity","camera").contains(operation))throw new Blocked("OPERATION_NOT_ALLOWED");
        if(serial==null||!serial.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}"))throw new Blocked("SERIAL_INVALID");
        var args=new ArrayList<>(List.of(adb.toString(),"-s",serial,"shell","dumpsys","-t","5"));
        if(operation.equals("activity"))args.addAll(List.of("activity","activities"));else args.add("media.camera");
        return List.copyOf(args);
    }
    static byte[] bounded(InputStream in)throws IOException{
        var out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
        while((count=in.read(buffer))!=-1){if(out.size()+count>LIMIT)throw new IOException("OUTPUT_LIMIT");out.write(buffer,0,count);}
        return out.toByteArray();
    }
    static String execute(List<String> command)throws Exception{
        Process p=new ProcessBuilder(command).start();
        ExecutorService pool=Executors.newFixedThreadPool(2,r->{Thread t=new Thread(r,"bounded-adb-reader");t.setDaemon(true);return t;});
        try{
            Future<byte[]> stdout=pool.submit(()->bounded(p.getInputStream()));
            Future<byte[]> stderr=pool.submit(()->bounded(p.getErrorStream()));
            if(!p.waitFor(15,TimeUnit.SECONDS))throw new Blocked("ADB_READ_TIMEOUT");
            byte[] output=stdout.get(2,TimeUnit.SECONDS);String errors=new String(stderr.get(2,TimeUnit.SECONDS),StandardCharsets.UTF_8);
            if(p.exitValue()!=0)throw new Blocked("ADB_READ_FAILED");
            if(Pattern.compile("unauthorized|offline|permission denied",Pattern.CASE_INSENSITIVE).matcher(errors).find())throw new Blocked("ADB_NOT_AUTHORIZED_NO_REPAIR");
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output)).toString();
        }finally{if(p.isAlive())p.destroyForcibly();pool.shutdownNow();}
    }
    static Path findAdb(Map<String,String> env,Path root)throws IOException,Blocked{
        List<Path> candidates=new ArrayList<>();
        for(String key:List.of("ANDROID_HOME","ANDROID_SDK_ROOT"))if(env.get(key)!=null&&!env.get(key).isBlank())candidates.add(Path.of(env.get(key),"platform-tools","adb.exe"));
        String home=env.get("USERPROFILE"),local=env.get("LOCALAPPDATA");
        if(local!=null)candidates.add(Path.of(local,"Android","Sdk","platform-tools","adb.exe"));
        if(home!=null)for(String suffix:List.of("Android/Sdk",".jhmcp/android-sdk",".jhmcp57/android-sdk"))candidates.add(Path.of(home,suffix,"platform-tools","adb.exe"));
        for(String part:env.getOrDefault("PATH","").split(Pattern.quote(File.pathSeparator)))if(!part.isBlank())try{Path dir=Path.of(part);if(dir.isAbsolute())candidates.add(dir.resolve("adb.exe"));}catch(InvalidPathException ignored){/* not an executable candidate */}
        Path realRoot=root.toRealPath();
        for(Path candidate:candidates)if(Files.isRegularFile(candidate)){
            Path real=candidate.toRealPath();if(!real.startsWith(realRoot))return real;
        }
        throw new Blocked("EXISTING_ADB_NOT_FOUND");
    }
    static String sha(Path path)throws Exception{
        var digest=MessageDigest.getInstance("SHA-256");try(var in=Files.newInputStream(path)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}return HexFormat.of().formatHex(digest.digest());
    }
    static String json(Object value){
        if(value==null)return "null";
        if(value instanceof Boolean||value instanceof Number)return value.toString();
        if(value instanceof Map<?,?> map){var fields=new ArrayList<String>();map.forEach((k,v)->fields.add(json(k.toString())+":"+json(v)));return "{"+String.join(",",fields)+"}";}
        if(value instanceof Iterable<?> list){var items=new ArrayList<String>();list.forEach(v->items.add(json(v)));return "["+String.join(",",items)+"]";}
        var b=new StringBuilder("\"");for(char c:value.toString().toCharArray()){if(c=='\\'||c=='\"')b.append('\\').append(c);else if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}return b.append('"').toString();
    }
    static void save(Path root,Map<String,Object> report)throws IOException{
        Path logs=root.resolve("logs");Files.createDirectories(logs);
        String id=UUID.randomUUID().toString();Path result=root.resolve("RESULT.txt");
        if(Files.isRegularFile(result))Files.copy(result,logs.resolve("previous-"+id+".txt"));
        String text=json(report)+System.lineSeparator();
        Files.writeString(logs.resolve("RESULT-"+id+".txt"),text,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
        Path temp=root.resolve(".result-"+id+".tmp");Files.writeString(temp,text,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
        try{Files.move(temp,result,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException ex){Files.move(temp,result,StandardCopyOption.REPLACE_EXISTING);}
    }
    static int run(Path root)throws IOException{
        try(FileChannel channel=FileChannel.open(root.resolve(".probe-java.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);FileLock lock=channel.tryLock()){
            if(lock==null){System.out.println("Another check is running; no duplicate read.");return 3;}
            var report=base();boolean phoneRead=false;
            try{
                if(!System.getProperty("os.name","").startsWith("Windows"))throw new Blocked("WINDOWS_REQUIRED");
                Path adb=findAdb(System.getenv(),root);
                String device=serial(execute(command(adb,null,"devices")));
                System.out.println("휴대폰 GPT에서 '사진 찍기' 화면만 열어 주세요. 촬영하거나 확대하지 마세요.");
                System.out.println("준비되면 PC에서 Enter. 사진/대화 본문은 저장하지 않습니다.");
                if(new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8)).readLine()==null)throw new Blocked("USER_INPUT_NOT_CONFIRMED");
                phoneRead=true;report=observe(op->execute(command(adb,device,op)));
                report.put("existingAdbSha256",sha(adb));
            }catch(Blocked ex){report=base();report.put("reason",ex.code);}
             catch(Exception ex){report=base();report.put("reason","READ_FAILED_NO_RAW_DIAGNOSTICS_EXPORTED");}
            report.put("phoneAccessAttempted",phoneRead);report.put("javaVersion",Runtime.version().toString());report.put("observedAtUtc",Instant.now().toString());
            save(root,report);System.out.println("RESULT.txt를 이 대화에 올려 주세요. 보안 설정은 변경하지 않았습니다.");
            return "BLOCKED".equals(report.get("status"))?2:0;
        }
    }
    public static void main(String[] args){
        int exit=2;
        try{if(args.length!=1)throw new IllegalArgumentException();exit=run(Path.of(args[0]).toAbsolutePath().normalize());}
        catch(OverlappingFileLockException ex){System.out.println("Another check is running.");exit=3;}
        catch(Exception ex){System.out.println("RESULT_SAVE_OR_START_FAILED: no policy changes; do not disable protection.");}
        System.exit(exit);
    }
}
