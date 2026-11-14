package at.rangebook.app;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Stoic Ranger Shooting 1.3.1 — the HTTP part of the Nextcloud sync, in plain Java (no Android classes), so the same
 * code is tested on the desktop JVM against a real Nextcloud (tools/test-nextcloud.sh).
 * Raw HTTP/1.1 over TLS, because HttpURLConnection does not allow the WebDAV methods (PROPFIND, MKCOL, COPY).
 * Only https; the host name is checked like HttpsURLConnection does. No lambdas (the cloud dx build crashes on them).
 */
final class DavHttp {
    private DavHttp() { }
    /** On Android the default host name verifier checks the certificate (on the desktop JVM it refuses everything). */
    private static final boolean ANDROID = String.valueOf(System.getProperty("java.vendor")).toLowerCase(Locale.ROOT).contains("android");

    /** WebDAV address of a name inside the folder ("" = the folder itself, "backups/x.xlsx" …). */
    static String urlOf(String base, String user, String folder, String name) throws Exception {
        String b = base.trim().replaceAll("/+$", "");
        if (!b.contains("/remote.php/")) b += "/remote.php/dav/files/" + enc(user);
        StringBuilder u = new StringBuilder(b);
        for (String seg : (folder + "/" + name).split("/")) if (!seg.isEmpty()) u.append('/').append(enc(seg));
        if (name.isEmpty()) u.append('/');
        return u.toString();
    }
    private static String enc(String s) throws Exception { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); }

    /**
     * One request inside the folder. headers: JSON object; "X-Dest-Name" becomes an absolute Destination.
     * Returns {status, headers:{lower-case name: value}, body: base64} or {status:0, error}.
     */
    static String call(String base, String user, String folder, String pw, String method, String name, String headersJson, String bodyB64) {
        JSONObject out = new JSONObject();
        try {
            if (base == null || base.isEmpty() || user == null || user.isEmpty()) { out.put("status", 0); out.put("error", "Nextcloud is not set up."); return out.toString(); }
            Map<String, String> h = new LinkedHashMap<>();
            JSONObject hj = headersJson == null || headersJson.isEmpty() ? new JSONObject() : new JSONObject(headersJson);
            for (Iterator<String> it = hj.keys(); it.hasNext(); ) { String k = it.next(); h.put(k, hj.optString(k)); }
            if (h.containsKey("X-Dest-Name")) h.put("Destination", urlOf(base, user, folder, h.remove("X-Dest-Name")));
            h.put("Authorization", "Basic " + Base64.getEncoder().encodeToString((user + ":" + (pw == null ? "" : pw)).getBytes(StandardCharsets.UTF_8)));
            byte[] body = bodyB64 == null || bodyB64.isEmpty() ? null : Base64.getMimeDecoder().decode(bodyB64);
            return send(method, urlOf(base, user, folder, name), h, body, 0).toString();
        } catch (Exception e) {
            try { out.put("status", 0); out.put("error", e.getMessage() == null ? e.toString() : e.getMessage()); } catch (Exception ignored) { }
            return out.toString();
        }
    }

    static JSONObject send(String method, String url, Map<String, String> headers, byte[] body, int hops) throws Exception {
        URI u = new URI(url);
        if (!"https".equalsIgnoreCase(u.getScheme())) throw new Exception("The Nextcloud address must start with https://");
        String host = u.getHost();
        int port = u.getPort() > 0 ? u.getPort() : 443;
        Socket raw = new Socket();
        raw.connect(new InetSocketAddress(host, port), 8000);
        raw.setSoTimeout(30000);
        SSLSocket s = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, host, port, true);
        try {
            SSLParameters sp0 = s.getSSLParameters();
            sp0.setEndpointIdentificationAlgorithm("HTTPS");      // the certificate must be for this host name
            s.setSSLParameters(sp0);
            s.startHandshake();
            if (ANDROID && !HttpsURLConnection.getDefaultHostnameVerifier().verify(host, s.getSession())) throw new Exception("The certificate does not match " + host);
            StringBuilder req = new StringBuilder();
            String path = u.getRawPath() + (u.getRawQuery() != null ? "?" + u.getRawQuery() : "");
            req.append(method).append(' ').append(path.isEmpty() ? "/" : path).append(" HTTP/1.1\r\n");
            req.append("Host: ").append(host).append(u.getPort() > 0 ? ":" + u.getPort() : "").append("\r\n");
            req.append("User-Agent: StoicRangerShooting\r\nConnection: close\r\nAccept-Encoding: identity\r\n");
            for (Map.Entry<String, String> e : headers.entrySet()) req.append(e.getKey()).append(": ").append(e.getValue()).append("\r\n");
            req.append("Content-Length: ").append(body == null ? 0 : body.length).append("\r\n\r\n");
            OutputStream os = s.getOutputStream();
            os.write(req.toString().getBytes(StandardCharsets.UTF_8));
            if (body != null) os.write(body);
            os.flush();
            InputStream is = s.getInputStream();
            String status = line(is);
            int code = 0;
            for (;;) {                                        // "100 Continue" and other 1xx answers come before the real one
                String[] sp = status.split(" ");
                code = sp.length > 1 ? Integer.parseInt(sp[1]) : 0;
                if (code < 100 || code >= 200) break;
                while (!line(is).isEmpty()) { }
                status = line(is);
            }
            JSONObject hs = new JSONObject();
            for (String l = line(is); !l.isEmpty(); l = line(is)) {
                int i = l.indexOf(':');
                if (i > 0) hs.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            }
            byte[] data;
            if ("HEAD".equals(method) || code == 204 || code == 304) data = new byte[0];
            else if ("chunked".equalsIgnoreCase(hs.optString("transfer-encoding"))) data = chunked(is);
            else if (hs.has("content-length")) data = exactly(is, Integer.parseInt(hs.optString("content-length")));
            else data = readAll(is);
            if ((code == 301 || code == 302 || code == 307 || code == 308) && hops < 3 && hs.has("location"))
                return send(method, u.resolve(hs.optString("location")).toString(), headers, body, hops + 1);
            JSONObject o = new JSONObject();
            o.put("status", code);
            o.put("headers", hs);
            o.put("body", Base64.getEncoder().encodeToString(data));
            return o;
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }
    private static String line(InputStream is) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = is.read()) != -1) { if (c == '\n') break; if (c != '\r') b.write(c); }
        return new String(b.toByteArray(), StandardCharsets.ISO_8859_1);
    }
    private static byte[] exactly(InputStream is, int n) throws Exception {
        byte[] b = new byte[n];
        int off = 0;
        while (off < n) { int r = is.read(b, off, n - off); if (r < 0) throw new Exception("The answer from Nextcloud was cut off (" + off + " of " + n + " bytes)."); off += r; }
        return b;
    }
    private static byte[] readAll(InputStream is) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int r;
        while ((r = is.read(b)) > 0) out.write(b, 0, r);
        return out.toByteArray();
    }
    private static byte[] chunked(InputStream is) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        while (true) {
            String l = line(is).trim();
            int semi = l.indexOf(';');
            int n = Integer.parseInt(semi >= 0 ? l.substring(0, semi) : l, 16);
            if (n == 0) { while (!line(is).isEmpty()) { } break; }
            out.write(exactly(is, n));
            line(is);
        }
        return out.toByteArray();
    }
}
