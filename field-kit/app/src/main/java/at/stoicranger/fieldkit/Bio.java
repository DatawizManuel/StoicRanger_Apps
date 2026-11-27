package at.stoicranger.fieldkit;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Vault fingerprint unlock (0.8.0, remark #24). The vault key is encrypted with an AES key that lives in the Android
 * Keystore and can only be used right after a fingerprint check (no time window). A new fingerprint added to the
 * phone destroys that key, so fingerprint unlock then switches itself off. The page also asks for the vault password
 * once after every phone restart (boot count). Android 9+ only (BiometricPrompt). No lambdas: the cloud build can't.
 */
final class Bio {
    private static final String KEY = "fk-vault-bio", PREFS = "fk-vault-bio";
    interface Done { void done(boolean ok, String msg); }

    private Bio() { }

    static boolean available(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false;
        try {
            KeyguardManager km = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
            if (km == null || !km.isDeviceSecure()) return false;
            FingerprintManager fm = (FingerprintManager) c.getSystemService(Context.FINGERPRINT_SERVICE);
            return fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints();
        } catch (Exception e) { return false; }
    }
    static int bootCount(Context c) {
        try { return Settings.Global.getInt(c.getContentResolver(), "boot_count"); } catch (Exception e) { return -1; }
    }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** {avail, on, account, boot, bootNow} – nothing secret. */
    static String state(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        try {
            boolean on = p.contains("ct") && key() != null;
            o.put("avail", available(c)).put("on", on).put("account", on ? p.getString("account", "") : "")
             .put("boot", p.getInt("boot", -2)).put("bootNow", bootCount(c));
        } catch (Exception ignored) { }
        return o.toString();
    }

    static void forget(Context c) {
        prefs(c).edit().clear().apply();
        try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(KEY); } catch (Exception ignored) { }
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        return (SecretKey) ks.getKey(KEY, null);
    }
    private static SecretKey newKey() throws Exception {
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setUserAuthenticationRequired(true);
        try {   // API 24+, not in the API 23 android.jar the cloud build uses
            KeyGenParameterSpec.Builder.class.getMethod("setInvalidatedByBiometricEnrollment", boolean.class).invoke(b, true);
        } catch (Exception ignored) { }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(b.build());
        return kg.generateKey();
    }

    /** Turn on: fingerprint check, then the vault key (base64) is encrypted and kept in the app's private storage. */
    static void enroll(final Activity a, final String account, final String secretB64, final Done d) {
        try {
            if (!available(a)) { d.done(false, "Set up a fingerprint and a screen lock on this phone first."); return; }
            forget(a);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.ENCRYPT_MODE, newKey());
            prompt(a, ci, "Turn on fingerprint unlock", "Touch the sensor to unlock the vault with your fingerprint from now on", new Got() {
                @Override public void got(Cipher c) throws Exception {
                    byte[] plain = Base64.decode(secretB64, Base64.DEFAULT);
                    byte[] ct = c.doFinal(plain); Arrays.fill(plain, (byte) 0);
                    prefs(a).edit().putString("account", account).putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                        .putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP)).putInt("boot", bootCount(a)).apply();
                    d.done(true, "");
                }
            }, d);
        } catch (Exception e) { forget(a); d.done(false, "Fingerprint unlock is not possible on this phone (" + e.getMessage() + ")."); }
    }

    /** Unlock: fingerprint check, then the vault key (base64) goes back to the page. */
    static void unlock(final Activity a, final String account, final Done d) {
        try {
            final SharedPreferences p = prefs(a);
            SecretKey k = key();
            if (k == null || !p.contains("ct")) { forget(a); d.done(false, "off"); return; }
            if (!account.equals(p.getString("account", ""))) { d.done(false, "off"); return; }
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            try { ci.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(p.getString("iv", ""), Base64.DEFAULT))); }
            catch (KeyPermanentlyInvalidatedException e) { forget(a); d.done(false, "changed"); return; }
            prompt(a, ci, "Unlock the vault", "Touch the sensor", new Got() {
                @Override public void got(Cipher c) throws Exception {
                    byte[] plain = c.doFinal(Base64.decode(p.getString("ct", ""), Base64.DEFAULT));
                    String out = Base64.encodeToString(plain, Base64.NO_WRAP); Arrays.fill(plain, (byte) 0);
                    d.done(true, out);
                }
            }, d);
        } catch (Exception e) { d.done(false, "Fingerprint unlock failed (" + e.getMessage() + "). Use your vault password."); }
    }

    private interface Got { void got(Cipher c) throws Exception; }

    private static void prompt(Activity a, Cipher ci, String title, String sub, final Got got, final Done d) {
        final Handler h = new Handler(Looper.getMainLooper());
        final Executor ex = new Executor() { @Override public void execute(Runnable r) { h.post(r); } };
        final boolean[] once = { false };
        BiometricPrompt bp = new BiometricPrompt.Builder(a).setTitle(title).setSubtitle(sub)
            .setNegativeButton("Use password", ex, new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface di, int w) { if (!once[0]) { once[0] = true; d.done(false, "cancelled"); } }
            }).build();
        bp.authenticate(new BiometricPrompt.CryptoObject(ci), new CancellationSignal(), ex, new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                if (once[0]) return; once[0] = true;
                try { got.got(r.getCryptoObject().getCipher()); }
                catch (Exception e) { d.done(false, "Fingerprint unlock failed (" + e.getMessage() + "). Use your vault password."); }
            }
            @Override public void onAuthenticationError(int code, CharSequence msg) {
                if (once[0]) return; once[0] = true;
                // 5 canceled, 10 user canceled, 13 negative button: the user chose the password
                d.done(false, code == 5 || code == 10 || code == 13 ? "cancelled" : String.valueOf(msg));
            }
        });
    }
}
