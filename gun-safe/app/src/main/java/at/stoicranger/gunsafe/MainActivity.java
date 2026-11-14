package at.stoicranger.gunsafe;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Single-activity shell (same design as the other Stoic Ranger apps). The UI is the offline web app in assets/www,
 * served from https://appassets.androidplatform.net/. Native code does what a web page can't: durable storage
 * (db.json), saving and opening the xlsx file, the link to SR Shooting (after the user allowed it), and the optional
 * Nextcloud sync (WebDAV, only when the user turned it on; the internet permission is used for nothing else).
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    /** Stoic Ranger apps this app may link with (after the user allowed it). */
    static final String SR_PACKAGE = "at.rangebook.app";
    private static final int REQ_CREATE = 12, REQ_OPEN = 13;

    private WebView web;
    private String pendingCb;
    private byte[] pendingBytes;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.addJavascriptInterface(new Bridge(), "GSNative");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("SRGunSafe", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl(ORIGIN + "/www/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onPause() { super.onPause(); web.evaluateJavascript("window.GS && GS.pause && GS.pause()", null); }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    public void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.GS && GS.resume && GS.resume(" + isNight() + ")", null);
    }

    /** Phone Back the Daily Thoughts way: the page decides (GS.back in js/gs.js); only a plain false closes the app. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.GS && GS.back) ? GS.back() : false", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                logBack(value);
                if ("false".equals(value)) finish();
            }
        });
    }

    private void logBack(String value) {
        try {
            File f = new File(getFilesDir(), "back-log.txt");
            String old = f.exists() ? new String(readFile(f), StandardCharsets.UTF_8) : "";
            String line = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT).format(new java.util.Date()) + " back → " + value + "\n";
            String[] rows = (old + line).split("\n");
            StringBuilder b = new StringBuilder();
            for (int i = Math.max(0, rows.length - 8); i < rows.length; i++) if (!rows[i].isEmpty()) b.append(rows[i]).append('\n');
            writeFile(f, b.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) { }
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        web.evaluateJavascript("window.GS && GS.resume && GS.resume(" + isNight() + ")", null);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        String cb = pendingCb; byte[] bytes = pendingBytes;
        pendingCb = null; pendingBytes = null;
        if (res != RESULT_OK || data == null || data.getData() == null) { callback(cb, false, "cancelled", null); return; }
        Uri u = data.getData();
        if (req == REQ_CREATE) {
            try (OutputStream os = getContentResolver().openOutputStream(u, "wt")) {
                os.write(bytes);
                callback(cb, true, displayName(u), null);
            } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
        } else if (req == REQ_OPEN) {
            try (InputStream is = getContentResolver().openInputStream(u)) {
                callback(cb, true, displayName(u), Base64.encodeToString(readAll(is), Base64.NO_WRAP));
            } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
        }
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return u.getLastPathSegment();
    }

    /** Answers the page: GSNativeCallback(id, {ok, msg, data?, …}). */
    private void callback(String cb, boolean ok, String msg, String data) {
        if (cb == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok); o.put("msg", msg == null ? "" : msg);
            if (data != null) o.put("data", data);
            reply(cb, o);
        } catch (Exception ignored) { }
    }

    private void reply(String cb, JSONObject o) {
        final String js = "window.GSNativeCallback && GSNativeCallback(" + JSONObject.quote(cb) + "," + o.toString() + ")";
        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
    }

    static byte[] readAll(InputStream is) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    static byte[] readFile(File f) throws IOException {
        try (FileInputStream is = new FileInputStream(f)) { return readAll(is); }
    }

    /** Atomic write: temp file, synced, then renamed over the old one. */
    static boolean writeFile(File f, byte[] data) {
        File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream os = new FileOutputStream(tmp)) { os.write(data); os.getFD().sync(); }
        catch (IOException e) { return false; }
        return tmp.renameTo(f);
    }

    /* ---------- assets served from a https origin ---------- */
    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (!"appassets.androidplatform.net".equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || !path.startsWith("/www/") || path.contains("..")) return null;
            try {
                InputStream is = getAssets().open(path.substring(1));
                String m = mime(path);
                WebResourceResponse resp = new WebResourceResponse(m, m.startsWith("text") || path.endsWith(".js") ? "utf-8" : null, is);
                java.util.Map<String, String> h = new java.util.HashMap<String, String>();
                h.put("Cache-Control", "no-cache");
                resp.setResponseHeaders(h);
                return resp;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
            }
        }

        /** Links leave the app. (No @Override: the cloud build compiles against API 23.) */
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if ("appassets.androidplatform.net".equals(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
            return true;
        }
    }

    static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    /** Calls a Stoic Ranger app's link provider. Errors come back as {"error": …}. */
    String linkCall(String pkg, String method, String arg) {
        try {
            Bundle b = getContentResolver().call(Uri.parse("content://" + pkg + ".link"), method, arg, null);
            String j = b == null ? null : b.getString("json");
            return j == null ? "{\"error\":\"no-provider\"}" : j;
        } catch (IllegalArgumentException e) {
            return "{\"error\":\"no-provider\"}";      // app without the link (older version)
        } catch (SecurityException e) {
            return "{\"error\":\"not-permitted\"}";    // different signing key
        } catch (Exception e) {
            return "{\"error\":\"failed\"}";
        }
    }

    /* ---------- JS bridge ---------- */
    private class Bridge {
        private File dbFile() { return new File(getFilesDir(), "db.json"); }

        @JavascriptInterface
        public String loadDb() {
            File f = dbFile();
            if (!f.exists()) f = new File(getFilesDir(), "db.bak.json");
            if (!f.exists()) return "";
            try { return new String(readFile(f), StandardCharsets.UTF_8); } catch (IOException e) { return ""; }
        }

        /** Atomic write; the previous version is kept as db.bak.json. */
        @JavascriptInterface
        public boolean saveDb(String json) {
            File dir = getFilesDir(), tmp = new File(dir, "db.tmp"), f = dbFile(), bak = new File(dir, "db.bak.json");
            try (FileOutputStream os = new FileOutputStream(tmp)) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
                os.getFD().sync();
            } catch (IOException e) { return false; }
            if (f.exists()) { bak.delete(); f.renameTo(bak); }
            return tmp.renameTo(f);
        }

        @JavascriptInterface
        public String loadDbBackup() {
            File f = new File(getFilesDir(), "db.bak.json");
            if (!f.exists()) return "";
            try { return new String(readFile(f), StandardCharsets.UTF_8); } catch (IOException e) { return ""; }
        }

        /** Copy of db.json into files/backups/ (before a migration, an import, a first sync); keeps the newest 20. */
        @JavascriptInterface
        public boolean backupDb(String name) {
            File src = dbFile();
            if (!src.exists() || name == null || name.contains("/") || name.contains("..")) return false;
            File dir = new File(getFilesDir(), "backups");
            dir.mkdirs();
            try { if (!writeFile(new File(dir, name), readFile(src))) return false; } catch (IOException e) { return false; }
            File[] all = dir.listFiles();
            if (all != null && all.length > 20) {
                java.util.Arrays.sort(all, new java.util.Comparator<File>() {
                    @Override public int compare(File a, File b) { return Long.compare(b.lastModified(), a.lastModified()); }
                });
                for (int i = 20; i < all.length; i++) all[i].delete();
            }
            return true;
        }

        /** Small side files (sync base, tombstones): files/aux-NAME.json. */
        @JavascriptInterface
        public String loadAux(String name) {
            if (name == null || !name.matches("[a-z0-9-]+")) return "";
            File f = new File(getFilesDir(), "aux-" + name + ".json");
            try { return f.exists() ? new String(readFile(f), StandardCharsets.UTF_8) : ""; } catch (IOException e) { return ""; }
        }

        @JavascriptInterface
        public boolean saveAux(String name, String json) {
            if (name == null || !name.matches("[a-z0-9-]+")) return false;
            return writeFile(new File(getFilesDir(), "aux-" + name + ".json"), json.getBytes(StandardCharsets.UTF_8));
        }

        @JavascriptInterface
        public boolean isNight() { return MainActivity.this.isNight(); }

        @JavascriptInterface
        public String appInfo() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                JSONObject o = new JSONObject();
                o.put("version", pi.versionName); o.put("code", pi.versionCode);
                o.put("android", Build.VERSION.RELEASE); o.put("sdk", Build.VERSION.SDK_INT);
                o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public String backLog() {
            String t = "";
            try { t = new String(readFile(new File(getFilesDir(), "back-log.txt")), StandardCharsets.UTF_8); } catch (Exception ignored) { }
            return "Android " + Build.VERSION.RELEASE + " · " + Build.MANUFACTURER + " " + Build.MODEL + "\n" + t;
        }

        /* ----- files: save the xlsx somewhere, open an xlsx ----- */
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64, final String cb) {
            runOnUiThread(new Runnable() { @Override public void run() {
                pendingCb = cb;
                pendingBytes = Base64.decode(base64, Base64.DEFAULT);
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_CREATE); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            }});
        }

        @JavascriptInterface
        public void openFile(final String cb) {
            runOnUiThread(new Runnable() { @Override public void run() {
                pendingCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream" });
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            }});
        }

        /* ----- link with SR Shooting (the page calls these only after the user allowed it) ----- */
        @JavascriptInterface
        public String srStatus() {
            try {
                JSONObject o = new JSONObject();
                try {
                    PackageInfo pi = getPackageManager().getPackageInfo(SR_PACKAGE, 0);
                    o.put("installed", true); o.put("version", pi.versionName);
                } catch (PackageManager.NameNotFoundException e) { o.put("installed", false); }
                return o.toString();
            } catch (Exception e) { return "{\"installed\":false}"; }
        }

        /** status, gunsafe (read guns, barrels, ammunition, rounds fired), putBarrels (barrel switch / new barrel). */
        @JavascriptInterface
        public String srCall(String method, String arg) {
            if (!"status".equals(method) && !"gunsafe".equals(method) && !"putBarrels".equals(method)) return "{\"error\":\"unknown method\"}";
            return linkCall(SR_PACKAGE, method, arg);
        }

        /** The user allowed (or ended) the link with an app: only then may it read and push the storage setting. */
        @JavascriptInterface
        public void setLinked(String pkg, boolean on) { Storage.setLinked(MainActivity.this, pkg, on); }

        /* ----- storage setting (contract section C); the password never reaches the page ----- */
        @JavascriptInterface
        public String storageGet() {
            try { return Storage.load(MainActivity.this).toPublicJson().toString(); } catch (Exception e) { return "{\"mode\":\"local\"}"; }
        }

        /** json: {mode, url, user, folder, file, password?}. Stamps "changed" and saves. */
        @JavascriptInterface
        public String storageSet(String json) {
            try {
                JSONObject o = new JSONObject(json);
                o.remove("changed");
                Storage s = Storage.load(MainActivity.this);
                s.apply(o, false);
                s.save(MainActivity.this);
                return s.toPublicJson().toString();
            } catch (Exception e) { return "{\"error\":\"failed\"}"; }
        }

        /** Push our setting to the linked apps (packages the user allowed, comma separated). Returns {pkg: answer}. */
        @JavascriptInterface
        public String storagePush(String pkgs) {
            JSONObject out = new JSONObject();
            try {
                String mine = Storage.load(MainActivity.this).toLinkJson().toString();
                for (String p : pkgs.split(",")) if (!p.trim().isEmpty()) out.put(p.trim(), new JSONObject(linkCall(p.trim(), "setStorage", mine)));
            } catch (Exception ignored) { }
            return out.toString();
        }

        /** Ask the linked apps for their setting and adopt the newest one. Returns our (public) setting after that. */
        @JavascriptInterface
        public String storagePull(String pkgs) {
            try {
                Storage s = Storage.load(MainActivity.this);
                boolean changed = false;
                for (String p : pkgs.split(",")) {
                    if (p.trim().isEmpty()) continue;
                    JSONObject o = new JSONObject(linkCall(p.trim(), "storage", null));
                    if (o.has("error") || !o.has("mode")) continue;
                    if (s.apply(o, true)) changed = true;
                }
                if (changed) s.save(MainActivity.this);
                JSONObject pub = s.toPublicJson();
                pub.put("adopted", changed);
                return pub.toString();
            } catch (Exception e) { return storageGet(); }
        }

        /* ----- Nextcloud WebDAV, off the UI thread; answers through GSNativeCallback ----- */
        /** op: get | put | putNew | mkdirs | list | delete. path is relative to the user's Nextcloud files. */
        @JavascriptInterface
        public void nc(final String op, final String path, final String base64, final String ifMatch, final String cb) {
            new Thread(new Runnable() { @Override public void run() {
                JSONObject o = new JSONObject();
                try {
                    Storage s = Storage.load(MainActivity.this);
                    Nextcloud n = new Nextcloud(s.url, s.user, s.password());
                    Nextcloud.Result r;
                    if ("get".equals(op)) r = n.get(path);
                    else if ("put".equals(op)) r = n.put(path, Base64.decode(base64, Base64.DEFAULT), ifMatch, false);
                    else if ("putNew".equals(op)) r = n.put(path, Base64.decode(base64, Base64.DEFAULT), null, true);
                    else if ("mkdirs".equals(op)) r = n.mkdirs(path);
                    else if ("list".equals(op)) r = n.list(path);
                    else if ("delete".equals(op)) r = n.delete(path);
                    else { r = new Nextcloud.Result(); r.error = "unknown op"; }
                    o.put("ok", r.ok()); o.put("status", r.status); o.put("etag", r.etag); o.put("msg", r.error);
                    if (r.body != null && "get".equals(op)) o.put("data", Base64.encodeToString(r.body, Base64.NO_WRAP));
                    if (r.names != null) o.put("names", new JSONArray(r.names));
                } catch (Exception e) {
                    try { o.put("ok", false); o.put("status", 0); o.put("msg", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
                }
                reply(cb, o);
            }}).start();
        }
    }
}
