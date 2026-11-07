package at.rangebook.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Link for the other Stoic Ranger apps (1.2.0, first user: SR Field Kit › Drop & wind).
 * Authority at.rangebook.app.link, guarded by the signature permission at.stoicranger.permission.LINK, so only
 * apps signed with the same key can call it, and they only ask after their user allowed the link (standing rule).
 * It never writes: call("ballistics") reads files/db.json (or db.bak.json) and returns a Bundle with "json" =
 *   { weapons:[{id,name,caliber,sightHeightMm,zeroM,scopeUnit,clickValue,optic,twist}],
 *     munitions:[{id,name,caliber,bulletWeightG,bcG1,bcG7,nominalV0}],
 *     v0:{"<weaponId>|<munitionId>":{v,n}} }   (v = measured V0 m/s from the datasheets, weighted by rounds; n = sheets)
 * call("status") returns {app, version, link}.
 *
 * 1.3.0, shared contract (00_docs/SHARED-DB-CONTRACT.md, sections C and D):
 *   call("storage")            {mode, url, user, folder, file, password, changed} (the calling app asked its user
 *                              before linking; only apps signed with the same key get here)
 *   call("setStorage", json)   takes a pushed setting if it is newer ("changed") → {ok, applied}
 *   call("gunsafe")            {weapons, barrels, munitions, rounds:[{date, weaponId, barrelId, munitionId, rounds,
 *                              source:"sheet"|"log", ref}]} (datasheets + Rounds_Log), read-only
 *   call("putBarrels", json)   {barrels:[…]}: a barrel with an id that exists gets its installed/removed dates, one
 *                              without gets the next free id and is added. Queued in files/link-inbox.json and applied
 *                              by the app the next time it opens (it never edits db.json behind the app's back);
 *                              "gunsafe" already answers with the queued changes, so SR GunSafe sees them at once.
 */
public class LinkProvider extends ContentProvider {
    static final int LINK_VERSION = 2;
    /** The other Stoic Ranger apps (their providers are <package>.link). */
    static final String[] APPS = { "at.stoicranger.gunsafe", "at.stoicranger.fieldkit", "at.stoicranger.fitness", "at.stoicranger.dailythoughts" };
    static final String PERMISSION = "at.stoicranger.permission.LINK";
    private static final String[] WEAPON = { "id", "name", "caliber", "sightHeightMm", "zeroM", "scopeUnit", "clickValue", "optic", "twist" };
    private static final String[] WEAPON_NUM = { "sightHeightMm", "zeroM", "clickValue" };
    private static final String[] MUNITION = { "id", "name", "caliber", "bulletWeightG", "bcG1", "bcG7", "nominalV0" };
    private static final String[] MUNITION_NUM = { "bulletWeightG", "bcG1", "bcG7", "nominalV0" };

    @Override public boolean onCreate() { return true; }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        // call() is not covered by the provider's android:permission: check the caller here
        if (getContext().checkCallingPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("needs " + PERMISSION);
        Bundle out = new Bundle();
        try {
            if ("status".equals(method)) {
                JSONObject o = new JSONObject();
                o.put("app", "stoic-ranger");
                PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
                o.put("version", pi.versionName);
                o.put("link", LINK_VERSION);
                o.put("linked", true);
                out.putString("json", o.toString());
            } else if ("ballistics".equals(method)) {
                out.putString("json", ballistics(readDb()).toString());
            } else if ("gunsafe".equals(method)) {
                JSONObject db = readDb();
                applyInbox(db, readInbox());
                out.putString("json", gunsafe(db).toString());
            } else if ("storage".equals(method)) {
                out.putString("json", Nextcloud.stateWithPassword(getContext()).toString());
            } else if ("setStorage".equals(method)) {
                String j = arg != null ? arg : extras != null ? extras.getString("json") : null;
                JSONObject s = new JSONObject(j == null ? "{}" : j);
                String mine = Nextcloud.prefs(getContext()).getString("changed", "");
                boolean applied = s.optString("changed", "").compareTo(mine) > 0;
                if (applied) { s.remove("share"); Nextcloud.set(getContext(), s, s.optString("password", "")); }
                out.putString("json", new JSONObject().put("ok", true).put("applied", applied).toString());
            } else if ("putBarrels".equals(method)) {
                String j = arg != null ? arg : extras != null ? extras.getString("json") : null;
                JSONObject s = new JSONObject(j == null ? "{}" : j);
                JSONArray b = s.optJSONArray("barrels");
                if (b == null || b.length() == 0) { out.putString("json", "{\"error\":\"no barrels\"}"); return out; }
                JSONArray ids = queue(b);
                out.putString("json", new JSONObject().put("ok", true).put("ids", ids).toString());
            } else {
                out.putString("json", "{\"error\":\"unknown method\"}");
            }
        } catch (Exception e) {
            out.putString("json", "{\"error\":\"failed\"}");
            android.util.Log.w("StoicRanger", "link " + method, e);
        }
        return out;
    }

    private JSONObject readDb() throws Exception {
        File dir = getContext().getFilesDir();
        for (String n : new String[] { "db.json", "db.bak.json" }) {
            File f = new File(dir, n);
            if (!f.exists()) continue;
            try (FileInputStream is = new FileInputStream(f)) {
                return new JSONObject(new String(MainActivity.readAll(is), StandardCharsets.UTF_8));
            } catch (Exception e) { /* damaged: try the previous copy */ }
        }
        return new JSONObject();
    }

    /** SR GunSafe (contract D): guns, barrels, ammunition and every round fired, from datasheets and the rounds log. */
    public static JSONObject gunsafe(JSONObject db) throws Exception {
        JSONObject o = new JSONObject();
        o.put("weapons", pick(db.optJSONArray("weapons"), new String[] { "id", "name", "type", "caliber", "make", "model", "status", "roundsBeforeLog" }, new String[] { "roundsBeforeLog" }));
        o.put("barrels", pick(db.optJSONArray("barrels"), new String[] { "id", "weaponId", "name", "installed", "removed", "roundsAtInstall", "lifeRounds", "notes" }, new String[] { "roundsAtInstall", "lifeRounds" }));
        o.put("munitions", pick(db.optJSONArray("munitions"), MUNITION, MUNITION_NUM));
        JSONArray fired = new JSONArray();
        JSONArray sheets = db.optJSONArray("sheets");
        for (int i = 0; sheets != null && i < sheets.length(); i++) {
            JSONObject s = sheets.optJSONObject(i);
            if (s == null || s.optBoolean("example")) continue;
            double r = num(s.opt("rounds"));
            JSONArray hits = s.optJSONArray("hits");
            int n = r > 0 ? (int) Math.round(r) : (hits != null ? hits.length() : 0);
            if (n <= 0) continue;
            fired.put(new JSONObject().put("date", s.optString("date", "")).put("weaponId", s.optString("weaponId", "")).put("barrelId", s.optString("barrelId", ""))
                    .put("munitionId", s.optString("munitionId", "")).put("rounds", n).put("source", "sheet").put("ref", s.optString("id", "")));
        }
        JSONArray log = db.optJSONArray("roundsLog");
        for (int i = 0; log != null && i < log.length(); i++) {
            JSONObject s = log.optJSONObject(i);
            if (s == null || s.optBoolean("example")) continue;
            double r = num(s.opt("rounds"));
            if (!(r > 0)) continue;
            fired.put(new JSONObject().put("date", s.optString("date", "")).put("weaponId", s.optString("weaponId", "")).put("barrelId", s.optString("barrelId", ""))
                    .put("munitionId", s.optString("munitionId", "")).put("rounds", (int) Math.round(r)).put("source", "log").put("ref", s.optString("id", "")).put("note", s.optString("note", "")));
        }
        o.put("rounds", fired);
        return o;
    }

    /** Barrel changes from SR GunSafe wait in files/link-inbox.json until the app opens (www/sr/hub.js applies them).
        New barrels get their id here (the next free B-nnn), so SR GunSafe can refer to them at once. */
    private synchronized JSONArray queue(JSONArray barrels) throws Exception {
        JSONArray inbox = readInbox();
        JSONObject db = readDb();
        applyInbox(db, inbox);
        JSONArray ids = new JSONArray(), list = new JSONArray();
        JSONArray have = db.optJSONArray("barrels");
        int n = 0;
        for (int i = 0; have != null && i < have.length(); i++) n = Math.max(n, idNum(have.optJSONObject(i)));
        for (int i = 0; i < barrels.length(); i++) {
            JSONObject b = barrels.optJSONObject(i);
            if (b == null) continue;
            b = new JSONObject(b.toString());
            String id = b.optString("id", "");
            if (id.isEmpty() || find(have, id) == null) { if (id.isEmpty() || !id.startsWith("B-")) { n++; id = String.format(java.util.Locale.ROOT, "B-%03d", n); } b.put("id", id); b.put("isNew", true); }
            ids.put(id);
            list.put(b);
        }
        JSONObject op = new JSONObject().put("barrels", list).put("at", System.currentTimeMillis());
        inbox.put(op);
        File f = new File(getContext().getFilesDir(), "link-inbox.json"), tmp = new File(f.getPath() + ".tmp");
        try (java.io.FileOutputStream os = new java.io.FileOutputStream(tmp)) { os.write(inbox.toString().getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) throw new Exception("inbox not saved");
        return ids;
    }
    private JSONArray readInbox() {
        File f = new File(getContext().getFilesDir(), "link-inbox.json");
        if (!f.exists()) return new JSONArray();
        try (FileInputStream is = new FileInputStream(f)) { return new JSONArray(new String(MainActivity.readAll(is), StandardCharsets.UTF_8)); } catch (Exception e) { return new JSONArray(); }
    }
    private static int idNum(JSONObject b) {
        if (b == null) return 0;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(?:EX-)?B-(\\d+)$").matcher(b.optString("id", ""));
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }
    private static JSONObject find(JSONArray a, String id) {
        for (int i = 0; a != null && i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) return o; }
        return null;
    }
    /** The queued barrel changes on top of db (the same rules as hub.js linkInbox). */
    public static void applyInbox(JSONObject db, JSONArray inbox) throws Exception {
        JSONArray have = db.optJSONArray("barrels");
        if (have == null) { have = new JSONArray(); db.put("barrels", have); }
        for (int k = 0; k < inbox.length(); k++) {
            JSONArray list = inbox.optJSONObject(k) == null ? null : inbox.optJSONObject(k).optJSONArray("barrels");
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject b = list.optJSONObject(i);
                if (b == null) continue;
                JSONObject cur = find(have, b.optString("id"));
                if (cur != null) { if (b.has("installed")) cur.put("installed", b.optString("installed")); if (b.has("removed")) cur.put("removed", b.optString("removed")); }
                else if (!b.optString("weaponId", "").isEmpty()) have.put(new JSONObject(b.toString()));
            }
        }
    }

    public static JSONObject ballistics(JSONObject db) throws Exception {
        JSONObject o = new JSONObject();
        o.put("weapons", pick(db.optJSONArray("weapons"), WEAPON, WEAPON_NUM));
        o.put("munitions", pick(db.optJSONArray("munitions"), MUNITION, MUNITION_NUM));
        // measured V0 per gun and load, the same weighting as the dope cards (rounds of each sheet)
        Map<String, double[]> acc = new LinkedHashMap<>();
        JSONArray sheets = db.optJSONArray("sheets");
        for (int i = 0; sheets != null && i < sheets.length(); i++) {
            JSONObject s = sheets.optJSONObject(i);
            if (s == null || s.optBoolean("example")) continue;
            String w = s.optString("weaponId", ""), m = s.optString("munitionId", "");
            double v = num(s.opt("v0"));
            if (w.isEmpty() || m.isEmpty() || !(v > 0)) continue;
            double r = num(s.opt("rounds"));
            JSONArray hits = s.optJSONArray("hits");
            double wt = r > 0 ? r : (hits != null && hits.length() > 0 ? hits.length() : 1);
            double[] a = acc.get(w + "|" + m);
            if (a == null) acc.put(w + "|" + m, a = new double[3]);
            a[0] += wt * v; a[1] += wt; a[2] += 1;
        }
        JSONObject v0 = new JSONObject();
        for (Map.Entry<String, double[]> e : acc.entrySet()) {
            JSONObject x = new JSONObject();
            x.put("v", Math.round(e.getValue()[0] / e.getValue()[1] * 10) / 10.0);
            x.put("n", (int) e.getValue()[2]);
            v0.put(e.getKey(), x);
        }
        o.put("v0", v0);
        return o;
    }

    private static JSONArray pick(JSONArray rows, String[] keys, String[] nums) throws Exception {
        JSONArray out = new JSONArray();
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null || r.optBoolean("example") || r.optString("id", "").isEmpty()) continue;
            JSONObject x = new JSONObject();
            for (String k : keys) {
                Object v = r.opt(k);
                boolean isNum = false;
                for (String n : nums) if (n.equals(k)) isNum = true;
                if (isNum) { double d = num(v); x.put(k, d > 0 ? (Object) d : JSONObject.NULL); }
                else x.put(k, v == null || v == JSONObject.NULL ? "" : String.valueOf(v));
            }
            out.put(x);
        }
        return out;
    }

    /** Numbers may be stored as text, with a decimal comma (older sheets, Excel). */
    static double num(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v == null || v == JSONObject.NULL) return Double.NaN;
        try { return Double.parseDouble(String.valueOf(v).trim().replace(',', '.')); } catch (Exception e) { return Double.NaN; }
    }

    // read-only: no rows, no writes
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
}
