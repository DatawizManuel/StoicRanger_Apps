package at.stoicranger.traininglog;

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
 * Link with Stoic Ranger - Shooting Drills. Only apps signed with the same key hold the signature permission
 * at.stoicranger.permission.LINK, and nothing but status is answered unless the user switched this link on here
 * (settings.link.apps.shootingDrills.enabled in db.json).
 *
 *   status        → {app, version, schema, enabled}
 *   shared        → {shooters:[…], weapons:[…]} (own entries, no examples)
 *   trainings     → arg {date:'YYYY-MM-DD'} (or {from, to}): {trainings:[{id, uid, date, start, durationH, fire,
 *                   shooterId, desc, weaponIds, weapons:[{weaponId, rounds}], trainerId, trainer}]}
 *   putResults    → stores Shooting Drills' linked results in files/link-sd-inbox.json; the web app reads them on
 *                   its next start or resume (it owns db.json, so no write races).
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
            JSONObject settings = db == null ? null : db.optJSONObject("settings");
            JSONObject link = settings == null ? null : settings.optJSONObject("link");
            JSONObject apps = link == null ? null : link.optJSONObject("apps");
            JSONObject sd = apps == null ? null : apps.optJSONObject("shootingDrills");
            boolean enabled = sd != null && sd.optBoolean("enabled", false);
            JSONObject r = new JSONObject();
            if ("status".equals(method)) {
                r.put("app", "training-log");
                r.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
                r.put("schema", db == null ? 0 : db.optInt("schema", 0));
                r.put("enabled", enabled);
            } else if (!enabled) {
                r.put("error", "disabled");
            } else if ("shared".equals(method)) {
                r.put("shooters", own(db.optJSONArray("shooters"), new String[]{"id", "uid", "name", "status"}));
                r.put("weapons", own(db.optJSONArray("weapons"), new String[]{"id", "uid", "name", "type", "make", "model", "caliber", "zeroM", "serial", "status"}));
            } else if ("trainings".equals(method)) {
                JSONObject a = new JSONObject(arg == null || arg.isEmpty() ? "{}" : arg);
                String from = a.optString("date", a.optString("from", "")), to = a.optString("date", a.optString("to", ""));
                r.put("trainings", trainings(db, from, to));
            } else if ("putResults".equals(method)) {
                JSONObject in = new JSONObject(arg == null ? "{}" : arg);
                in.put("received", System.currentTimeMillis());
                File dir = getContext().getFilesDir(), tmp = new File(dir, "link-sd-inbox.tmp"), f = new File(dir, "link-sd-inbox.json");
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

    /** Trainings with from <= date <= to (dates as YYYY-MM-DD; empty = open end). */
    private static JSONArray trainings(JSONObject db, String from, String to) throws Exception {
        JSONArray src = db.optJSONArray("trainings"), a = new JSONArray();
        if (src == null) return a;
        JSONArray trainers = db.optJSONArray("trainers");
        for (int i = 0; i < src.length(); i++) {
            JSONObject t = src.optJSONObject(i);
            if (t == null || t.optBoolean("example", false)) continue;
            String d = t.optString("date", "");
            if (!from.isEmpty() && d.compareTo(from) < 0) continue;
            if (!to.isEmpty() && d.compareTo(to) > 0) continue;
            JSONObject c = new JSONObject();
            for (String k : new String[]{"id", "uid", "date", "start", "durationH", "fire", "shooterId", "desc", "trainerId"}) if (t.has(k)) c.put(k, t.get(k));
            if (!c.has("fire")) c.put("fire", "live");
            JSONArray ws = t.optJSONArray("weapons"), ids = new JSONArray(), wl = new JSONArray();
            if (ws != null) for (int j = 0; j < ws.length(); j++) {
                JSONObject w = ws.optJSONObject(j);
                if (w == null) continue;
                ids.put(w.optString("weaponId"));
                JSONObject x = new JSONObject();
                x.put("weaponId", w.optString("weaponId"));
                if (w.has("rounds")) x.put("rounds", w.get("rounds"));
                wl.put(x);
            }
            c.put("weaponIds", ids); c.put("weapons", wl);
            String tid = t.optString("trainerId", "");
            if (trainers != null && !tid.isEmpty()) for (int j = 0; j < trainers.length(); j++) {
                JSONObject tr = trainers.optJSONObject(j);
                if (tr != null && tid.equals(tr.optString("id"))) { c.put("trainer", tr.optString("name")); break; }
            }
            a.put(c);
        }
        return a;
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
