package at.rangebook.app;

import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Base64;

/** Test only (not in the app): the steps www/sr/nextcloud.js does, through DavHttp, against a real server. */
public final class DavHttpProbe {
    static int fails = 0;
    static void ok(boolean c, String what) { System.out.println((c ? "  ok   " : "  FAIL ") + what); if (!c) fails++; }
    static JSONObject r(String base, String user, String pw, String folder, String m, String name, String h, byte[] body) throws Exception {
        return new JSONObject(DavHttp.call(base, user, folder, pw, m, name, h, body == null ? "" : Base64.getEncoder().encodeToString(body)));
    }
    static String etag(JSONObject r) { JSONObject h = r.optJSONObject("headers"); return h == null ? "" : h.optString("oc-etag", h.optString("etag", "")); }

    public static boolean run(String base, String user, String pw, String xlsx) throws Exception {
        String folder = "/SR Test " + System.currentTimeMillis() + "/";
        byte[] file = Files.readAllBytes(Paths.get(xlsx));
        JSONObject x;
        x = r(base, user, pw, folder, "MKCOL", "", "{}", null); ok(x.optInt("status") == 201, "MKCOL folder → 201 (" + x.optInt("status") + " " + x.optString("error") + ")");
        x = r(base, user, pw, folder, "MKCOL", "backups", "{}", null); ok(x.optInt("status") == 201, "MKCOL backups → 201");
        x = r(base, user, pw, folder, "HEAD", "database.xlsx", "{}", null); ok(x.optInt("status") == 404, "HEAD missing file → 404");
        x = r(base, user, pw, folder, "PUT", "database.xlsx", "{\"Content-Type\":\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\",\"If-None-Match\":\"*\"}", file);
        ok(x.optInt("status") == 201, "PUT new file → 201 (" + x.optInt("status") + ")");
        String e1 = etag(x); ok(!e1.isEmpty(), "PUT answer has an ETag " + e1);
        x = r(base, user, pw, folder, "HEAD", "database.xlsx", "{}", null);
        ok(x.optInt("status") == 200 && x.getJSONObject("headers").optString("content-length").equals("" + file.length), "HEAD size = " + file.length + " (" + x.getJSONObject("headers").optString("content-length") + ")");
        x = r(base, user, pw, folder, "GET", "database.xlsx", "{}", null);
        byte[] got = Base64.getDecoder().decode(x.optString("body"));
        ok(Arrays.equals(got, file), "GET gives back exactly the uploaded bytes (" + got.length + ")");
        x = r(base, user, pw, folder, "COPY", "database.xlsx", "{\"X-Dest-Name\":\"backups/database-20261114-101500.xlsx\",\"Overwrite\":\"F\"}", null);
        ok(x.optInt("status") == 201, "COPY to backups/ → 201 (" + x.optInt("status") + ")");
        x = r(base, user, pw, folder, "PROPFIND", "backups", "{\"Depth\":\"1\",\"Content-Type\":\"application/xml\"}", "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:getlastmodified/></d:prop></d:propfind>".getBytes("UTF-8"));
        ok(x.optInt("status") == 207 && new String(Base64.getDecoder().decode(x.optString("body")), "UTF-8").contains("database-20261114-101500.xlsx"), "PROPFIND lists the backup");
        byte[] v2 = Arrays.copyOf(file, file.length); // same bytes, new version
        x = r(base, user, pw, folder, "PUT", "database.xlsx", "{\"If-Match\":" + JSONObject.quote(e1) + "}", v2);
        ok(x.optInt("status") == 204 || x.optInt("status") == 201, "PUT with the right If-Match → 2xx (" + x.optInt("status") + ")");
        x = r(base, user, pw, folder, "PUT", "database.xlsx", "{\"If-Match\":\"\\\"stale\\\"\"}", v2);
        ok(x.optInt("status") == 412, "PUT with an old If-Match → 412 (" + x.optInt("status") + ")");
        x = r(base, user, pw, folder, "PUT", "database.xlsx", "{\"If-None-Match\":\"*\"}", v2);
        ok(x.optInt("status") == 412, "PUT new-file-only when it exists → 412 (" + x.optInt("status") + ")");
        x = r(base, user, pw + "x", folder, "HEAD", "database.xlsx", "{}", null);
        ok(x.optInt("status") == 401, "wrong password → 401 (" + x.optInt("status") + ")");
        r(base, user, pw, folder, "DELETE", "", "{}", null);
        System.out.println(fails == 0 ? "ALL PASSED" : fails + " FAILED");
        return fails == 0;
    }
}
