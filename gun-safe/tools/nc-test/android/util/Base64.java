package android.util;
/** Desktop stand-in for android.util.Base64 (tests only): the flags GunSafe uses. */
public final class Base64 {
    public static final int DEFAULT = 0, NO_WRAP = 2;
    public static String encodeToString(byte[] b, int flags) { return java.util.Base64.getEncoder().encodeToString(b); }
    public static byte[] decode(String s, int flags) { return java.util.Base64.getMimeDecoder().decode(s); }
}
