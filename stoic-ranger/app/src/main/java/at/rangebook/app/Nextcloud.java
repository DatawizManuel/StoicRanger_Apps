package at.rangebook.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Where the data lives (1.3.0, remarks #13/#15, shared contract 00_docs/SHARED-DB-CONTRACT.md):
 * "local" (this phone, optionally a linked database.xlsx as before) or "nextcloud" (the phone keeps its copy and
 * syncs database.xlsx over WebDAV). The setting is {mode, url, user, folder, file, changed}; the app password is
 * stored only here, encrypted with a key in the Android Keystore (never in files, sheets or repos).
 *
 * request() speaks plain HTTP/1.1 over a TLS socket because HttpURLConnection refuses the WebDAV methods
 * (PROPFIND, MKCOL, COPY). Only https is allowed; the host name is checked like HttpsURLConnection does.
 * The sync logic itself (merge, backups, If-Match) is the web app's (www/sr/nextcloud.js), the same on every platform.
 */
final class Nextcloud {
    private static final String PREFS = "storage", KEY = "sr-nextcloud";
    private Nextcloud() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** The setting without the password (hasPassword tells whether one is stored). */
    static JSONObject state(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        try {
            o.put("mode", p.getString("mode", "local"));
            o.put("url", p.getString("url", ""));
            o.put("user", p.getString("user", ""));
            o.put("folder", p.getString("folder", "/Stoic Ranger/"));
            o.put("file", p.getString("file", "database.xlsx"));
            o.put("changed", p.getString("changed", ""));
            o.put("hasPassword", !p.getString("pw", "").isEmpty());
            o.put("share", p.getBoolean("share", false));
        } catch (Exception ignored) { }
        return o;
    }

    /** The setting with the password, for linked Stoic Ranger apps (signature permission, after the user's consent). */
    static JSONObject stateWithPassword(Context c) {
        JSONObject o = state(c);
        try { o.remove("hasPassword"); o.remove("share"); o.put("password", password(c)); } catch (Exception ignored) { }
        return o;
    }

    /** Stores a setting. An empty password keeps the stored one; mode "local" keeps address and user for later. */
    static void set(Context c, JSONObject s, String pw) {
        SharedPreferences.Editor e = prefs(c).edit();
        String mode = "nextcloud".equals(s.optString("mode")) ? "nextcloud" : "local";
        e.putString("mode", mode);
        if (s.has("url")) e.putString("url", s.optString("url", "").trim());
        if (s.has("user")) e.putString("user", s.optString("user", "").trim());
        if (s.has("folder")) e.putString("folder", s.optString("folder", "/Stoic Ranger/").trim());
        if (s.has("file")) e.putString("file", s.optString("file", "database.xlsx").trim());
        e.putString("changed", s.optString("changed", ""));
        if (s.has("share")) e.putBoolean("share", s.optBoolean("share"));
        if (pw != null && !pw.isEmpty()) e.putString("pw", encrypt(pw));
        e.apply();
    }

    static String password(Context c) { String v = prefs(c).getString("pw", ""); return v.isEmpty() ? "" : decrypt(v); }

    /* ---------- the password, encrypted with a Keystore key (AES-GCM) ---------- */
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return g.generateKey();
    }
    private static String encrypt(String s) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(), b = c.doFinal(s.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }
    private static String decrypt(String v) {
        try {
            String[] p = v.split(":", 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }

    /* ---------- WebDAV ---------- */
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
     * One request inside the stored folder. headers: JSON object; "X-Dest-Name" becomes an absolute Destination.
     * Returns {status, headers:{lower-case name: value}, body: base64} or {status:0, error}.
     */
    static String request(Context c, String method, String name, String headersJson, String bodyB64, JSONObject override) {
        JSONObject out = new JSONObject();
        try {
            SharedPreferences p = prefs(c);
            String base = override != null ? override.optString("url") : p.getString("url", "");
            String user = override != null ? override.optString("user") : p.getString("user", "");
            String folder = override != null ? override.optString("folder", "/Stoic Ranger/") : p.getString("folder", "/Stoic Ranger/");
            String pw = override != null && !override.optString("password").isEmpty() ? override.optString("password") : password(c);
            if (base.isEmpty() || user.isEmpty()) { out.put("status", 0); out.put("error", "Nextcloud is not set up."); return out.toString(); }
            Map<String, String> h = new LinkedHashMap<>();
            JSONObject hj = headersJson == null || headersJson.isEmpty() ? new JSONObject() : new JSONObject(headersJson);
            for (Iterator<String> it = hj.keys(); it.hasNext(); ) { String k = it.next(); h.put(k, hj.optString(k)); }
            if (h.containsKey("X-Dest-Name")) h.put("Destination", urlOf(base, user, folder, h.remove("X-Dest-Name")));
            h.put("Authorization", "Basic " + Base64.encodeToString((user + ":" + pw).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            byte[] body = bodyB64 == null || bodyB64.isEmpty() ? null : Base64.decode(bodyB64, Base64.DEFAULT);
            return send(method, urlOf(base, user, folder, name), h, body, 0).toString();
        } catch (Exception e) {
            try { out.put("status", 0); out.put("error", e.getMessage() == null ? e.toString() : e.getMessage()); } catch (Exception ignored) { }
            return out.toString();
        }
    }

    private static JSONObject send(String method, String url, Map<String, String> headers, byte[] body, int hops) throws Exception {
        URI u = new URI(url);
        if (!"https".equalsIgnoreCase(u.getScheme())) throw new Exception("The Nextcloud address must start with https://");
        String host = u.getHost();
        int port = u.getPort() > 0 ? u.getPort() : 443;
        Socket raw = new Socket();
        raw.connect(new InetSocketAddress(host, port), 8000);
        raw.setSoTimeout(20000);
        SSLSocket s = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, host, port, true);
        try {
            s.startHandshake();
            if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(host, s.getSession())) throw new Exception("The certificate does not match " + host);
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
            String[] sp = status.split(" ");
            int code = sp.length > 1 ? Integer.parseInt(sp[1]) : 0;
            JSONObject hs = new JSONObject();
            for (String l = line(is); !l.isEmpty(); l = line(is)) {
                int i = l.indexOf(':');
                if (i > 0) hs.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            }
            byte[] data;
            if ("HEAD".equals(method) || code == 204 || code == 304) data = new byte[0];
            else if ("chunked".equalsIgnoreCase(hs.optString("transfer-encoding"))) data = chunked(is);
            else if (hs.has("content-length")) data = exactly(is, Integer.parseInt(hs.optString("content-length")));
            else data = MainActivity.readAll(is);
            if ((code == 301 || code == 302 || code == 307 || code == 308) && hops < 3 && hs.has("location"))
                return send(method, u.resolve(hs.optString("location")).toString(), headers, body, hops + 1);
            JSONObject o = new JSONObject();
            o.put("status", code);
            o.put("headers", hs);
            o.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
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
        while (off < n) { int r = is.read(b, off, n - off); if (r < 0) break; off += r; }
        return b;
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
