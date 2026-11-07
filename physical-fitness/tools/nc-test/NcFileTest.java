import at.stoicranger.fitness.NcFile;
import at.stoicranger.fitness.WebDav;

import java.nio.charset.StandardCharsets;
import java.util.List;

/** WebDav.java + NcFile.java against tools/webdav-mock.js (run by tools/test-nc.sh). Exit code 1 on any failure. */
public class NcFileTest {
    static int fails = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fails++; }

    public static void main(String[] a) throws Exception {
        String base = "http://127.0.0.1:" + a[0];
        byte[] v1 = "version 1".getBytes(StandardCharsets.UTF_8), v2 = "version 2".getBytes(StandardCharsets.UTF_8);

        NcFile bad = new NcFile(new WebDav(base, "manuel", "wrong"), "/Stoic Ranger/", "fitness.xlsx");
        ok(bad.test().status == 401, "wrong app password: 401");
        ok(new NcFile(new WebDav("http://127.0.0.1:1", "manuel", "x"), "/Stoic Ranger/", "fitness.xlsx").download().status == 0, "no server: status 0 (offline), no crash");

        WebDav dav = new WebDav(base + "/", "manuel", "app-pass-1");
        ok(dav.url("Stoic Ranger/backups/a b.xlsx").endsWith("/remote.php/dav/files/manuel/Stoic%20Ranger/backups/a%20b.xlsx"), "paths encoded per segment");
        NcFile f = new NcFile(dav, "/Stoic Ranger/", "fitness.xlsx");
        ok(f.test().status == 200, "test makes the folder");
        WebDav.Res d = f.download();
        ok(d.status == 404, "no file yet: 404");
        WebDav.Res u = f.upload(v1, "", "20261107-100000");
        ok(u.ok() && !u.etag.isEmpty(), "first upload creates the file (If-None-Match *), ETag " + u.etag);
        ok(f.upload(v1, "", "20261107-100001").status == 412, "create refused when the file exists (no blind overwrite)");
        d = f.download();
        ok(d.status == 200 && new String(d.body, StandardCharsets.UTF_8).equals("version 1"), "download returns the file and its ETag");
        ok(f.upload(v2, "\"stale\"", "20261107-100002").status == 412, "upload with a stale ETag: 412");
        ok(new String(f.download().body, StandardCharsets.UTF_8).equals("version 1"), "412 left the file unchanged");
        u = f.upload(v2, d.etag, "20261107-100003");
        ok(u.ok(), "upload with the current ETag (If-Match) works");
        List<String> b = dav.list("Stoic Ranger/backups");
        ok(b.contains("fitness-20261107-100003.xlsx"), "backup copy made before the upload: " + b);
        ok(new String(dav.get("Stoic Ranger/backups/fitness-20261107-100003.xlsx").body, StandardCharsets.UTF_8).equals("version 1"), "backup holds the version before the upload");

        // someone else's file in backups/ and 33 more uploads: only our own backups beyond the newest 30 go
        dav.put("Stoic Ranger/backups/database-20200101-000000.xlsx", v1, null);
        dav.put("Stoic Ranger/backups/my notes.xlsx", v1, null);
        for (int i = 0; i < 33; i++) {
            d = f.download();
            u = f.upload(("v" + i).getBytes(StandardCharsets.UTF_8), d.etag, String.format("20261108-1200%02d", i));
            if (!u.ok()) { ok(false, "upload " + i + " failed " + u.status); break; }
        }
        b = dav.list("Stoic Ranger/backups/");
        int mine = 0; for (String n : b) if (n.startsWith("fitness-")) mine++;
        ok(mine == 30, "newest 30 backups kept (" + mine + ")");
        ok(b.contains("fitness-20261108-120032.xlsx") && !b.contains("fitness-20261107-100003.xlsx"), "the oldest went, the newest stayed");
        ok(b.contains("database-20200101-000000.xlsx") && b.contains("my notes.xlsx"), "other files in backups/ untouched (names with spaces listed)");
        ok(new String(f.download().body, StandardCharsets.UTF_8).equals("v32"), "file holds the last upload");
        System.exit(fails == 0 ? 0 : 1);
    }
}
