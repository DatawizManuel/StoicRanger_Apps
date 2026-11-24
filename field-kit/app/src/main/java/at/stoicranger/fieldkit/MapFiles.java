package at.stoicranger.fieldkit;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;

/**
 * Offline map files on the phone (remark #7): files/maps/<name>.pmtiles, in the app's own storage (not in the
 * phone backup, removed with the app). Files come from the user's Nextcloud (/StoicRanger_Maps/, written by the
 * Stoic Ranger Map Manager) or are picked by hand. Only plain names ending in .pmtiles are accepted.
 * The page reads them in pieces: https://appassets.androidplatform.net/maps/<name>?o=<offset>&l=<length>.
 */
final class MapFiles {
    private MapFiles() { }

    static File dir(Context c) { File d = new File(c.getFilesDir(), "maps"); d.mkdirs(); return d; }

    static boolean safe(String name) {
        return name != null && name.matches("[A-Za-z0-9._ ()-]{1,120}\\.pmtiles") && !name.contains("..") && !name.startsWith(".");
    }

    static File file(Context c, String name) throws IOException {
        if (!safe(name)) throw new IOException("bad file name");
        return new File(dir(c), name);
    }

    /** [{name, bytes, mtime}] of the finished map files (no .part files). */
    static String list(Context c) {
        JSONArray a = new JSONArray();
        File[] all = dir(c).listFiles();
        if (all != null) for (File f : all) {
            if (!f.isFile() || !safe(f.getName())) continue;
            try { a.put(new JSONObject().put("name", f.getName()).put("bytes", f.length()).put("mtime", f.lastModified())); }
            catch (Exception ignored) { }
        }
        return a.toString();
    }

    static byte[] read(Context c, String name, long offset, int length) throws IOException {
        File f = file(c, name);
        if (length < 0 || length > 16 * 1024 * 1024 || offset < 0) throw new IOException("bad range");
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            long len = r.length();
            if (offset >= len) return new byte[0];
            int n = (int) Math.min(length, len - offset);
            byte[] b = new byte[n];
            r.seek(offset);
            r.readFully(b);
            return b;
        }
    }

    /** A piece of a file as a stream, for the WebView (shouldInterceptRequest). */
    static InputStream slice(Context c, String name, long offset, int length) throws IOException {
        return new java.io.ByteArrayInputStream(read(c, name, offset, length));
    }

    static boolean delete(Context c, String name) {
        try { File f = file(c, name); return !f.exists() || f.delete(); } catch (IOException e) { return false; }
    }

    static long free(Context c) { return dir(c).getUsableSpace(); }

    /** Moves a finished .part file into place (replacing an older copy only now, when the new one is complete). */
    static boolean finish(File part, File target) {
        File old = new File(target.getPath() + ".old");
        old.delete();
        if (target.exists() && !target.renameTo(old)) return false;
        if (!part.renameTo(target)) { old.renameTo(target); return false; }
        old.delete();
        return true;
    }

    static String sha256(File f) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        try (InputStream is = new FileInputStream(f)) {
            byte[] buf = new byte[65536]; int n;
            while ((n = is.read(buf)) > 0) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    static String hex(byte[] d) {
        StringBuilder b = new StringBuilder();
        for (byte x : d) b.append(String.format("%02x", x & 0xff));
        return b.toString();
    }
}
