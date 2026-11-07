package at.stoicranger.fitness;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.ConsoleMessage;
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
 * only does what a web page can't: durable storage, saving and opening files, sharing and printing.
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int REQ_CREATE = 12, REQ_OPEN = 13;

    private WebView web;
    private String pendingCb;
    private byte[] pendingBytes;
    private WebView printView;   // kept alive until the print job has been laid out
    private static MainActivity current;   // for a storage setting pushed by a linked app while the app is open

    /** A linked Stoic Ranger app pushed a newer storage setting (LinkProvider): tell the page. */
    static void storageChangedElsewhere() {
        final MainActivity a = current;
        if (a == null || a.web == null) return;
        a.runOnUiThread(new Runnable() { @Override public void run() {
            a.web.evaluateJavascript("window.PF && PF.sync && PF.sync.storageChanged && PF.sync.storageChanged()", null);
        }});
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        web.addJavascriptInterface(new Bridge(), "PFNative");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("SRFitness", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl(ORIGIN + "/www/index.html");
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        super.onDestroy();
    }

    /** Pushes this phone's storage setting (with the password) to every linked app that is installed, in the background. */
    private void pushStorage() {
        new Thread(new Runnable() { @Override public void run() {
            Storage st = new Storage(MainActivity.this);
            String json = st.toJson(true).toString();
            for (String pkg : st.linked()) callPeer(pkg, "setStorage", json);
        }}).start();
    }

    /** call() on another Stoic Ranger app's link provider; null when it is not installed or has no such link. */
    private JSONObject callPeer(String pkg, String method, String arg) {
        try {
            Bundle b = getContentResolver().call(Uri.parse("content://" + pkg + ".link"), method, arg, null);
            return b == null ? null : new JSONObject(b.getString("json", "{}"));
        } catch (Exception e) { return null; }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.PF && PF.flush && PF.flush()", null);
    }

    /** The WebView's prefers-color-scheme does not follow the phone reliably: tell the page directly. */
    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
    private void pushNight() {
        web.evaluateJavascript("window.PF && PF.setSysDark && PF.setSysDark(" + isNight() + ")", null);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (web != null) {
            pushNight();
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.PF && PF.back) ? PF.back() : false", new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if ("false".equals(value)) finish();      // only a plain false closes the app
            }
        });
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
            if (res != RESULT_OK || data == null || data.getData() == null) { callback(cb, false, "cancelled", null); return; }
            try (OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt")) {
                os.write(bytes);
                callback(cb, true, displayName(data.getData()), null);
            } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
        } else if (req == REQ_OPEN) {
            String cb = pendingCb; pendingCb = null;
            if (res != RESULT_OK || data == null || data.getData() == null) { callback(cb, false, "cancelled", null); return; }
            try (InputStream is = getContentResolver().openInputStream(data.getData())) {
                byte[] b = readAll(is);
                callback(cb, true, displayName(data.getData()), Base64.encodeToString(b, Base64.NO_WRAP));
            } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
        }
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return u.getLastPathSegment();
    }

    private void callback(String cb, boolean ok, String msg, String data) {
        if (cb == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok); o.put("msg", msg == null ? "" : msg);
            if (data != null) o.put("data", data);
            final String js = "window.PFNativeCallback && PFNativeCallback(" + JSONObject.quote(cb) + "," + o.toString() + ")";
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
            if (!"appassets.androidplatform.net".equals(u.getHost())) return null;
            String path = u.getPath();
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

        /** Links leave the app: phone numbers open the dialer, e-mail the mail app, websites the browser.
         *  (No @Override: the cloud build compiles against an API 23 android.jar that lacks this API 24 method;
         *  it still overrides WebViewClient at run time on every supported Android version, 8.0+.) */
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if ("appassets.androidplatform.net".equals(u.getHost())) return false;
            String sc = u.getScheme() == null ? "" : u.getScheme();
            Intent i = "tel".equals(sc) ? new Intent(Intent.ACTION_DIAL, u)
                    : "mailto".equals(sc) ? new Intent(Intent.ACTION_SENDTO, u)
                    : new Intent(Intent.ACTION_VIEW, u);
            try { startActivity(i); } catch (Exception ignored) { }
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
        if (p.endsWith(".csv")) return "text/csv";
        if (p.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
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

        /** Copy of db.json into files/backups/ before a schema migration (or of a damaged file); keeps the newest 10. */
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
            // keep the newest 10 of this kind (db-schema…, db-before-import…, db-before-sync…), so frequent sync
            // backups never push out the copy made before a migration
            final String kind = name.replaceAll("[-_]?\\d.*$", "");
            File[] all = dir.listFiles(new java.io.FileFilter() { @Override public boolean accept(File f) { return f.getName().replaceAll("[-_]?\\d.*$", "").equals(kind); } });
            if (all != null && all.length > 10) {
                java.util.Arrays.sort(all, new java.util.Comparator<File>() {
                    @Override public int compare(File a, File b) { return Long.compare(b.lastModified(), a.lastModified()); }
                });
                for (int i = 10; i < all.length; i++) all[i].delete();
            }
            return true;
        }

        /** The previous version of db.json (written by saveDb). */
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
                try { startActivityForResult(i, REQ_CREATE); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            }});
        }

        @JavascriptInterface
        public void openFile(String mimes, String cb) {
            runOnUiThread(new Runnable() { @Override public void run() {
                pendingCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (mimes != null && !mimes.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.split(","));
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            }});
        }

        @JavascriptInterface
        public void shareFile(String name, String mime, String base64, String text) {
            runOnUiThread(new Runnable() { @Override public void run() {
                try {
                    File dir = new File(getCacheDir(), "shared");
                    dir.mkdirs();
                    File f = new File(dir, name.replaceAll("[^\\w.\\-]+", "_"));
                    try (FileOutputStream os = new FileOutputStream(f)) { os.write(Base64.decode(base64, Base64.DEFAULT)); }
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_STREAM, SharedFileProvider.uriFor(f));
                    if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Share"));
                } catch (Exception ignored) { }
            }});
        }

        /** Share plain text (a quote) through the Android share sheet. */
        @JavascriptInterface
        public void shareText(String subject, String text) {
            runOnUiThread(new Runnable() { @Override public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                if (subject != null && !subject.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, subject);
                i.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(i, "Share")); } catch (Exception ignored) { }
            }});
        }

        /* ---------- storage setting, links and Nextcloud (0.2.0, shared contract v1, 00_docs/SHARED-DB-CONTRACT.md) ---------- */

        /** The setting without the password, the link consent and which Stoic Ranger apps are installed. */
        @JavascriptInterface
        public String storageGet() {
            Storage st = new Storage(MainActivity.this);
            JSONObject o = st.toJson(false);
            try {
                org.json.JSONArray peers = new org.json.JSONArray();
                for (String pkg : Storage.PEERS) {
                    JSONObject x = new JSONObject();
                    x.put("pkg", pkg); x.put("linked", st.isLinked(pkg));
                    try {
                        android.content.pm.ApplicationInfo ai = getPackageManager().getApplicationInfo(pkg, 0);
                        x.put("installed", true); x.put("name", String.valueOf(getPackageManager().getApplicationLabel(ai)));
                    } catch (Exception e) { x.put("installed", false); x.put("name", ""); }
                    peers.put(x);
                }
                o.put("peers", peers);
            } catch (Exception ignored) { }
            return o.toString();
        }

        /** The user changed the setting here: save it (password "" keeps the stored one) and push it to linked apps. */
        @JavascriptInterface
        public String storageSet(String json, String password) {
            try {
                Storage st = new Storage(MainActivity.this);
                if (!st.apply(new JSONObject(json), password, null, false)) return "{\"error\":\"not saved\"}";
                pushStorage();
            } catch (Exception e) { return "{\"error\":\"not saved\"}"; }
            return storageGet();
        }

        /** Consent for one Stoic Ranger app (standing rule 6). A new link also gets this phone's setting pushed. */
        @JavascriptInterface
        public String linkSet(String pkg, boolean on) {
            new Storage(MainActivity.this).setLinked(pkg, on);
            if (on) pushStorage();
            return storageGet();
        }

        /** On start: ask the linked apps for their setting and take a newer one. Returns true if it changed. */
        @JavascriptInterface
        public boolean storageRefresh() {
            Storage st = new Storage(MainActivity.this);
            boolean took = false;
            for (String pkg : st.linked()) {
                JSONObject o = callPeer(pkg, "storage", null);
                if (o == null || o.has("error") || o.optString("changed", "").isEmpty()) continue;
                if (st.apply(o, o.optString("password", ""), o.optString("changed"), true)) took = true;
            }
            return took;
        }

        @JavascriptInterface
        public void ncTest(final String cb) { nc(cb, 0, null, null); }
        @JavascriptInterface
        public void ncDownload(final String cb) { nc(cb, 1, null, null); }
        @JavascriptInterface
        public void ncUpload(final String base64, final String etag, final String cb) { nc(cb, 2, base64, etag); }

        /** Network off the UI thread; answers {ok, msg, data: JSON {status, etag, error, b64}}. */
        private void nc(final String cb, final int op, final String base64, final String etag) {
            new Thread(new Runnable() { @Override public void run() {
                Storage st = new Storage(MainActivity.this);
                WebDav.Res r;
                if (!"nextcloud".equals(st.mode()) || st.url().isEmpty() || st.user().isEmpty()) {
                    r = new WebDav.Res(); r.status = 0; r.error = "Nextcloud is not set up";
                } else if (!st.url().startsWith("https://")) {
                    r = new WebDav.Res(); r.status = 0; r.error = "The address must start with https://";
                } else {
                    NcFile f = new NcFile(new WebDav(st.url(), st.user(), st.password()), st.folder(), st.file());
                    r = op == 0 ? f.test() : op == 1 ? f.download()
                            : f.upload(Base64.decode(base64, Base64.DEFAULT), etag, NcFile.stamp(new java.util.Date()));
                }
                try {
                    JSONObject o = new JSONObject();
                    o.put("status", r.status); o.put("etag", r.etag); o.put("error", r.error);
                    if (op == 1 && r.status == 200) o.put("b64", Base64.encodeToString(r.body, Base64.NO_WRAP));
                    callback(cb, r.ok(), r.error, o.toString());
                } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            }}).start();
        }

        /** Print (or "Save as PDF") an HTML document rendered by the web app; A4 portrait. */
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
