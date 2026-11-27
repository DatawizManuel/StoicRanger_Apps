package android.hardware.biometrics;

// Compile-time stub of the Android 9 (API 28) BiometricPrompt, because the cloud build compiles against an API 23
// android.jar. Only used by tools/build-debug.sh to compile; it is NOT put into the APK (the phone has the real class).
public class BiometricPrompt {
    public static class Builder {
        public Builder(android.content.Context c) { }
        public Builder setTitle(CharSequence t) { return this; }
        public Builder setSubtitle(CharSequence t) { return this; }
        public Builder setDescription(CharSequence t) { return this; }
        public Builder setNegativeButton(CharSequence t, java.util.concurrent.Executor e, android.content.DialogInterface.OnClickListener l) { return this; }
        public BiometricPrompt build() { return null; }
    }
    public static class CryptoObject {
        public CryptoObject(javax.crypto.Cipher c) { }
        public javax.crypto.Cipher getCipher() { return null; }
    }
    public static class AuthenticationResult {
        public CryptoObject getCryptoObject() { return null; }
    }
    public abstract static class AuthenticationCallback {
        public void onAuthenticationError(int code, CharSequence msg) { }
        public void onAuthenticationHelp(int code, CharSequence msg) { }
        public void onAuthenticationSucceeded(AuthenticationResult r) { }
        public void onAuthenticationFailed() { }
    }
    public void authenticate(CryptoObject crypto, android.os.CancellationSignal cancel, java.util.concurrent.Executor e, AuthenticationCallback cb) { }
}
