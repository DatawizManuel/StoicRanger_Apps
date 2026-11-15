import at.stoicranger.fitness.NcFile;
import at.stoicranger.fitness.WebDav;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;
import java.util.List;

/**
 * Test helper (tools/test-nextcloud.sh): the app's own Android WebDAV code (WebDav.java + NcFile.java) on the JVM,
 * reachable from the test page over localhost, so the page's sync talks to a REAL Nextcloud through the same Java code
 * the phone runs. Also a quick probe of the WebDAV basics (wrong password, 412, backups).
 *   java NcBridge <nextcloud url> <user> <password> <folder> <file>        prints the port, serves until killed
 *   POST /download → {status, etag, error, b64}     POST /upload (body: etag \n base64) → {status, etag, error}
 *   POST /seed (body: base64) puts a file in place  POST /list?dir=backups → names     POST /password (body) sets it
 */
public class NcBridge {
    static String url, user, pw, folder, file;

    public static void main(String[] a) throws Exception {
        url = a[0]; user = a[1]; pw = a[2]; folder = a[3]; file = a[4];
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", new HttpHandler() {
            @Override public void handle(HttpExchange x) {
                try { serve(x); } catch (Exception e) { reply(x, "{\"status\":0,\"error\":" + q(String.valueOf(e)) + "}"); }
            }
        });
        s.start();
        System.out.println(s.getAddress().getPort());
        System.out.flush();
    }

    static NcFile nc() { return new NcFile(new WebDav(url, user, pw), folder, file); }

    static void serve(HttpExchange x) throws Exception {
        String path = x.getRequestURI().getPath();
        if ("OPTIONS".equals(x.getRequestMethod())) { reply(x, "{}"); return; }
        String body = new String(readAll(x.getRequestBody()), StandardCharsets.UTF_8);
        WebDav.Res r;
        if (path.equals("/download")) r = nc().download();
        else if (path.equals("/upload")) {
            int nl = body.indexOf('\n');
            r = nc().upload(Base64.getDecoder().decode(body.substring(nl + 1).trim()), body.substring(0, nl), NcFile.stamp(new Date()));
        } else if (path.equals("/seed")) {
            NcFile f = nc(); new WebDav(url, user, pw).mkdirs(folder);
            WebDav.Res old = f.download();
            r = new WebDav(url, user, pw).put(folder + file, Base64.getDecoder().decode(body.trim()), old.status == 200 ? old.etag : null);
        } else if (path.equals("/list")) {
            List<String> names = new WebDav(url, user, pw).list(folder + "backups/");
            StringBuilder b = new StringBuilder("[");
            for (String n : names) b.append(b.length() > 1 ? "," : "").append(q(n));
            reply(x, b.append("]").toString()); return;
        } else if (path.equals("/password")) { pw = body; reply(x, "{}"); return; }
        else if (path.equals("/probe")) { reply(x, probe()); return; }
        else { reply(x, "{\"status\":404}"); return; }
        reply(x, "{\"status\":" + r.status + ",\"etag\":" + q(r.etag) + ",\"error\":" + q(r.error)
                + (path.equals("/download") && r.status == 200 ? ",\"b64\":" + q(Base64.getEncoder().encodeToString(r.body)) : "") + "}");
    }

    /** WebDAV basics against the real server; returns {"lines":[...], "fails":n}. */
    static String probe() {
        StringBuilder out = new StringBuilder("{\"lines\":[");
        int[] fails = { 0 };
        String folderP = folder + "probe/";
        WebDav bad = new WebDav(url, user, "wrong-password");
        WebDav dav = new WebDav(url, user, pw);
        NcFile f = new NcFile(dav, folderP, "probe.xlsx");
        line(out, fails, new NcFile(bad, folderP, "probe.xlsx").test().status == 401, "wrong app password: 401");
        line(out, fails, f.test().status == 200, "folder made (MKCOL), login works");
        byte[] v1 = "PK probe one".getBytes(StandardCharsets.UTF_8), v2 = "PK probe two".getBytes(StandardCharsets.UTF_8);
        WebDav.Res u = f.upload(v1, "", "20261114-100000");
        line(out, fails, u.ok() && !u.etag.isEmpty(), "create with If-None-Match, read back byte-identical, ETag " + u.etag);
        line(out, fails, f.upload(v1, "", "20261114-100001").status == 412, "create refused when the file exists (412)");
        line(out, fails, f.upload(v2, "\"stale\"", "20261114-100002").status == 412, "stale ETag refused (412)");
        WebDav.Res d = f.download();
        line(out, fails, d.status == 200 && new String(d.body, StandardCharsets.UTF_8).equals("PK probe one"), "unchanged after the 412s");
        u = f.upload(v2, d.etag, "20261114-100003");
        line(out, fails, u.ok(), "upload with If-Match, read back byte-identical");
        List<String> b = dav.list(folderP + "backups/");
        line(out, fails, b.contains("probe-20261114-100003.xlsx"), "backup copy (COPY) before the upload, listed by PROPFIND: " + b);
        line(out, fails, f.upload("no zip".getBytes(StandardCharsets.UTF_8), u.etag, "20261114-100004").status == 0, "bytes that are not an xlsx never sent");
        line(out, fails, dav.copyOver(folderP + "backups/probe-20261114-100003.xlsx", folderP + "probe.xlsx").ok()
                && new String(f.download().body, StandardCharsets.UTF_8).equals("PK probe one"), "a backup can be put back in place (COPY, Overwrite T)");
        dav.delete(folderP + "probe.xlsx"); dav.delete(folderP + "backups/probe-20261114-100003.xlsx");
        return out.append("],\"fails\":").append(fails[0]).append("}").toString();
    }
    static void line(StringBuilder out, int[] fails, boolean c, String m) {
        if (out.charAt(out.length() - 1) != '[') out.append(',');
        out.append(q((c ? "PASS " : "FAIL ") + "Android WebDAV code: " + m));
        if (!c) fails[0]++;
    }

    static void reply(HttpExchange x, String json) {
        try {
            byte[] b = json.getBytes(StandardCharsets.UTF_8);
            x.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
            x.getResponseHeaders().add("Access-Control-Allow-Headers", "*");
            x.getResponseHeaders().add("Content-Type", "application/json");
            x.sendResponseHeaders(200, b.length);
            try (OutputStream os = x.getResponseBody()) { os.write(b); }
        } catch (Exception ignored) { }
    }
    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : String.valueOf(s).toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    static byte[] readAll(InputStream is) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
        while ((n = is.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }
}
