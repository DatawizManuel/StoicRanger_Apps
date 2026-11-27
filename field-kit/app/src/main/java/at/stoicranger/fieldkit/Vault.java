package at.stoicranger.fieldkit;

import android.content.Context;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Vault (0.7.0): the phone side only moves bytes. All encryption and decryption happens in the page (WebCrypto,
 * AES-256-GCM, keys from PBKDF2), so this class never sees a vault password or a plain file except when the user
 * opens or saves one on purpose. Files can be large, so bytes are kept here in one "blob" and the page reads or
 * writes it in chunks (base64) instead of passing one huge string through the bridge.
 *
 * Nextcloud: WebDAV GET/PUT of one file into/out of the blob, and the files_sharing OCS API (public links) for
 * "Send encrypted". Only the address saved in SyncStore is contacted. No lambdas: the cloud build cannot run them.
 */
final class Vault {
    static final long MAX = 100L * 1024 * 1024;   // largest file the vault takes (memory of the WebView)
    private static byte[] blob = new byte[0];
    private static ByteArrayOutputStream building;

    private Vault() { }

    static synchronized void set(byte[] b) { wipe(blob); blob = b == null ? new byte[0] : b; }
    static synchronized byte[] get() { return blob; }
    static synchronized int size() { return blob.length; }
    static synchronized String read(double offset, int len) {
        int off = (int) offset;
        if (off < 0 || off > blob.length || len < 0) return "";
        int n = Math.min(len, blob.length - off);
        return Base64.encodeToString(blob, off, n, Base64.NO_WRAP);
    }
    static synchronized void start() { building = new ByteArrayOutputStream(); }
    static synchronized boolean append(String b64) {
        if (building == null) return false;
        byte[] b = Base64.decode(b64, Base64.DEFAULT);
        if (building.size() + (long) b.length > MAX + 4096) { building = null; return false; }
        building.write(b, 0, b.length);
        return true;
    }
    static synchronized int end() {
        if (building == null) return -1;
        set(building.toByteArray()); building = null;
        return blob.length;
    }
    static synchronized void clear() { set(null); building = null; }
    private static void wipe(byte[] b) { if (b != null) Arrays.fill(b, (byte) 0); }

    /** Decrypted copies handed to another app (Open with…) live in cache/shared/vault_*; removed on every lock. */
    static File openFile(Context c, String name) {
        File dir = new File(c.getCacheDir(), "shared");
        dir.mkdirs();
        String safe = name == null ? "file" : name.replaceAll("[^A-Za-z0-9._ ()-]+", "_");
        if (safe.isEmpty() || safe.startsWith(".")) safe = "file" + safe;
        return new File(dir, "vault_" + safe);
    }
    static void wipeShared(Context c) {
        File[] fs = new File(c.getCacheDir(), "shared").listFiles();
        if (fs == null) return;
        for (File f : fs) if (f.getName().startsWith("vault_")) {
            try (OutputStream os = new java.io.FileOutputStream(f)) {   // overwrite before deleting
                byte[] z = new byte[65536]; long left = f.length();
                while (left > 0) { int n = (int) Math.min(z.length, left); os.write(z, 0, n); left -= n; }
            } catch (Exception ignored) { }
            f.delete();
        }
    }

    // ---------- Nextcloud ----------
    private static HttpURLConnection open(JSONObject cfg, String url) throws Exception {
        String user = cfg.optString("user"), pw = cfg.optString("password");
        if (user.isEmpty() || pw.isEmpty()) throw new Exception("Set up your Nextcloud first (⋯ › Where your data is stored).");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(120000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Authorization", "Basic " + Base64.encodeToString((user + ":" + pw).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
        c.setRequestProperty("OCS-APIRequest", "true");
        return c;
    }
    private static String base(JSONObject cfg) throws Exception {
        String b = cfg.optString("url");
        if (!b.startsWith("https://")) throw new Exception("Set up your Nextcloud first (⋯ › Where your data is stored).");
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b;
    }

    /** GET: the file goes into the blob. PUT: the blob is the body. → {status, etag, size, error} */
    static JSONObject dav(JSONObject cfg, String method, String path, String ifMatch) {
        JSONObject out = new JSONObject();
        HttpURLConnection c = null;
        try {
            if (!"GET".equals(method) && !"PUT".equals(method)) throw new Exception("method not allowed");
            if (path == null || path.contains("..")) throw new Exception("bad path");
            c = open(cfg, NcClient.davUrl(base(cfg), cfg.optString("user"), path));
            c.setRequestMethod(method);
            if (ifMatch != null && !ifMatch.isEmpty()) {
                if ("*new*".equals(ifMatch)) c.setRequestProperty("If-None-Match", "*"); else c.setRequestProperty("If-Match", ifMatch);
            }
            if ("PUT".equals(method)) {
                byte[] body = get();
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/octet-stream");
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            int st = c.getResponseCode();
            out.put("status", st);
            String et = c.getHeaderField("ETag"); if (et == null) et = c.getHeaderField("OC-ETag");
            out.put("etag", et == null ? "" : et);
            if ("GET".equals(method) && st == 200) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[131072]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { tot += n; if (tot > MAX + 4096) throw new Exception("The file is larger than 100 MB."); b.write(buf, 0, n); }
                }
                set(b.toByteArray());
                out.put("size", size());
            }
        } catch (Exception e) {
            try { out.put("status", 0).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        } finally { if (c != null) c.disconnect(); }
        return out;
    }

    /** Public links (OCS files_sharing). method POST (create, form = url-encoded fields), DELETE (sub = "/<id>"), GET.
     *  → {status, body (text), error} */
    static JSONObject share(JSONObject cfg, String method, String sub, String form) {
        JSONObject out = new JSONObject();
        HttpURLConnection c = null;
        try {
            if (!"GET".equals(method) && !"POST".equals(method) && !"DELETE".equals(method)) throw new Exception("method not allowed");
            if (sub == null) sub = "";
            if (!sub.isEmpty() && !sub.matches("/[0-9]{1,12}")) throw new Exception("bad share id");
            c = open(cfg, base(cfg) + "/ocs/v2.php/apps/files_sharing/api/v1/shares" + sub + "?format=json");
            c.setRequestMethod(method);
            c.setRequestProperty("Accept", "application/json");
            if ("POST".equals(method)) {
                byte[] body = (form == null ? "" : form).getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            int st = c.getResponseCode();
            out.put("status", st);
            InputStream is = st >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = "";
            if (is != null) try (InputStream in = is) { text = new String(MainActivity.readAll(in), StandardCharsets.UTF_8); }
            out.put("body", text);
        } catch (Exception e) {
            try { out.put("status", 0).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        } finally { if (c != null) c.disconnect(); }
        return out;
    }

    /** 0.8.0 (remark #26): move the whole vault folder on Nextcloud (WebDAV MOVE, never overwrites). Nextcloud keeps
     *  the file ids, so links already sent keep working. → {status, error} (201 = moved, 412 = target exists) */
    static JSONObject move(JSONObject cfg, String from, String to) {
        JSONObject out = new JSONObject();
        HttpURLConnection c = null;
        try {
            if (from == null || to == null || from.contains("..") || to.contains("..") || !from.startsWith("/") || !to.startsWith("/")) throw new Exception("bad path");
            String user = cfg.optString("user");
            c = open(cfg, NcClient.davUrl(base(cfg), user, from));
            NcClient.setMethod(c, "MOVE");
            c.setRequestProperty("Destination", NcClient.davUrl(base(cfg), user, to));
            c.setRequestProperty("Overwrite", "F");
            out.put("status", c.getResponseCode());
        } catch (Exception e) {
            try { out.put("status", 0).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        } finally { if (c != null) c.disconnect(); }
        return out;
    }

    static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return ""; } }
}
