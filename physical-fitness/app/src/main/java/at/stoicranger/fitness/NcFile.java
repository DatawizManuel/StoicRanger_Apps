package at.stoicranger.fitness;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
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
     */
    public WebDav.Res upload(byte[] data, String etag, String stamp) {
        if (!dav.mkdirs(folder)) { WebDav.Res r = new WebDav.Res(); r.status = 0; r.error = "cannot reach the folder " + folder; return r; }
        if (etag != null && !etag.isEmpty()) {
            dav.mkdirs(backups());
            WebDav.Res c = dav.copy(path(), backups() + stem() + "-" + stamp + ".xlsx");
            if (!c.ok() && c.status != 412) {   // 412: a backup of this second exists already
                WebDav.Res r = new WebDav.Res(); r.status = c.status; r.error = "backup copy failed (" + c.status + ")"; return r;
            }
            prune();
        }
        return dav.put(path(), data, etag);
    }

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
