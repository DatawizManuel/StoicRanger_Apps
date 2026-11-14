package at.stoicranger.dailythoughts;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Where the data lives (shared contract v1, section C): "local" (only on this phone, the default) or "nextcloud"
 * (on this phone, synced to a Nextcloud folder). Kept in the app's private SharedPreferences, never in db.json, the
 * xlsx or a backup (backup_rules.xml only takes db.json). The Nextcloud app password is encrypted with an AES key that
 * lives in the Android Keystore and cannot leave the phone; the web app never gets it back once it is set.
 * Also keeps the user's link consent: which Stoic Ranger apps may read and push this setting (standing rule 6).
 */
public class Storage {
    static final String[] PEERS = { "at.rangebook.app", "at.stoicranger.gunsafe", "at.stoicranger.fitness", "at.stoicranger.fieldkit" };
    private static final String PREFS = "storage", KEY_ALIAS = "dt-nextcloud-password";

    private final SharedPreferences p;
    Storage(Context c) { p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String now() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    String mode() { return "nextcloud".equals(p.getString("mode", "local")) ? "nextcloud" : "local"; }
    String url() { return p.getString("url", ""); }
    String user() { return p.getString("user", ""); }
    String folder() { return p.getString("folder", "/Stoic Ranger/"); }
    String file() { String f = p.getString("file", ""); return f.isEmpty() ? (linked().isEmpty() ? "dailythoughts.xlsx" : "database.xlsx") : f; }
    String changed() { return p.getString("changed", ""); }
    boolean hasPassword() { return !p.getString("pw", "").isEmpty(); }

    /** The setting as the contract has it; the password only when asked for (link providers of consented apps). */
    JSONObject toJson(boolean withPassword) {
        JSONObject o = new JSONObject();
        try {
            o.put("mode", mode()); o.put("url", url()); o.put("user", user()); o.put("folder", folder()); o.put("file", file());
            o.put("changed", changed());
            if (withPassword) o.put("password", password()); else o.put("hasPassword", hasPassword());
        } catch (Exception ignored) { }
        return o;
    }

    /**
     * Applies a setting. password: null or "" keeps the stored one. stamp: the setting's own `changed` (a pushed
     * setting) or null (the user changed it here: now). Returns false for an older setting when onlyIfNewer.
     */
    synchronized boolean apply(JSONObject o, String password, String stamp, boolean onlyIfNewer) {
        String ch = stamp != null ? stamp : now();
        if (onlyIfNewer && ch.compareTo(changed()) <= 0) return false;
        SharedPreferences.Editor e = p.edit();
        e.putString("mode", "nextcloud".equals(o.optString("mode")) ? "nextcloud" : "local");
        if (o.has("url")) e.putString("url", o.optString("url", "").trim());
        if (o.has("user")) e.putString("user", o.optString("user", "").trim());
        if (o.has("folder")) e.putString("folder", cleanFolder(o.optString("folder", "")));
        if (o.has("file")) e.putString("file", cleanFile(o.optString("file", "")));
        if (password != null && !password.isEmpty()) {
            String enc = encrypt(password);
            if (enc == null) return false;
            e.putString("pw", enc);
        }
        e.putString("changed", ch);
        return e.commit();
    }

    static String cleanFolder(String f) {
        String s = f.trim().replace('\\', '/');
        if (s.isEmpty()) s = "/Stoic Ranger/";
        if (!s.startsWith("/")) s = "/" + s;
        if (!s.endsWith("/")) s = s + "/";
        return s.replace("..", "");
    }
    static String cleanFile(String f) {
        String s = f.trim().replace("/", "").replace("\\", "").replace("..", "");
        if (s.isEmpty()) return "";
        return s.toLowerCase(Locale.ROOT).endsWith(".xlsx") ? s : s + ".xlsx";
    }

    /* ---------- link consent ---------- */
    Set<String> linked() { return new HashSet<>(p.getStringSet("linked", new HashSet<String>())); }
    boolean isLinked(String pkg) { return pkg != null && linked().contains(pkg); }
    void setLinked(String pkg, boolean on) {
        boolean known = false;
        for (String k : PEERS) if (k.equals(pkg)) known = true;
        if (!known) return;
        Set<String> s = linked();
        if (on) s.add(pkg); else s.remove(pkg);
        p.edit().putStringSet("linked", s).commit();
    }
    JSONArray linkedJson() { JSONArray a = new JSONArray(); for (String s : linked()) a.put(s); return a; }

    /* ---------- password, encrypted with a Keystore key ---------- */
    String password() {
        String v = p.getString("pw", "");
        if (v.isEmpty()) return "";
        try {
            String[] parts = v.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }      // key gone (app data restored elsewhere): the user types it again
    }

    private static String encrypt(String s) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = c.doFinal(s.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return g.generateKey();
    }
}
