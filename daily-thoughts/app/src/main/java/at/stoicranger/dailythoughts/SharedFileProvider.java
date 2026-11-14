package at.stoicranger.dailythoughts;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal FileProvider for cache/shared/: files handed to other apps (share sheet).
 * Kept dependency-free on purpose (no androidx needed).
 */
public class SharedFileProvider extends ContentProvider {
    static String authority;   // <applicationId>.files, so debug and release builds can be installed side by side

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(authority).appendPath("shared").appendPath(f.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) throw new FileNotFoundException();
        return new File(new File(getContext().getCacheDir(), "shared"), name);
    }

    @Override public boolean onCreate() { authority = getContext().getPackageName() + ".files"; return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        int m = mode.contains("w") ? ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE
                : ParcelFileDescriptor.MODE_READ_ONLY;
        f.getParentFile().mkdirs();
        return ParcelFileDescriptor.open(f, m);
    }

    @Override
    public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        return n == null ? "application/octet-stream" : MainActivity.mime(n);
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
