package at.stoicranger.fieldkit;

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
 * Where the data is stored (Manuel 2026-11-07): "local" (on this phone only, the default) or "nextcloud"
 * (on this phone, synced to the user's Nextcloud over WebDAV). Kept in SharedPreferences "fk-sync", which is
 * excluded from Android backups. The Nextcloud app password is encrypted with an AES key in the Android Keystore
 * (it never leaves the phone's secure hardware); it is never written in clear text, never in db.json, code or files
 * (standing rule 9). Shared with linked Stoic Ranger apps through LinkProvider (signature permission only).
 *
 * JSON shape (SHARED-DB-CONTRACT C): {mode, url, user, folder, file, changed, hasPassword} (+ password only for LinkProvider callers).
 * No lambdas anywhere: the cloud build (dx) cannot run them on Android.
 */
final class SyncStore {
    private static final String PREFS = "fk-sync", KEY = "fk-nextcloud", DEFAULT_FOLDER = "/Stoic Ranger/", OWN_FILE = "fieldkit.xlsx";

    private SyncStore() { }

    private static SharedPreferences p(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String folder(String f) {
        if (f == null || f.trim().isEmpty()) return DEFAULT_FOLDER;
        f = f.trim().replace('\\', '/');
        if (!f.startsWith("/")) f = "/" + f;
        if (!f.endsWith("/")) f = f + "/";
        return f;
    }

    /** database.xlsx when linked with another Stoic Ranger app, fieldkit.xlsx alone (SHARED-DB-CONTRACT A). */
    static String safeFile(String f) {
        f = f == null ? "" : f.trim();
        return f.matches("[A-Za-z0-9 _.-]{1,60}\\.xlsx") ? f : OWN_FILE;
    }

    /** The storage setting; with password only when asked (LinkProvider to a same-signature app, or the WebDAV client). */
    static JSONObject get(Context c, boolean withPassword) {
        SharedPreferences s = p(c);
        JSONObject o = new JSONObject();
        try {
            o.put("mode", s.getString("mode", "local"));
            o.put("url", s.getString("url", ""));
            o.put("user", s.getString("user", ""));
            o.put("folder", folder(s.getString("folder", DEFAULT_FOLDER)));
            o.put("file", s.getString("file", OWN_FILE));
            o.put("changed", s.getString("changed", ""));
            String enc = s.getString("pw", "");
            o.put("hasPassword", !enc.isEmpty());
            if (withPassword) o.put("password", decrypt(enc));
        } catch (Exception ignored) { }
        return o;
    }

    /** Saves the setting. password: null keeps the current one, "" removes it. Returns false for an invalid address. */
    static boolean set(Context c, JSONObject o, String password, String changed) {
        String mode = "nextcloud".equals(o.optString("mode")) ? "nextcloud" : "local";
        String url = o.optString("url", "").trim();
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        if ("nextcloud".equals(mode) && !url.startsWith("https://")) return false;
        SharedPreferences.Editor e = p(c).edit()
            .putString("mode", mode).putString("url", url).putString("user", o.optString("user", "").trim())
            .putString("folder", folder(o.optString("folder", DEFAULT_FOLDER)))
            .putString("file", safeFile(o.optString("file", OWN_FILE)))
            .putString("changed", changed != null && !changed.isEmpty() ? changed : new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.ROOT) {{ setTimeZone(java.util.TimeZone.getTimeZone("UTC")); }}.format(new java.util.Date()));
        if (password != null) e.putString("pw", password.isEmpty() ? "" : encrypt(password));
        e.apply();
        return true;
    }

    static String password(Context c) { return decrypt(p(c).getString("pw", "")); }

    // ---------- Android Keystore (AES-256-GCM) ----------
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return g.generateKey();
    }
    private static String encrypt(String plain) {
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = ci.getIV(), ct = ci.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }
    private static String decrypt(String enc) {
        if (enc == null || enc.isEmpty() || !enc.contains(":")) return "";
        try {
            String[] parts = enc.split(":", 2);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(ci.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }
}
