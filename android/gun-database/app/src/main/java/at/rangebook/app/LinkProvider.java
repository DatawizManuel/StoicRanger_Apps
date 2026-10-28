package at.rangebook.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Link with other Stoic Ranger apps (first: SR_Training Log). Only apps signed with the same key hold the
 * signature permission at.stoicranger.permission.LINK, and nothing is answered unless the user switched
 * linking on in this app (settings.link.enabled in db.json).
 *
 *   status    → {app, version, enabled}
 *   shared    → {shooters:[…], weapons:[…], trainers:[…]} (own entries, no examples; 0.6.0 adds weapons.type/zeroM and trainers)
 *   putRounds → stores the Training Log's rounds per training in files/link-inbox.json; the web app merges
 *               them into the rounds log on its next start or resume (it owns db.json, so no write races).
 */
public class LinkProvider extends ContentProvider {
    static final String PERMISSION = "at.stoicranger.permission.LINK";

    @Override public boolean onCreate() { return true; }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        // call() is not covered by the provider's android:permission: check the caller here
        if (getContext().checkCallingPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("Stoic Ranger link permission required");
        Bundle out = new Bundle();
        try {
            JSONObject db = readDb();
            JSONObject link = db == null ? null : db.optJSONObject("settings") == null ? null : db.optJSONObject("settings").optJSONObject("link");
            boolean enabled = link != null && link.optBoolean("enabled", false);
            JSONObject r = new JSONObject();
            if ("status".equals(method)) {
                r.put("app", "gundb");
                r.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
                r.put("enabled", enabled);
            } else if (!enabled) {
                r.put("error", "disabled");
            } else if ("shared".equals(method)) {
                r.put("shooters", own(db.optJSONArray("shooters"), new String[]{"id", "name", "status", "notes"}));
                r.put("weapons", own(db.optJSONArray("weapons"), new String[]{"id", "name", "type", "make", "model", "caliber", "zeroM", "serial", "status", "notes"}));
                r.put("trainers", own(db.optJSONArray("trainers"), new String[]{"id", "uid", "name", "contact", "phone", "email", "website", "notes"}));
            } else if ("putRounds".equals(method)) {
                JSONObject in = new JSONObject(arg == null ? "{}" : arg);
                in.put("received", System.currentTimeMillis());
                File dir = getContext().getFilesDir(), tmp = new File(dir, "link-inbox.tmp"), f = new File(dir, "link-inbox.json");
                try (FileOutputStream os = new FileOutputStream(tmp)) { os.write(in.toString().getBytes(StandardCharsets.UTF_8)); os.getFD().sync(); }
                if (!tmp.renameTo(f)) throw new Exception("could not store");
                r.put("ok", true);
            } else r.put("error", "unknown method");
            out.putString("json", r.toString());
        } catch (Exception e) {
            out.putString("json", "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
        }
        return out;
    }

    private JSONObject readDb() throws Exception {
        File f = new File(getContext().getFilesDir(), "db.json");
        if (!f.exists()) return null;
        try (FileInputStream is = new FileInputStream(f)) { return new JSONObject(new String(MainActivity.readAll(is), StandardCharsets.UTF_8)); }
    }

    private static JSONArray own(JSONArray src, String[] keys) throws Exception {
        JSONArray a = new JSONArray();
        if (src == null) return a;
        for (int i = 0; i < src.length(); i++) {
            JSONObject o = src.optJSONObject(i);
            if (o == null || o.optBoolean("example", false)) continue;
            JSONObject c = new JSONObject();
            for (String k : keys) if (o.has(k)) c.put(k, o.get(k));
            a.put(c);
        }
        return a;
    }

    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
