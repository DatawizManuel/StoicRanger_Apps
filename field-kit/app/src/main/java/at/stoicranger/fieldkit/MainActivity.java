package at.stoicranger.fieldkit;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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
 * Single-activity shell (same design as the other Stoic Ranger apps). The whole UI is the offline web app in
 * assets/www, served from https://appassets.androidplatform.net/ so it gets a normal secure origin. Native code
 * only does what a web page can't: durable storage (db.json), location on request, keeping the screen on,
 * printing, saving and sharing files, reading guns and ammunition from Stoic Ranger (read-only, after consent),
 * the optional Nextcloud sync, offline map files (files/maps), sensors, flashlight and screen brightness.
 * The page itself never goes online: only the Java side talks to the user's own Nextcloud, when the user set it up.
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    /** Stoic Ranger (one app since 1.0; package kept from SR_Database) and its link provider. */
    static final String SR_PACKAGE = "at.rangebook.app";
    static final String SR_LINK = "content://at.rangebook.app.link";
    private static final int REQ_CREATE = 12, REQ_LOCATION = 14, REQ_OPEN = 15;

    private WebView web;
    private String pendingCb;
    private byte[] pendingBytes;
    private WebView printView;   // kept alive until the print job has been laid out
    private String openCb, openKind;
    private volatile boolean mapCancel, torchOn;
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

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
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // breathing and par-timer tones
        s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        web.addJavascriptInterface(new Bridge(), "FKNative");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("SRFieldKit", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
            /** "Use my position": the web page asks, Android asks the user (only now), the answer goes back. Never remembered by the WebView. */
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (!ORIGIN.startsWith(origin.replaceAll("/$", ""))) { cb.invoke(origin, false, false); return; }
                if (hasLocation()) { cb.invoke(origin, true, false); return; }
                geoOrigin = origin; geoCallback = cb;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl(ORIGIN + "/www/index.html");
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocation(), false);
            geoCallback = null; geoOrigin = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.FK && FK.pause && FK.pause()", null);
        if (torchOn) { Sensors.torch(this, false); torchOn = false; }   // the signal light never stays on behind the app
    }

    /** The WebView's prefers-color-scheme does not follow the phone reliably: tell the page directly. */
    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
    private void pushNight() {
        web.evaluateJavascript("window.FK && FK.setSysDark && FK.setSysDark(" + isNight() + ")", null);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (web != null) {
            pushNight();
            web.evaluateJavascript("window.FK && FK.resume && FK.resume()", null);
        }
    }

    /** Phone Back, exactly as in SR Daily Thoughts (where Back works on Manuel's phone): the page decides
     *  (FK.back in js/fk.js) and only a plain false closes the app. Each press is logged for ⋯ › About. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.FK && FK.back) ? FK.back() : false", new android.webkit.ValueCallback<String>() { @Override public void onReceiveValue(String value) {
            logBack("back", value);
            if ("false".equals(value)) finish();      // only a plain false closes the app
        }});
    }

    private void logBack(String via, String value) {
        try {
            File f = new File(getFilesDir(), "back-log.txt");
            String old = "";
            if (f.exists()) try (FileInputStream is = new FileInputStream(f)) { old = new String(readAll(is), StandardCharsets.UTF_8); }
            String line = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT).format(new java.util.Date())
                + " " + via + " → " + value + "\n";
            String[] rows = (old + line).split("\n");
            StringBuilder b = new StringBuilder();
            for (int i = Math.max(0, rows.length - 8); i < rows.length; i++) if (!rows[i].isEmpty()) b.append(rows[i]).append('\n');
            try (FileOutputStream os = new FileOutputStream(f)) { os.write(b.toString().getBytes(StandardCharsets.UTF_8)); }
        } catch (Exception ignored) { }
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        web.evaluateJavascript("window.dispatchEvent(new Event('resize'))", null);
        pushNight();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CREATE) {
            String cb = pendingCb; byte[] bytes = pendingBytes;
            pendingCb = null; pendingBytes = null;
            if (res != RESULT_OK || data == null || data.getData() == null) { callback(cb, false, "cancelled"); return; }
            try (OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt")) {
                os.write(bytes);
                callback(cb, true, displayName(data.getData()));
            } catch (Exception e) { callback(cb, false, e.getMessage()); }
        }
        if (req == REQ_OPEN) {
            final String cb = openCb, kind = openKind;
            openCb = null; openKind = null;
            if (res != RESULT_OK || data == null || data.getData() == null) { callback(cb, false, "cancelled"); return; }
            final Uri u = data.getData();
            new Thread(new Runnable() { @Override public void run() { readPicked(u, kind, cb); } }).start();
        }
    }

    /** A file the user picked: a GPX route comes back as text; a map file is copied into files/maps. */
    private void readPicked(Uri u, String kind, String cb) {
        String name = displayName(u);
        try (InputStream is = getContentResolver().openInputStream(u)) {
            if ("gpx".equals(kind)) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[65536]; int n; long tot = 0;
                while ((n = is.read(buf)) > 0) { tot += n; if (tot > 5L * 1024 * 1024) throw new IOException("The file is larger than 5 MB."); bo.write(buf, 0, n); }
                JSONObject o = new JSONObject().put("name", name == null ? "Route" : name).put("text", new String(bo.toByteArray(), StandardCharsets.UTF_8));
                callback(cb, true, o.toString());
                return;
            }
            String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._ ()-]+", "_");
            if (!MapFiles.safe(safe)) throw new IOException("Pick a map file ending in .pmtiles.");
            File target = MapFiles.file(this, safe), part = new File(MapFiles.dir(this), safe + ".part");
            byte[] head = new byte[7];
            try (OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[131072]; int n; boolean first = true;
                while ((n = is.read(buf)) > 0) {
                    if (first) { System.arraycopy(buf, 0, head, 0, Math.min(7, n)); first = false; }
                    os.write(buf, 0, n);
                }
            }
            if (!"PMTiles".equals(new String(head, StandardCharsets.US_ASCII))) { part.delete(); throw new IOException("This is not a PMTiles map file."); }
            if (!MapFiles.finish(part, target)) { part.delete(); throw new IOException("Could not store the map file."); }
            callback(cb, true, safe);
        } catch (Exception e) { callback(cb, false, e.getMessage()); }
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return u.getLastPathSegment();
    }

    private void callback(String cb, boolean ok, String msg) {
        if (cb == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok); o.put("msg", msg == null ? "" : msg);
            final String js = "window.FKNativeCallback && FKNativeCallback(" + JSONObject.quote(cb) + "," + o.toString() + ")";
            runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
        } catch (Exception ignored) { }
    }

    static byte[] readAll(InputStream is) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    /* ---------- assets served from a https origin ---------- */
    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            // the page stays offline: only the Java side talks to the user's Nextcloud (sync), the WebView loads nothing else
            if (!"appassets.androidplatform.net".equals(u.getHost())) {
                String sc = u.getScheme();
                if ("http".equals(sc) || "https".equals(sc)) return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null, null);
                return null;
            }
            String path = u.getPath();
            if (path != null && path.startsWith("/maps/")) {     // a piece of an offline map file: /maps/<name>?o=<offset>&l=<length>
                try {
                    String name = path.substring(6);
                    long o = Long.parseLong(u.getQueryParameter("o"));
                    int l = Integer.parseInt(u.getQueryParameter("l"));
                    WebResourceResponse resp = new WebResourceResponse("application/octet-stream", null, MapFiles.slice(MainActivity.this, name, o, l));
                    java.util.Map<String, String> h = new java.util.HashMap<>();
                    h.put("Cache-Control", "no-store");
                    resp.setResponseHeaders(h);
                    return resp;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }
            if (path == null || !path.startsWith("/www/") || path.contains("..")) return null;
            try {
                InputStream is = getAssets().open(path.substring(1));
                WebResourceResponse resp = new WebResourceResponse(mime(path), mime(path).startsWith("text") || path.endsWith(".js") ? "utf-8" : null, is);
                java.util.Map<String, String> h = new java.util.HashMap<>();
                h.put("Cache-Control", "no-cache");
                resp.setResponseHeaders(h);
                return resp;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
            }
        }

        /** Links leave the app (the website in the About screen opens in the browser; the page never loads web content).
         *  (No @Override: the cloud build compiles against an API 23 android.jar that lacks this API 24 method.) */
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
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    /** Prints a PDF from assets/www/printables as it is (the user picks printer, paper and copies). */
    private class AssetPdfAdapter extends PrintDocumentAdapter {
        private final String path, name;
        AssetPdfAdapter(String path, String name) { this.path = path; this.name = name; }
        @Override
        public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle extras) {
            if (c.isCanceled()) { cb.onLayoutCancelled(); return; }
            cb.onLayoutFinished(new PrintDocumentInfo.Builder(name + ".pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
        }
        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal c, WriteResultCallback cb) {
            try (InputStream is = getAssets().open(path); OutputStream os = new FileOutputStream(dest.getFileDescriptor())) {
                byte[] buf = new byte[65536]; int k;
                while ((k = is.read(buf)) > 0) { if (c.isCanceled()) { cb.onWriteCancelled(); return; } os.write(buf, 0, k); }
                cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (Exception e) { cb.onWriteFailed(e.getMessage()); }
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
            try (FileInputStream is = new FileInputStream(f)) {
                return new String(readAll(is), StandardCharsets.UTF_8);
            } catch (IOException e) { return ""; }
        }

        /** Atomic write: temp file, keep the previous version as db.bak.json, then rename. */
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

        /** Copy of db.json into files/backups/ before a format migration (or of a damaged file); keeps the newest 10. */
        @JavascriptInterface
        public boolean backupDb(String name) {
            File src = dbFile();
            if (!src.exists() || name == null || name.contains("/") || name.contains("..")) return false;
            File dir = new File(getFilesDir(), "backups");
            dir.mkdirs();
            try (FileInputStream is = new FileInputStream(src); FileOutputStream os = new FileOutputStream(new File(dir, name))) {
                os.write(readAll(is));
                os.getFD().sync();
            } catch (IOException e) { return false; }
            File[] all = dir.listFiles();
            if (all != null && all.length > 10) {
                java.util.Arrays.sort(all, new java.util.Comparator<File>() { @Override public int compare(File a, File b) { return Long.compare(b.lastModified(), a.lastModified()); } });
                for (int i = 10; i < all.length; i++) all[i].delete();
            }
            return true;
        }

        @JavascriptInterface
        public String loadDbBackup() {
            File f = new File(getFilesDir(), "db.bak.json");
            if (!f.exists()) return "";
            try (FileInputStream is = new FileInputStream(f)) {
                return new String(readAll(is), StandardCharsets.UTF_8);
            } catch (IOException e) { return ""; }
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

        /** Breathing pacer and par timer: keep the screen on while they run. */
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(new Runnable() { @Override public void run() {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }});
        }

        /** Last Back presses (for ⋯ › About) and whether the Android 13+ back callback is registered. */
        @JavascriptInterface
        public String backLog() {
            String t = "";
            try (FileInputStream is = new FileInputStream(new File(getFilesDir(), "back-log.txt"))) { t = new String(readAll(is), StandardCharsets.UTF_8); }
            catch (Exception ignored) { }
            return "Android " + Build.VERSION.RELEASE + " · " + Build.MANUFACTURER + " " + Build.MODEL + "\n" + t;
        }

        @JavascriptInterface
        public boolean hasLocation() { return MainActivity.this.hasLocation(); }

        /** After the user refused location: open this app's page in the Android settings. */
        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(new Runnable() { @Override public void run() {
                try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
                catch (Exception ignored) { }
            }});
        }

        /** {installed, version} of Stoic Ranger. Reads nothing from it. */
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

        /** Read-only call to Stoic Ranger's link provider ("ballistics": guns, ammunition, measured V0).
         *  The web app only calls this after the user allowed linking. Errors come back as {"error": …}. */
        @JavascriptInterface
        public String srCall(String method) {
            if (!"status".equals(method) && !"ballistics".equals(method)) return "{\"error\":\"unknown method\"}";
            try {
                Bundle b = getContentResolver().call(Uri.parse(SR_LINK), method, null, null);
                String j = b == null ? null : b.getString("json");
                return j == null ? "{\"error\":\"no-provider\"}" : j;
            } catch (IllegalArgumentException e) {
                return "{\"error\":\"no-provider\"}";      // Stoic Ranger without the link (older version)
            } catch (SecurityException e) {
                return "{\"error\":\"not-permitted\"}";    // different signing key
            } catch (Exception e) {
                try { return "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}"; } catch (Exception x) { return "{\"error\":\"failed\"}"; }
            }
        }

        // ---------- where the data is stored: phone only, or phone + Nextcloud (SHARED-DB-CONTRACT) ----------
        /** {mode, url, user, folder, file, changed, hasPassword}. The password never goes to the page. */
        @JavascriptInterface
        public String syncGet() { return SyncStore.get(MainActivity.this, false).toString(); }

        /** Save the storage setting. password: null/undefined keeps the saved one, "" removes it. */
        @JavascriptInterface
        public boolean syncSet(String json, String password, String changed) {
            try { return SyncStore.set(MainActivity.this, new JSONObject(json), password, changed); }
            catch (Exception e) { return false; }
        }

        /** One WebDAV request to the saved Nextcloud, off the UI thread. Result to FKNativeCallback(cb, {status, etag, body, error}). */
        @JavascriptInterface
        public void ncRequest(final String method, final String path, final String b64, final String ifMatch, final String depth, final String cb) {
            new Thread(new Runnable() { @Override public void run() {
                JSONObject cfg = SyncStore.get(MainActivity.this, true);
                byte[] body = b64 == null || b64.isEmpty() ? null : Base64.decode(b64, Base64.DEFAULT);
                JSONObject r;
                if (!"GET".equals(method) && !"PUT".equals(method) && !"MKCOL".equals(method) && !"PROPFIND".equals(method) && !"DELETE".equals(method)) {
                    r = new JSONObject(); try { r.put("status", 0).put("error", "method not allowed"); } catch (Exception ignored) { }
                } else if (path == null || path.contains("..")) {
                    r = new JSONObject(); try { r.put("status", 0).put("error", "bad path"); } catch (Exception ignored) { }
                } else r = NcClient.request(cfg, method, path, body, ifMatch, depth);
                final String js = "window.FKNativeCallback && FKNativeCallback(" + JSONObject.quote(cb) + "," + r.toString() + ")";
                runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
            } }).start();
        }

        /** Storage setting of a linked app (call "storage" / "setStorage" on <package>.link). Only after the user's consent. */
        @JavascriptInterface
        public String linkCall(String pkg, String method, String arg) {
            if (!SR_PACKAGE.equals(pkg)) return "{\"error\":\"unknown app\"}";
            if (!"storage".equals(method) && !"setStorage".equals(method)) return "{\"error\":\"unknown method\"}";
            try {
                if ("setStorage".equals(method)) {     // push our setting including the password (same signature only)
                    JSONObject mine = SyncStore.get(MainActivity.this, true);
                    arg = mine.toString();
                }
                Bundle b = getContentResolver().call(Uri.parse("content://" + pkg + ".link"), method, arg, null);
                String j = b == null ? null : b.getString("json");
                if (j == null) return "{\"error\":\"no-provider\"}";
                if ("storage".equals(method)) {        // the page never sees the password
                    JSONObject o = new JSONObject(j); o.put("hasPassword", o.optString("password").length() > 0); o.remove("password"); return o.toString();
                }
                return j;
            } catch (IllegalArgumentException e) { return "{\"error\":\"no-provider\"}"; }
            catch (SecurityException e) { return "{\"error\":\"not-permitted\"}"; }
            catch (Exception e) { return "{\"error\":\"failed\"}"; }
        }

        /** Adopt a linked app's newer storage setting, password included, without passing it through the page. */
        @JavascriptInterface
        public boolean linkAdoptStorage(String pkg) {
            if (!SR_PACKAGE.equals(pkg)) return false;
            try {
                Bundle b = getContentResolver().call(Uri.parse("content://" + pkg + ".link"), "storage", null, null);
                String j = b == null ? null : b.getString("json");
                if (j == null) return false;
                JSONObject o = new JSONObject(j);
                if (o.has("error")) return false;
                String pw = o.has("password") ? o.optString("password", "") : null;
                return SyncStore.set(MainActivity.this, o, pw, o.optString("changed", ""));
            } catch (Exception e) { return false; }
        }

        // ---------- offline maps (remark #7) ----------
        @JavascriptInterface
        public String mapList() { return MapFiles.list(MainActivity.this); }

        /** Fallback reader (the page normally fetches /maps/<name>?o=&l=): base64 of a piece of a map file. */
        @JavascriptInterface
        public String mapRead(String name, double offset, int length) {
            try { return Base64.encodeToString(MapFiles.read(MainActivity.this, name, (long) offset, length), Base64.NO_WRAP); }
            catch (Exception e) { return null; }
        }

        @JavascriptInterface
        public boolean mapDelete(String name) { return MapFiles.delete(MainActivity.this, name); }

        @JavascriptInterface
        public double mapFree() { return (double) MapFiles.free(MainActivity.this); }

        /** {online, wifi}: for the "download on Wi-Fi only" setting. */
        @JavascriptInterface
        public String netState() {
            try {
                android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                android.net.NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
                boolean online = nc != null && nc.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
                boolean wifi = nc != null && (nc.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) || nc.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET));
                return new JSONObject().put("online", online).put("wifi", wifi).toString();
            } catch (Exception e) { return "{\"online\":true,\"wifi\":false}"; }
        }

        /** Downloads one map file from the saved Nextcloud (path relative to the user's files) into files/maps/<name>:
         *  .part first, checksum checked, then renamed; an older copy is replaced only when the new one is complete.
         *  Progress and the result go to FKMapProgress(id, done, total, state, msg); state = run | done | error. */
        @JavascriptInterface
        public void mapDownload(final String path, final String name, final String sha256, final double size, final String id) {
            mapCancel = false;
            new Thread(new Runnable() { @Override public void run() {
                String err = null;
                File part = null;
                try {
                    if (path == null || path.contains("..")) throw new IOException("bad path");
                    File target = MapFiles.file(MainActivity.this, name);
                    if (size > 0 && MapFiles.free(MainActivity.this) < size + 200L * 1024 * 1024)
                        throw new IOException("Not enough free space on the phone (" + Math.round(size / 1e6) + " MB needed).");
                    part = new File(MapFiles.dir(MainActivity.this), name + ".part");
                    JSONObject r = NcClient.download(SyncStore.get(MainActivity.this, true), path, part, new NcClient.Progress() {
                        @Override public boolean step(long done, long total) { progress(id, done, total, "run", ""); return !mapCancel; }
                    });
                    int st = r.optInt("status");
                    if (st != 200) throw new IOException(r.has("error") ? r.optString("error") : st == 404 ? "The file is not on Nextcloud (any more)." : st == 401 ? "Nextcloud refused the login. Check the app password." : "Nextcloud answered " + st + ".");
                    if (r.has("error")) throw new IOException(r.optString("error"));
                    if (sha256 != null && !sha256.isEmpty() && !sha256.equalsIgnoreCase(r.optString("sha256")))
                        throw new IOException("The downloaded file is damaged (checksum differs). Nothing was replaced.");
                    if (!MapFiles.finish(part, target)) throw new IOException("Could not store the map file.");
                    part = null;
                } catch (Exception e) { err = e.getMessage() == null ? "failed" : e.getMessage(); }
                if (part != null) part.delete();
                progress(id, 0, 0, err == null ? "done" : "error", err == null ? "" : err);
            } }).start();
        }

        @JavascriptInterface
        public void mapCancel() { mapCancel = true; }

        private void progress(String id, long done, long total, String state, String msg) {
            final String js = "window.FKMapProgress && FKMapProgress(" + JSONObject.quote(id) + "," + done + "," + total + "," + JSONObject.quote(state) + "," + JSONObject.quote(msg) + ")";
            runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
        }

        /** Let the user pick a file: kind "gpx" (route, comes back as {name, text}) or "map" (copied into files/maps). */
        @JavascriptInterface
        public void pickFile(final String kind, final String cb) {
            runOnUiThread(new Runnable() { @Override public void run() {
                openCb = cb; openKind = kind;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { callback(cb, false, e.getMessage()); }
            }});
        }

        // ---------- sensors, flashlight, brightness (remarks #4 and #6) ----------
        /** {hasPressure, hasTemp, pressure (hPa), temp (°C)} to FKNativeCallback(cb, {ok, msg}). Only when the user taps. */
        @JavascriptInterface
        public void sensors(final String cb) {
            Sensors.read(MainActivity.this, new Sensors.Done() { @Override public void done(JSONObject r) { callback(cb, true, r.toString()); } });
        }

        @JavascriptInterface
        public boolean hasTorch() { return Sensors.hasTorch(MainActivity.this); }

        @JavascriptInterface
        public boolean torch(boolean on) { torchOn = on; return Sensors.torch(MainActivity.this, on); }

        /** Screen brightness for this app only: 0.01 … 1, or below 0 to follow the phone again. */
        @JavascriptInterface
        public void setBrightness(final double f) {
            runOnUiThread(new Runnable() { @Override public void run() {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = f < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : (float) Math.max(0.01, Math.min(1, f));
                getWindow().setAttributes(lp);
            }});
        }

        /** Let the user pick where to save (Downloads, Drive, …). */
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64, String cb) {
            runOnUiThread(new Runnable() { @Override public void run() {
                pendingCb = cb;
                pendingBytes = Base64.decode(base64, Base64.DEFAULT);
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_CREATE); } catch (Exception e) { callback(cb, false, e.getMessage()); }
            }});
        }

        /** Share a PDF from assets/www/printables (e.g. to send a range card to a print shop). */
        @JavascriptInterface
        public void shareAsset(String path, String name) {
            runOnUiThread(new Runnable() { @Override public void run() {
                try {
                    if (path == null || !path.startsWith("www/printables/") || path.contains("..")) return;
                    File dir = new File(getCacheDir(), "shared");
                    dir.mkdirs();
                    File f = new File(dir, name.replaceAll("[^\\w.\\-]+", "_"));
                    try (InputStream is = getAssets().open(path); FileOutputStream os = new FileOutputStream(f)) { os.write(readAll(is)); }
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime(path));
                    i.putExtra(Intent.EXTRA_STREAM, SharedFileProvider.uriFor(f));
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Share"));
                } catch (Exception ignored) { }
            }});
        }

        /** Print (or "Save as PDF") a PDF that ships with the app. */
        @JavascriptInterface
        public void printAsset(String path, String jobName) {
            if (path == null || !path.startsWith("www/printables/") || path.contains("..")) return;
            runOnUiThread(new Runnable() { @Override public void run() {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build();
                pm.print(jobName, new AssetPdfAdapter(path, jobName), attrs);
            }});
        }

        /** Print (or "Save as PDF") an HTML document rendered by the web app (field cards, wind cheat sheet); A4 portrait. */
        @JavascriptInterface
        public void print(String html, String jobName) {
            runOnUiThread(new Runnable() { @Override public void run() {
                printView = new WebView(MainActivity.this);
                printView.getSettings().setJavaScriptEnabled(false);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                        return new AssetClient().shouldInterceptRequest(v, r);
                    }
                    @Override
                    public void onPageFinished(WebView v, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter ad = v.createPrintDocumentAdapter(jobName);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build();
                        pm.print(jobName, ad, attrs);
                    }
                });
                printView.loadDataWithBaseURL(ORIGIN + "/www/", html, "text/html", "utf-8", null);
            }});
        }
    }
}
