package at.stoicranger.fieldkit;

import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Minimal WebDAV client for Nextcloud (https only): GET, PUT (with If-Match / If-None-Match), MKCOL, PROPFIND,
 * DELETE. Paths are relative to the user's files: https://host/remote.php/dav/files/<user>/<path>. Only the address
 * saved in SyncStore is ever contacted. HttpURLConnection does not allow MKCOL/PROPFIND, so the method field is set
 * directly (it is a protected field of java.net.HttpURLConnection).
 */
final class NcClient {
    private NcClient() { }

    static String davUrl(String base, String user, String path) throws Exception {
        StringBuilder b = new StringBuilder(base).append("/remote.php/dav/files/").append(enc(user));
        for (String seg : path.split("/")) if (!seg.isEmpty()) b.append('/').append(enc(seg));
        if (path.endsWith("/")) b.append('/');
        return b.toString();
    }
    private static String enc(String s) throws Exception { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); }

    /** → {status, etag, body (base64), error} */
    static JSONObject request(JSONObject cfg, String method, String path, byte[] body, String ifMatch, String depth) {
        JSONObject out = new JSONObject();
        HttpURLConnection c = null;
        try {
            String base = cfg.optString("url"), user = cfg.optString("user"), pw = cfg.optString("password");
            if (!base.startsWith("https://")) throw new Exception("The Nextcloud address must start with https://");
            if (user.isEmpty() || pw.isEmpty()) throw new Exception("User name or app password missing");
            c = (HttpURLConnection) new URL(davUrl(base, user, path)).openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(false);
            setMethod(c, method);
            c.setRequestProperty("Authorization", "Basic " + Base64.encodeToString((user + ":" + pw).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            c.setRequestProperty("OCS-APIRequest", "true");
            if (ifMatch != null && !ifMatch.isEmpty()) {
                if ("*new*".equals(ifMatch)) c.setRequestProperty("If-None-Match", "*");
                else c.setRequestProperty("If-Match", ifMatch);
            }
            if (depth != null) c.setRequestProperty("Depth", depth);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "PROPFIND".equals(method) ? "application/xml; charset=utf-8" : "application/octet-stream");
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            int st = c.getResponseCode();
            out.put("status", st);
            String et = c.getHeaderField("ETag"); if (et == null) et = c.getHeaderField("OC-ETag");
            out.put("etag", et == null ? "" : et);
            InputStream is = st >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] data = new byte[0];
            if (is != null) { try (InputStream in = is) { data = readAll(in); } }
            if ("GET".equals(method) || "PROPFIND".equals(method)) out.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
        } catch (Exception e) {
            try { out.put("status", 0).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        } finally {
            if (c != null) c.disconnect();
        }
        return out;
    }

    /** Progress of a download; return false to stop it. */
    interface Progress { boolean step(long done, long total); }

    /** Streams one file from Nextcloud into out (a .part file), with its SHA-256. → {status, bytes, sha256, error} */
    static JSONObject download(JSONObject cfg, String path, java.io.File out, Progress p) {
        JSONObject r = new JSONObject();
        HttpURLConnection c = null;
        try {
            String base = cfg.optString("url"), user = cfg.optString("user"), pw = cfg.optString("password");
            if (!base.startsWith("https://")) throw new Exception("Set up your Nextcloud first (⋯ › Where your data is stored).");
            if (user.isEmpty() || pw.isEmpty()) throw new Exception("User name or app password missing");
            c = (HttpURLConnection) new URL(davUrl(base, user, path)).openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(60000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Authorization", "Basic " + Base64.encodeToString((user + ":" + pw).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            int st = c.getResponseCode();
            r.put("status", st);
            if (st != 200) return r;
            long total = c.getContentLength();
            try { total = Long.parseLong(c.getHeaderField("Content-Length")); } catch (Exception ignored) { }
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            long done = 0, last = 0;
            try (InputStream in = c.getInputStream(); java.io.FileOutputStream os = new java.io.FileOutputStream(out)) {
                byte[] buf = new byte[131072]; int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n); md.update(buf, 0, n); done += n;
                    long now = System.currentTimeMillis();
                    if (now - last > 300) { last = now; if (!p.step(done, total)) { r.put("status", 0).put("error", "cancelled"); return r; } }
                }
                os.getFD().sync();
            }
            p.step(done, total);
            r.put("bytes", done).put("sha256", MapFiles.hex(md.digest()));
        } catch (Exception e) {
            try { r.put("status", 0).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }

    private static void setMethod(HttpURLConnection c, String m) throws Exception {
        try { c.setRequestMethod(m); return; } catch (java.net.ProtocolException ignored) { }
        Field f = HttpURLConnection.class.getDeclaredField("method");
        f.setAccessible(true);
        f.set(c, m);
        // some implementations wrap a delegate connection
        try {
            Field d = c.getClass().getDeclaredField("delegate");
            d.setAccessible(true);
            Object inner = d.get(c);
            if (inner instanceof HttpURLConnection) f.set(inner, m);
        } catch (NoSuchFieldException ignored) { }
    }

    private static byte[] readAll(InputStream is) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
        while ((n = is.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }
}
