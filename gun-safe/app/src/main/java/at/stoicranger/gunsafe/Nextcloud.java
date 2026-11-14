package at.stoicranger.gunsafe;

import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal WebDAV client for a Nextcloud account (shared contract 00_docs/SHARED-DB-CONTRACT.md, section B).
 * Only what the sync needs: GET (with ETag), PUT with If-Match / If-None-Match, MKCOL, PROPFIND depth 1 (list a
 * folder), DELETE (old backups). Files live under https://host/remote.php/dav/files/USER/PATH.
 * Plain java.net, no libraries, no lambdas (the cloud build uses dx). Every call blocks: run it off the UI thread.
 * Reusable as is by the other Stoic Ranger apps (copy the file, change the package line).
 */
public final class Nextcloud {
    public static final class Result {
        public int status;          // HTTP status, 0 = no connection
        public String etag = "";    // ETag of the file after GET or PUT
        public byte[] body;         // GET: the file
        public String error = "";   // readable reason when status is 0 or >= 400
        public List<String> names;  // PROPFIND: names in the folder
        public boolean ok() { return status >= 200 && status < 300; }
    }

    private final String base;      // https://host/remote.php/dav/files/user
    private final String user, password;

    public Nextcloud(String url, String user, String password) {
        String u = url == null ? "" : url.trim();
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        this.base = u + "/remote.php/dav/files/" + enc(user == null ? "" : user.trim());
        this.user = user == null ? "" : user.trim();
        this.password = password == null ? "" : password;
    }

    /** "Stoic Ranger/backups/x.xlsx" → each segment URL-encoded, "/" kept. */
    static String encPath(String path) {
        StringBuilder b = new StringBuilder();
        for (String seg : path.split("/")) {
            if (seg.isEmpty()) continue;
            b.append('/').append(enc(seg));
        }
        return b.toString();
    }

    static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return s; }
    }

    public Result get(String path) { return request("GET", path, null, null, null, null); }

    /** ifMatch: upload only if the file still has this ETag (412 otherwise). Empty ifMatch + createOnly: only if it does not exist yet. */
    public Result put(String path, byte[] data, String ifMatch, boolean createOnly) {
        return request("PUT", path, data, ifMatch, createOnly ? "*" : null, null);
    }

    public Result mkcol(String path) { return request("MKCOL", path, null, null, null, null); }

    public Result delete(String path) { return request("DELETE", path, null, null, null, null); }

    /** Makes every folder of the path (MKCOL answers 405 when a folder already exists; that is fine). */
    public Result mkdirs(String folder) {
        Result last = new Result(); last.status = 200;
        StringBuilder p = new StringBuilder();
        for (String seg : folder.split("/")) {
            if (seg.isEmpty()) continue;
            p.append(seg).append('/');
            Result r = mkcol(p.toString());
            if (r.status == 0 || r.status == 401 || r.status == 403) return r;
            last = r;
        }
        if (last.status == 405) last.status = 200;
        return last;
    }

    public Result list(String folder) {
        String body = "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname/></d:prop></d:propfind>";
        Result r = request("PROPFIND", folder.endsWith("/") ? folder : folder + "/", body.getBytes(StandardCharsets.UTF_8), null, null, "1");
        if (r.status == 207) {
            r.names = new ArrayList<String>();
            String xml = r.body == null ? "" : new String(r.body, StandardCharsets.UTF_8);
            Matcher m = Pattern.compile("<(?:[a-zA-Z]+:)?href>([^<]*)</(?:[a-zA-Z]+:)?href>").matcher(xml);
            boolean first = true;
            while (m.find()) {
                if (first) { first = false; continue; }           // the folder itself
                String h = m.group(1);
                if (h.endsWith("/")) continue;                     // sub-folders
                String n = h.substring(h.lastIndexOf('/') + 1);
                try { n = java.net.URLDecoder.decode(n, "UTF-8"); } catch (Exception ignored) { }
                r.names.add(n);
            }
            r.body = null;
        }
        return r;
    }

    private Result request(String method, String path, byte[] data, String ifMatch, String ifNoneMatch, String depth) {
        Result r = new Result();
        HttpURLConnection c = null;
        try {
            if (!base.startsWith("https://")) { r.error = "The Nextcloud address must start with https://"; return r; }
            c = (HttpURLConnection) new URL(base + encPath(path) + (path.endsWith("/") ? "/" : "")).openConnection();
            setMethod(c, method);
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            String auth = Base64.encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            c.setRequestProperty("Authorization", "Basic " + auth);
            c.setRequestProperty("OCS-APIRequest", "true");
            if (ifMatch != null && !ifMatch.isEmpty()) c.setRequestProperty("If-Match", ifMatch);
            if (ifNoneMatch != null) c.setRequestProperty("If-None-Match", ifNoneMatch);
            if (depth != null) c.setRequestProperty("Depth", depth);
            if (data != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "PROPFIND".equals(method) ? "application/xml; charset=utf-8"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                c.setFixedLengthStreamingMode(data.length);
                OutputStream os = c.getOutputStream();
                try { os.write(data); } finally { os.close(); }
            }
            r.status = c.getResponseCode();
            String et = c.getHeaderField("ETag");
            if (et == null) et = c.getHeaderField("OC-ETag");
            r.etag = et == null ? "" : et;
            InputStream is = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] body = is == null ? new byte[0] : readAll(is);
            if (r.status >= 200 && r.status < 300) r.body = body;
            else r.error = reason(r.status);
        } catch (java.net.UnknownHostException e) {
            r.status = 0; r.error = "Nextcloud not reachable (no internet, or a wrong address)";
        } catch (javax.net.ssl.SSLException e) {
            r.status = 0; r.error = "Secure connection failed: " + e.getMessage();
        } catch (IOException e) {
            r.status = 0; r.error = "Connection failed: " + e.getMessage();
        } catch (Exception e) {
            r.status = 0; r.error = String.valueOf(e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }

    static String reason(int s) {
        switch (s) {
            case 401: return "User name or app password not accepted";
            case 403: return "Nextcloud refused access to this folder";
            case 404: return "Not found";
            case 409: return "The folder does not exist on Nextcloud";
            case 412: return "The file was changed meanwhile";
            case 423: return "The file is locked on Nextcloud";
            case 507: return "Nextcloud storage is full";
            default: return s >= 300 && s < 400 ? "Nextcloud redirected the request: check the address" : "Nextcloud answered " + s;
        }
    }

    /** HttpURLConnection only knows the classic verbs; WebDAV needs PROPFIND and MKCOL. Set the field directly
     *  (also on the wrapped connection that Android uses for https). */
    static void setMethod(HttpURLConnection c, String method) throws Exception {
        try { c.setRequestMethod(method); return; } catch (ProtocolException ignored) { }
        Field f = HttpURLConnection.class.getDeclaredField("method");
        f.setAccessible(true);
        f.set(c, method);
        Object inner = c;
        for (Class<?> k = c.getClass(); k != null; k = k.getSuperclass()) {
            try {
                Field d = k.getDeclaredField("delegate");
                d.setAccessible(true);
                inner = d.get(c);
                break;
            } catch (NoSuchFieldException ignored) { }
        }
        if (inner != c && inner instanceof HttpURLConnection) f.set(inner, method);
    }

    static byte[] readAll(InputStream is) throws IOException {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536]; int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } finally { is.close(); }
    }
}
