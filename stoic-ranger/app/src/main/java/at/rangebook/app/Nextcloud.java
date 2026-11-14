package at.rangebook.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

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

    /* ---------- WebDAV (the HTTP part is DavHttp, plain Java, tested on the desktop JVM against a real Nextcloud) ---------- */
    static String urlOf(String base, String user, String folder, String name) throws Exception { return DavHttp.urlOf(base, user, folder, name); }

    /**
     * One request inside the stored folder. headers: JSON object; "X-Dest-Name" becomes an absolute Destination.
     * Returns {status, headers:{lower-case name: value}, body: base64} or {status:0, error}.
     */
    static String request(Context c, String method, String name, String headersJson, String bodyB64, JSONObject override) {
        SharedPreferences p = prefs(c);
        String base = override != null ? override.optString("url") : p.getString("url", "");
        String user = override != null ? override.optString("user") : p.getString("user", "");
        String folder = override != null ? override.optString("folder", "/Stoic Ranger/") : p.getString("folder", "/Stoic Ranger/");
        String pw = override != null && !override.optString("password").isEmpty() ? override.optString("password") : password(c);
        return DavHttp.call(base, user, folder, pw, method, name, headersJson, bodyB64);
    }
}
