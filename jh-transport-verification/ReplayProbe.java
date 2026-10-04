import com.squareup.okhttp.OkHttpClient;
import com.squareup.okhttp.OkUrlFactory;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Upstream OkHttp 2.7.5 surrogate, NOT a Samsung/Android on-device test. */
public final class ReplayProbe {
  static String hex(byte[] b) {
    StringBuilder s = new StringBuilder();
    for (byte x : b) s.append(String.format("%02x", x & 255));
    return s.toString();
  }
  static String sign(byte[] key, String value) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(key, "HmacSHA256"));
    return hex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
  }
  static final class Fixture implements AutoCloseable {
    final ServerSocket server;
    final byte[] key = new byte[32];
    final Set<String> seen = new HashSet<>();
    final AtomicInteger wireRequests = new AtomicInteger();
    final AtomicInteger accepted = new AtomicInteger();
    final AtomicInteger replayRejected = new AtomicInteger();
    final AtomicInteger badMacRejected = new AtomicInteger();
    final AtomicBoolean closed = new AtomicBoolean();
    final boolean dropFirst;
    final Thread worker;
    volatile Throwable failure;
    Fixture(boolean drop) throws Exception {
      dropFirst = drop;
      new SecureRandom().nextBytes(key);
      server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
      server.setSoTimeout(250);
      worker = new Thread(() -> run(), "synthetic-loopback-server");
      worker.setDaemon(true);
      worker.start();
    }
    void run() {
      while (!closed.get()) {
        try (Socket socket = server.accept()) {
          socket.setSoTimeout(2000);
          BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
          while (!closed.get()) {
            String line = reader.readLine();
            if (line == null) break;
            String path = line.split(" ")[1];
            Map<String,String> headers = new HashMap<>();
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
              int i = line.indexOf(':');
              if (i > 0) headers.put(line.substring(0,i).toLowerCase(Locale.ROOT), line.substring(i+1).trim());
            }
            int status = 200;
            if (path.equals("/poll")) {
              int requestNumber = wireRequests.incrementAndGet();
              String nonce = headers.getOrDefault("x-fixture-nonce", "");
              String proof = headers.getOrDefault("x-fixture-mac", "");
              if (!MessageDigest.isEqual(sign(key,nonce).getBytes(StandardCharsets.US_ASCII),proof.getBytes(StandardCharsets.US_ASCII))) {
                status=401; badMacRejected.incrementAndGet();
              } else if (!seen.add(nonce)) {
                status=401; replayRejected.incrementAndGet();
              } else {
                status=204; accepted.incrementAndGet();
              }
              if (dropFirst && requestNumber==1) break;
            }
            String message = "HTTP/1.1 "+status+" "+(status==401?"Unauthorized":"OK")+"\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n";
            socket.getOutputStream().write(message.getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().flush();
          }
        } catch (SocketTimeoutException ignored) {
        } catch (SocketException e) { if (!closed.get()) failure=e;
        } catch (Throwable t) { failure=t; }
      }
    }
    URL url(String path) throws Exception { return new URL("http://127.0.0.1:"+server.getLocalPort()+path); }
    public void close() throws Exception {
      closed.set(true); server.close(); worker.join(3000); Arrays.fill(key,(byte)0);
      if (worker.isAlive()) throw new AssertionError("fixture did not terminate");
      if (failure!=null) throw new AssertionError("fixture error",failure);
    }
  }
  static int get(OkUrlFactory factory, Fixture fixture, String path, String nonce, boolean badMac) throws Exception {
    HttpURLConnection c = factory.open(fixture.url(path));
    c.setConnectTimeout(2000); c.setReadTimeout(2000); c.setInstanceFollowRedirects(false); c.setUseCaches(false);
    if (nonce!=null) {
      c.setRequestProperty("x-fixture-nonce",nonce);
      c.setRequestProperty("x-fixture-mac",badMac?String.join("",Collections.nCopies(64,"0")):sign(fixture.key,nonce));
    }
    try {
      int status=c.getResponseCode();
      InputStream in=status>=400?c.getErrorStream():c.getInputStream();
      if (in!=null) in.close();
      return status;
    } finally { c.disconnect(); }
  }
  static void scenario(boolean warm, boolean drop, boolean retry) throws Exception {
    try (Fixture fixture=new Fixture(drop)) {
      OkHttpClient client=new OkHttpClient();
      client.setRetryOnConnectionFailure(retry);
      client.setConnectTimeout(2,TimeUnit.SECONDS); client.setReadTimeout(2,TimeUnit.SECONDS);
      OkUrlFactory factory=new OkUrlFactory(client);
      if (warm && get(factory,fixture,"/warm",null,false)!=200) throw new AssertionError("warm failed");
      String nonce=UUID.randomUUID().toString();
      Integer status=null; String exception=null;
      try { status=get(factory,fixture,"/poll",nonce,false); }
      catch (IOException e) { exception=e.getClass().getSimpleName(); }
      if (!drop && (status==null || status!=204 || fixture.wireRequests.get()!=1)) throw new AssertionError("healthy request failed");
      if (drop && !retry && (fixture.wireRequests.get()!=1 || status!=null)) throw new AssertionError("no-retry dispatch was repeated");
      if (fixture.wireRequests.get()>1 && (fixture.replayRejected.get()!=1 || status==null || status!=401)) throw new AssertionError("duplicate not rejected");
      if (fixture.accepted.get()!=1) throw new AssertionError("more than one nonce acceptance");
      System.out.println("{\"kind\":\"transport_probe\",\"scope\":\"upstream JVM surrogate; not Android device\",\"warm\":"+warm+",\"dropReply\":"+drop+",\"automaticRetry\":"+retry+",\"applicationPollCalls\":1,\"wirePollRequests\":"+fixture.wireRequests.get()+",\"nonceAcceptances\":"+fixture.accepted.get()+",\"replayRejections\":"+fixture.replayRejected.get()+",\"status\":"+status+",\"exception\":"+(exception==null?"null":"\""+exception+"\"")+"}");
    }
  }
  public static void main(String[] args) throws Exception {
    scenario(false,false,true); scenario(true,false,true);
    scenario(false,true,true); scenario(true,true,true);
    scenario(false,true,false); scenario(true,true,false);
    try (Fixture fixture=new Fixture(false)) {
      OkHttpClient client=new OkHttpClient();
      client.setRetryOnConnectionFailure(false);
      OkUrlFactory factory=new OkUrlFactory(client);
      String n=UUID.randomUUID().toString();
      if (get(factory,fixture,"/poll",n,true)!=401 || get(factory,fixture,"/poll",n,false)!=204 || get(factory,fixture,"/poll",n,false)!=401 || get(factory,fixture,"/poll",UUID.randomUUID().toString(),false)!=204) throw new AssertionError("synthetic authentication boundary changed");
      System.out.println("{\"kind\":\"auth_boundary\",\"badMacRejected\":true,\"validAccepted\":true,\"replayRejected\":true,\"newNonceAccepted\":true,\"phoneOperations\":0}");
    }
    System.out.println("PROBE_COMPLETED scenarios=7 phoneOperations=0 deployment=0");
  }
}
