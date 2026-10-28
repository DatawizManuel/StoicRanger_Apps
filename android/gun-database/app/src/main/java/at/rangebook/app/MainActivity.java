package at.rangebook.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
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
 * Single-activity shell. The whole app UI is the offline web app in assets/www, served from
 * https://appassets.androidplatform.net/ so it gets a normal secure origin. Native code only does
 * what a web page can't: durable storage, camera/gallery, saving and opening files, sharing and printing.
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int REQ_CHOOSER = 11, REQ_CREATE = 12, REQ_OPEN = 13, REQ_LOCATION = 14;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String pendingCb;
    private byte[] pendingBytes;
    private WebView printView;   // kept alive until the print job has been laid out
    private android.webkit.GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        Window w = getWindow();
        w.getDecorView().setSystemUiVisibility(0);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        s.setGeolocationEnabled(true);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        web.addJavascriptInterface(new Bridge(), "RBNative");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                openChooser(p.isCaptureEnabled());
                return true;
            }
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback cb) {
                if (!origin.startsWith(ORIGIN)) { cb.invoke(origin, false, false); return; }
                if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false); return;
                }
                geoCallback = cb; geoOrigin = origin;
                requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("RangeLogbook", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl(ORIGIN + "/www/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.RB && RB.flush && RB.flush()", null);
    }

    /** The WebView's prefers-color-scheme does not follow the phone reliably: tell the page directly. */
    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
    private void pushNight() {
        web.evaluateJavascript("window.RB && RB.setSysDark && RB.setSysDark(" + isNight() + ")", null);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (web != null) {
            pushNight();
            web.evaluateJavascript("window.RB && RB.linkMerge && RB.linkMerge()", null);   // rounds sent by SR_Training Log
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.RB && RB.back) ? RB.back() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        web.evaluateJavascript("window.dispatchEvent(new Event('resize'))", null);
        pushNight();
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req != REQ_LOCATION || geoCallback == null) return;
        boolean ok = false;
        for (int r : res) ok |= r == android.content.pm.PackageManager.PERMISSION_GRANTED;
        geoCallback.invoke(geoOrigin, ok, false);
        geoCallback = null;
    }

    /* ---------- camera / gallery for <input type=file> ---------- */
    private void openChooser(boolean captureFirst) {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        Intent cam = null;
        try {
            File dir = new File(getCacheDir(), "shared");
            dir.mkdirs();
            File f = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
            cameraUri = SharedFileProvider.uriFor(f);
            cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (cam.resolveActivity(getPackageManager()) == null) cam = null;
        } catch (Exception e) { cam = null; }
        // capture attribute -> straight to the camera; otherwise the system picker (gallery, files, Drive)
        Intent chooser = (captureFirst && cam != null) ? cam : pick;
        try {
            startActivityForResult(chooser, REQ_CHOOSER);
        } catch (ActivityNotFoundException e) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CHOOSER) {
            if (fileCallback == null) return;
            Uri[] out = null;
            if (res == RESULT_OK) {
                if (data != null && data.getData() != null) out = new Uri[]{data.getData()};
                else if (cameraUri != null && new File(new File(getCacheDir(), "shared"), cameraUri.getLastPathSegment()).length() > 0) out = new Uri[]{cameraUri};
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
        } else if (req == REQ_CREATE) {
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
            final String js = "window.RBNativeCallback && RBNativeCallback(" + JSONObject.quote(cb) + "," + o.toString() + ")";
            runOnUiThread(() -> web.evaluateJavascript(js, null));
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

        @Override
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
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
            File[] all = dir.listFiles();
            if (all != null && all.length > 10) {
                java.util.Arrays.sort(all, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
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

        /** Rounds the Training Log left via LinkProvider (files/link-inbox.json), or "". */
        @JavascriptInterface
        public String linkInbox() {
            File f = new File(getFilesDir(), "link-inbox.json");
            if (!f.exists()) return "";
            try (FileInputStream is = new FileInputStream(f)) {
                return new String(readAll(is), StandardCharsets.UTF_8);
            } catch (IOException e) { return ""; }
        }

        @JavascriptInterface
        public boolean isNight() { return MainActivity.this.isNight(); }

        @JavascriptInterface
        public String getSecret(String key) {
            return prefs().getString(key, "");
        }

        @JavascriptInterface
        public void setSecret(String key, String value) {
            prefs().edit().putString(key, value).apply();
        }

        private SharedPreferences prefs() { return getSharedPreferences("secrets", Context.MODE_PRIVATE); }

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
            runOnUiThread(() -> {
                pendingCb = cb;
                pendingBytes = Base64.decode(base64, Base64.DEFAULT);
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_CREATE); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            });
        }

        @JavascriptInterface
        public void openFile(String mimes, String cb) {
            runOnUiThread(() -> {
                pendingCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (mimes != null && !mimes.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.split(","));
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { callback(cb, false, e.getMessage(), null); }
            });
        }

        @JavascriptInterface
        public void shareFile(String name, String mime, String base64, String text) {
            runOnUiThread(() -> {
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
            });
        }

        /** Print (or "Save as PDF") an HTML document rendered by the web app; A4 portrait. */
        @JavascriptInterface
        public void print(String html, String jobName) { printSized(html, jobName, "A4"); }

        /** Same with a preselected paper size: "A4", "A5" or "A6" (dope cards). The print dialog can still change it. */
        @JavascriptInterface
        public void printSized(String html, String jobName, String size) {
            final PrintAttributes.MediaSize media = "A6".equals(size) ? PrintAttributes.MediaSize.ISO_A6
                    : "A5".equals(size) ? PrintAttributes.MediaSize.ISO_A5 : PrintAttributes.MediaSize.ISO_A4;
            runOnUiThread(() -> {
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
                                .setMediaSize(media)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build();
                        pm.print(jobName, ad, attrs);
                    }
                });
                printView.loadDataWithBaseURL(ORIGIN + "/www/", html, "text/html", "utf-8", null);
            });
        }
    }
}
