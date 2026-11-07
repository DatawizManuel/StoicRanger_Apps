package at.stoicranger.gunsafe;

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
 * Where the database lives (shared contract, section C): "local" (only on this phone) or "nextcloud" (this phone,
 * synced to the user's Nextcloud). Kept in this app's private preferences. The Nextcloud app password is encrypted
 * with a key in the Android Keystore (it never leaves the phone except to log in, or to a linked Stoic Ranger app
 * signed with the same key, after the user allowed the link) and is never handed to the web page.
 * Reusable by the other Stoic Ranger apps (change the package line).
 */
public final class Storage {
    private static final String PREFS = "storage", KEY_ALIAS = "sr-nextcloud";

    public String mode = "local", url = "", user = "", folder = "/Stoic Ranger/", file = "", changed = "";
    String password = "";

    public static Storage load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Storage s = new Storage();
        s.mode = p.getString("mode", "local");
        s.url = p.getString("url", "");
        s.user = p.getString("user", "");
        s.folder = p.getString("folder", "/Stoic Ranger/");
        s.file = p.getString("file", "");
        s.changed = p.getString("changed", "");
        s.password = decrypt(p.getString("pw", ""));
        return s;
    }

    public void save(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("mode", "nextcloud".equals(mode) ? "nextcloud" : "local")
            .putString("url", url).putString("user", user).putString("folder", normFolder(folder))
            .putString("file", file).putString("changed", changed)
            .putString("pw", encrypt(password)).apply();
    }

    /* ---------- link consent: which Stoic Ranger apps may read and push this setting (standing rule 6) ---------- */
    static final String[] PEERS = { "at.rangebook.app" };
    static boolean isLinked(Context ctx, String pkg) {
        return pkg != null && ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("linked", new java.util.HashSet<String>()).contains(pkg);
    }
    static void setLinked(Context ctx, String pkg, boolean on) {
        boolean known = false;
        for (String k : PEERS) if (k.equals(pkg)) known = true;
        if (!known) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.Set<String> set = new java.util.HashSet<String>(p.getStringSet("linked", new java.util.HashSet<String>()));
        if (on) set.add(pkg); else set.remove(pkg);
        p.edit().putStringSet("linked", set).commit();
    }

    public boolean hasPassword() { return password != null && !password.isEmpty(); }
    public String password() { return password; }
    public void setPassword(String pw) { if (pw != null) password = pw; }

    static String normFolder(String f) {
        String s = f == null ? "" : f.trim().replace('\\', '/');
        if (!s.startsWith("/")) s = "/" + s;
        if (!s.endsWith("/")) s = s + "/";
        return s.replaceAll("/+", "/");
    }

    /** For the web page: everything except the password. */
    public JSONObject toPublicJson() throws Exception {
        JSONObject o = new JSONObject();
        o.put("mode", mode); o.put("url", url); o.put("user", user); o.put("folder", normFolder(folder));
        o.put("file", file); o.put("changed", changed); o.put("pwSet", hasPassword());
        return o;
    }

    /** For a linked same-signature app (contract: call("storage")). */
    public JSONObject toLinkJson() throws Exception {
        JSONObject o = toPublicJson();
        o.remove("pwSet");
        o.put("password", password == null ? "" : password);
        return o;
    }

    /** Applies a setting pushed by a linked app (or chosen in this app). Returns false when it is older than ours. */
    public boolean apply(JSONObject o, boolean onlyIfNewer) {
        String ch = o.optString("changed", "");
        if (onlyIfNewer && !changed.isEmpty() && ch.compareTo(changed) <= 0) return false;
        mode = "nextcloud".equals(o.optString("mode")) ? "nextcloud" : "local";
        if (o.has("url")) url = o.optString("url", "").trim();
        if (o.has("user")) user = o.optString("user", "").trim();
        if (o.has("folder")) folder = normFolder(o.optString("folder", "/Stoic Ranger/"));
        if (o.has("file")) file = o.optString("file", "");
        if (o.has("password") && !o.optString("password", "").isEmpty()) password = o.optString("password");
        changed = ch.isEmpty() ? new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT) {{
            setTimeZone(java.util.TimeZone.getTimeZone("UTC")); }}.format(new java.util.Date()) : ch;
        return true;
    }

    /* ---------- Android Keystore (AES-GCM) ---------- */
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return kg.generateKey();
    }

    static String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) return "";
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(), ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }

    static String decrypt(String stored) {
        if (stored == null || !stored.contains(":")) return "";
        try {
            String[] p = stored.split(":", 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }
}
