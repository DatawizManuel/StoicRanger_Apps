package at.stoicranger.dailythoughts;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The synced workbook on Nextcloud (shared contract v1, section B). The merge itself runs in the web app (js/sync.js);
 * this class only moves bytes: download with the ETag, and upload with If-Match after a backup copy into
 * <folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx (newest 30 kept). Plain Java, tested on the build machine.
 */
public class NcFile {
    public static final int KEEP_BACKUPS = 30;
    final WebDav dav;
    final String folder, file;

    public NcFile(WebDav dav, String folder, String file) {
        this.dav = dav;
        String f = folder.replace('\\', '/');
        if (!f.endsWith("/")) f += "/";
        this.folder = f; this.file = file;
    }

    String path() { return folder + file; }
    String backups() { return folder + "backups/"; }
    String stem() { return file.toLowerCase(Locale.ROOT).endsWith(".xlsx") ? file.substring(0, file.length() - 5) : file; }

    /** 200 + bytes + etag, or 404 (no file yet: the first sync creates it), or 0/401/... */
    public WebDav.Res download() { return dav.get(path()); }

    /** Checks the address and the login: makes the folder (or finds it). */
    public WebDav.Res test() {
        WebDav.Res r = new WebDav.Res();
        r.status = dav.mkdirs(folder) ? 200 : 0;
        if (r.status == 0) {      // why not: the login (401), the address (0, 404) or no right to make the folder (403)
            WebDav.Res g = dav.get(path());
            r.status = g.ok() ? 200 : g.status == 404 ? 403 : g.status; r.error = g.error;
        }
        return r;
    }

    /**
     * etag = the ETag of the download the merge was based on ("" = the file did not exist). 412 means someone else
     * wrote it meanwhile: the caller downloads, merges and tries again. stamp = YYYYMMDD-HHMMSS for the backup name.
     * 0.3.1 (as SR Shooting 1.3.1): only an xlsx (zip, "PK") is sent; after the PUT the file is read back and must be
     * byte-identical, else it is sent once more, and if it is still wrong the backup made just before goes back in place.
     */
    public WebDav.Res upload(byte[] data, String etag, String stamp) {
        if (data == null || data.length < 4 || data[0] != 'P' || data[1] != 'K') return fail(0, "not an Excel file: nothing sent");
        if (!dav.mkdirs(folder)) return fail(0, "cannot reach the folder " + folder);
        String backup = null;
        if (etag != null && !etag.isEmpty()) {
            dav.mkdirs(backups());
            backup = backups() + stem() + "-" + stamp + ".xlsx";
            WebDav.Res c = dav.copy(path(), backup);
            if (c.status == 412) backup = null;          // a backup of this second exists already (a retry)
            else if (!c.ok()) return fail(c.status, "backup copy failed (" + c.status + ")");
            prune();
        }
        WebDav.Res put = dav.put(path(), data, etag);
        if (!put.ok()) return put;
        for (int attempt = 0; attempt < 2; attempt++) {
            WebDav.Res back = dav.get(path());
            if (back.status == 200 && Arrays.equals(back.body, data)) { back.body = new byte[0]; return back; }   // arrived intact
            if (attempt == 0) {
                if (back.status != 200) continue;        // could not read it back: one more look
                WebDav.Res again = dav.put(path(), data, back.etag);
                if (again.status == 412) return again;    // someone else wrote meanwhile: merge again
            }
        }
        // still not the bytes we sent: put the version from before back (or remove the broken new file we made)
        if (backup != null) dav.copyOver(backup, path());
        else if (etag == null || etag.isEmpty()) dav.delete(path());
        return fail(0, "the upload did not arrive intact; the file on Nextcloud was put back as it was");
    }

    private static WebDav.Res fail(int status, String msg) { WebDav.Res r = new WebDav.Res(); r.status = status; r.error = msg; return r; }

    /** Deletes only our own backups beyond the newest 30 (names <stem>-YYYYMMDD-HHMMSS.xlsx sort by time). */
    public int prune() {
        Pattern own = Pattern.compile(Pattern.quote(stem()) + "-\\d{8}-\\d{6}\\.xlsx");
        List<String> mine = new ArrayList<>();
        for (String n : dav.list(backups())) if (own.matcher(n).matches()) mine.add(n);
        Collections.sort(mine);
        int gone = 0;
        for (int i = 0; i < mine.size() - KEEP_BACKUPS; i++) if (dav.delete(backups() + mine.get(i)).ok()) gone++;
        return gone;
    }

    public static String stamp(Date d) { return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(d); }
}
