import com.squareup.okhttp.OkHttpClient;
import com.squareup.okhttp.OkUrlFactory;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Public-library JVM surrogate; no Android device calls. Input is an ephemeral local fixture. */
public final class RealServerReplay {
  static String hmac(byte[] key, String s) throws Exception {
    Mac m=Mac.getInstance("HmacSHA256"); m.init(new SecretKeySpec(key,"HmacSHA256"));
    StringBuilder b=new StringBuilder();
    for(byte x:m.doFinal(s.getBytes(StandardCharsets.UTF_8)))b.append(String.format("%02x",x&255));
    return b.toString();
  }
  static int receive(HttpURLConnection c) throws IOException {
    try {
      int status=c.getResponseCode(); InputStream in=status>=400?c.getErrorStream():c.getInputStream();
      if(in!=null)try(InputStream body=in){while(body.read()!=-1){}}
      return status;
    }finally{c.disconnect();}
  }
  public static void main(String[] args) throws Exception {
    Properties p=new Properties();try(InputStream in=Files.newInputStream(Path.of(args[0]))){p.load(in);}
    String base=p.getProperty("base");URI uri=URI.create(base);
    if(!uri.getScheme().equals("http")||!uri.getHost().equals("127.0.0.1")||uri.getRawUserInfo()!=null)throw new SecurityException("Only local synthetic server allowed");
    byte[] key=Base64.getUrlDecoder().decode(p.getProperty("secret"));
    try{
      OkHttpClient client=new OkHttpClient();client.setRetryOnConnectionFailure(Boolean.parseBoolean(args[1]));
      OkUrlFactory factory=new OkUrlFactory(client);
      HttpURLConnection warm=factory.open(new URL(base+"/health"));warm.setConnectTimeout(2000);warm.setReadTimeout(2000);
      if(receive(warm)!=200)throw new AssertionError("warmup failed");
      String sid=p.getProperty("sid"),dev=p.getProperty("digest"),nonce=UUID.randomUUID().toString();
      long exp=System.currentTimeMillis()+30000;
      HttpURLConnection c=factory.open(new URL(base+"/device/poll?deviceId="+URLEncoder.encode(p.getProperty("id"),"UTF-8")));
      c.setConnectTimeout(2000);c.setReadTimeout(2000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);
      c.setRequestProperty("x-jh-session",sid);c.setRequestProperty("x-jh-device",dev);
      c.setRequestProperty("x-jh-nonce",nonce);c.setRequestProperty("x-jh-expires",Long.toString(exp));
      c.setRequestProperty("x-jh-mac",hmac(key,"poll|"+sid+"|"+dev+"|"+nonce+"|"+exp));
      Integer status=null;String error=null;
      try{status=receive(c);}catch(IOException e){error=e.getClass().getSimpleName();}
      System.out.println("{\"applicationPollCalls\":1,\"status\":"+status+",\"exception\":"+(error==null?"null":"\""+error+"\"")+"}");
    }finally{Arrays.fill(key,(byte)0);p.clear();}
  }
}
