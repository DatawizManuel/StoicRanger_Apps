package at.stoicranger.dailythoughts;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * The few WebDAV calls Nextcloud sync needs (shared contract v1, 00_docs/SHARED-DB-CONTRACT.md): GET, PUT with
 * If-Match on the ETag, MKCOL, COPY (backups), PROPFIND (list backups) and DELETE (only old backups beyond the newest
 * 30). Plain Java, no Android classes, so it is tested on the build machine against a WebDAV stand-in and a real
 * Nextcloud (tools/test-nextcloud.sh). 0.3.1: raw HTTP/1.1 over TLS instead of HttpURLConnection + reflection.
 * Base URL: https://host[/nextcloud]/remote.php/dav/files/<user>/ ; paths below it are '/'-separated, unencoded.
 */
public class WebDav {
    public static class Res {
        public int status; public String etag = ""; public byte[] body = new byte[0]; public String error = "";
        public boolean ok() { return status >= 200 && status < 300; }
    }

    private final String base, auth;
    public int timeoutMs = 20000;

    public WebDav(String serverUrl, String user, String password) {
        String s = serverUrl.trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (!s.contains("/remote.php/")) s = s + "/remote.php/dav/files/" + enc(user);
        this.base = s + "/";
        this.auth = "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    static String enc(String seg) {
        try { return URLEncoder.encode(seg, "UTF-8").replace("+", "%20"); } catch (Exception e) { return seg; }
    }
    /** "Stoic Ranger/backups/x.xlsx" → "Stoic%20Ranger/backups/x.xlsx" */
    public String url(String path) {
        StringBuilder b = new StringBuilder(base);
        boolean first = true;
        for (String p : path.split("/")) {
            if (p.isEmpty()) continue;
            if (!first) b.append('/');
            b.append(enc(p)); first = false;
        }
        if (path.endsWith("/") && !first) b.append('/');
        return b.toString();
    }

    /** Plain http only for the WebDAV stand-in in the tests; the app itself always needs https. */
    public boolean allowPlainHttp = false;
    /** On Android the default host name verifier checks the certificate (on the desktop JVM it refuses everything). */
    private static final boolean ANDROID = String.valueOf(System.getProperty("java.vendor")).toLowerCase(Locale.ROOT).contains("android");

    /**
     * One request as raw HTTP/1.1 over TLS (0.3.1, like SR Shooting 1.3.1): HttpURLConnection knows no WebDAV verbs, and
     * forcing them in by reflection is not reliable on every Android/Java version. The certificate must match the host.
     */
    private Res send(String method, String path, byte[] body, String... headers) {
        return sendUrl(method, url(path), body, 0, headers);
    }

    private Res sendUrl(String method, String url, byte[] body, int hops, String... headers) {
        Res r = new Res();
        Socket raw = null;
        try {
            URI u = new URI(url);
            boolean tls = "https".equalsIgnoreCase(u.getScheme());
            if (!tls && !(allowPlainHttp && "http".equalsIgnoreCase(u.getScheme()))) throw new IOException("The Nextcloud address must start with https://");
            String host = u.getHost();
            int port = u.getPort() > 0 ? u.getPort() : (tls ? 443 : 80);
            raw = new Socket();
            raw.connect(new InetSocketAddress(host, port), timeoutMs);
            raw.setSoTimeout(timeoutMs);
            Socket s = raw;
            if (tls) {
                SSLSocket ss = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, host, port, true);
                SSLParameters sp = ss.getSSLParameters();
                sp.setEndpointIdentificationAlgorithm("HTTPS");     // the certificate must be for this host name
                ss.setSSLParameters(sp);
                ss.startHandshake();
                if (ANDROID && !HttpsURLConnection.getDefaultHostnameVerifier().verify(host, ss.getSession()))
                    throw new IOException("The certificate does not match " + host);
                s = ss;
            }
            StringBuilder q = new StringBuilder();
            String p = u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath();
            q.append(method).append(' ').append(p).append(u.getRawQuery() != null ? "?" + u.getRawQuery() : "").append(" HTTP/1.1\r\n");
            q.append("Host: ").append(host).append(u.getPort() > 0 ? ":" + u.getPort() : "").append("\r\n");
            q.append("User-Agent: StoicRangerDailyThoughts\r\nConnection: close\r\nAccept-Encoding: identity\r\n");
            q.append("Authorization: ").append(auth).append("\r\nOCS-APIRequest: true\r\n");
            for (int i = 0; i + 1 < headers.length; i += 2) q.append(headers[i]).append(": ").append(headers[i + 1]).append("\r\n");
            q.append("Content-Length: ").append(body == null ? 0 : body.length).append("\r\n\r\n");
            OutputStream os = s.getOutputStream();
            os.write(q.toString().getBytes(StandardCharsets.UTF_8));
            if (body != null) os.write(body);
            os.flush();
            InputStream is = s.getInputStream();
            String status = line(is);
            int code;
            for (;;) {                                   // "100 Continue" and other 1xx answers come before the real one
                String[] parts = status.split(" ");
                code = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
                if (code < 100 || code >= 200) break;
                while (!line(is).isEmpty()) { }
                status = line(is);
            }
            Map<String, String> hs = new HashMap<>();
            for (String l = line(is); !l.isEmpty(); l = line(is)) {
                int i = l.indexOf(':');
                if (i > 0) hs.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            }
            byte[] data;
            if ("HEAD".equals(method) || code == 204 || code == 304) data = new byte[0];
            else if ("chunked".equalsIgnoreCase(hs.get("transfer-encoding"))) data = chunked(is);
            else if (hs.containsKey("content-length")) data = exactly(is, Integer.parseInt(hs.get("content-length")));
            else data = readAll(is);
            if ((code == 301 || code == 302 || code == 307 || code == 308) && hops < 3 && hs.containsKey("location")) {
                raw.close(); raw = null;
                return sendUrl(method, u.resolve(hs.get("location")).toString(), body, hops + 1, headers);
            }
            r.status = code;
            String e = hs.get("etag");
            if (e == null) e = hs.get("oc-etag");
            r.etag = e == null ? "" : e;
            r.body = data;
        } catch (Exception e) {
            r.status = 0; r.error = e.getMessage() == null ? e.toString() : e.getMessage();
        } finally {
            if (raw != null) try { raw.close(); } catch (IOException ignored) { }
        }
        return r;
    }

    private static String line(InputStream is) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = is.read()) != -1) { if (c == '\n') break; if (c != '\r') b.write(c); }
        return new String(b.toByteArray(), StandardCharsets.ISO_8859_1);
    }
    private static byte[] exactly(InputStream is, int n) throws IOException {
        byte[] b = new byte[n];
        int off = 0;
        while (off < n) { int k = is.read(b, off, n - off); if (k < 0) throw new IOException("The answer from Nextcloud was cut off (" + off + " of " + n + " bytes)."); off += k; }
        return b;
    }
    private static byte[] chunked(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (;;) {
            String l = line(is).trim();
            int semi = l.indexOf(';');
            int n = Integer.parseInt(semi >= 0 ? l.substring(0, semi) : l, 16);
            if (n == 0) { while (!line(is).isEmpty()) { } break; }
            out.write(exactly(is, n));
            line(is);
        }
        return out.toByteArray();
    }

    public Res get(String path) { return send("GET", path, null); }

    /** ifMatch = the ETag the merge was based on; null with ifNoneMatch = create only if the file does not exist yet. */
    public Res put(String path, byte[] data, String ifMatch) {
        String ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (ifMatch == null || ifMatch.isEmpty()) return send("PUT", path, data, "Content-Type", ct, "If-None-Match", "*");
        return send("PUT", path, data, "Content-Type", ct, "If-Match", ifMatch);
    }

    /** Makes every folder of the path (201 made, 405 already there). */
    public boolean mkdirs(String folder) {
        StringBuilder p = new StringBuilder();
        for (String s : folder.split("/")) {
            if (s.isEmpty()) continue;
            p.append(s).append('/');
            Res r = send("MKCOL", p.toString(), null);
            if (!(r.ok() || r.status == 405)) return false;
        }
        return true;
    }

    public Res copy(String from, String to) { return send("COPY", from, null, "Destination", url(to), "Overwrite", "F"); }
    /** Puts a backup back in place (0.3.1: after an upload that did not arrive intact). */
    public Res copyOver(String from, String to) { return send("COPY", from, null, "Destination", url(to), "Overwrite", "T"); }

    public Res delete(String path) { return send("DELETE", path, null); }

    private static final Pattern HREF = Pattern.compile("<(?:[a-zA-Z]+:)?href>([^<]+)</(?:[a-zA-Z]+:)?href>");
    /** Names of the files directly in a folder (PROPFIND depth 1). */
    public List<String> list(String folder) {
        List<String> out = new ArrayList<>();
        byte[] q = "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:getetag/></d:prop></d:propfind>".getBytes(StandardCharsets.UTF_8);
        Res r = send("PROPFIND", folder.endsWith("/") ? folder : folder + "/", q, "Depth", "1", "Content-Type", "application/xml");
        if (r.status != 207) return out;
        Matcher m = HREF.matcher(new String(r.body, StandardCharsets.UTF_8));
        while (m.find()) {
            String h = m.group(1);
            if (h.endsWith("/")) continue;                 // the folder itself and sub-folders
            String n = h.substring(h.lastIndexOf('/') + 1);
            try { n = URLDecoder.decode(n, "UTF-8"); } catch (Exception ignored) { }
            out.add(n);
        }
        return out;
    }

    static byte[] readAll(InputStream is) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }
}
