package at.stoicranger.fitness;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The few WebDAV calls Nextcloud sync needs (shared contract v1, 00_docs/SHARED-DB-CONTRACT.md): GET, PUT with
 * If-Match on the ETag, MKCOL, COPY (backups), PROPFIND (list backups) and DELETE (only old backups beyond the newest
 * 30). Plain java.net, no Android classes, so it is tested on the build machine against a WebDAV stand-in.
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
        this.auth = "Basic " + b64((user + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    /** Base64 by hand: the cloud build compiles against an API 23 android.jar, which has no java.util.Base64. */
    static String b64(byte[] d) {
        final String A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int n = (d[i] & 0xff) << 16 | (i + 1 < d.length ? (d[i + 1] & 0xff) << 8 : 0) | (i + 2 < d.length ? d[i + 2] & 0xff : 0);
            b.append(A.charAt(n >> 18 & 63)).append(A.charAt(n >> 12 & 63));
            b.append(i + 1 < d.length ? A.charAt(n >> 6 & 63) : '=').append(i + 2 < d.length ? A.charAt(n & 63) : '=');
        }
        return b.toString();
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

    private Res send(String method, String path, byte[] body, String... headers) {
        Res r = new Res();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url(path)).openConnection();
            if ("PROPFIND".equals(method) || "MKCOL".equals(method) || "COPY".equals(method)) {
                // HttpURLConnection only knows the HTTP/1.1 verbs: set the WebDAV ones through the field it checks
                try {
                    java.lang.reflect.Field f = HttpURLConnection.class.getDeclaredField("method");
                    f.setAccessible(true);
                    f.set(c, method);
                    // the real connection class may wrap another one (Android's OkHttp: "delegate")
                    for (Class<?> k = c.getClass(); k != null; k = k.getSuperclass()) {
                        try { java.lang.reflect.Field d = k.getDeclaredField("delegate"); d.setAccessible(true); Object o = d.get(c);
                            if (o instanceof HttpURLConnection) f.set(o, method); } catch (NoSuchFieldException ignored) { }
                    }
                } catch (Exception e) {
                    c.setRequestMethod("POST");
                    c.setRequestProperty("X-HTTP-Method-Override", method);
                }
            } else c.setRequestMethod(method);
            c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs);
            c.setRequestProperty("Authorization", auth);
            c.setRequestProperty("OCS-APIRequest", "true");
            for (int i = 0; i + 1 < headers.length; i += 2) c.setRequestProperty(headers[i], headers[i + 1]);
            if (body != null) {
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            r.status = c.getResponseCode();
            String e = c.getHeaderField("ETag");
            if (e == null) e = c.getHeaderField("OC-ETag");
            r.etag = e == null ? "" : e;
            InputStream is = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (is != null) try (InputStream in = is) { r.body = readAll(in); }
        } catch (IOException e) {
            r.status = 0; r.error = String.valueOf(e.getMessage());
        } finally { if (c != null) c.disconnect(); }
        return r;
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
