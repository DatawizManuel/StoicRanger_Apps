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
 * Read-only link for the other Stoic Ranger apps (1.2.0, first user: SR Field Kit › Drop & wind).
 * Authority at.rangebook.app.link, guarded by the signature permission at.stoicranger.permission.LINK, so only
 * apps signed with the same key can call it, and they only ask after their user allowed the link (standing rule).
 * It never writes: call("ballistics") reads files/db.json (or db.bak.json) and returns a Bundle with "json" =
 *   { weapons:[{id,name,caliber,sightHeightMm,zeroM,scopeUnit,clickValue,optic,twist}],
 *     munitions:[{id,name,caliber,bulletWeightG,bcG1,bcG7,nominalV0}],
 *     v0:{"<weaponId>|<munitionId>":{v,n}} }   (v = measured V0 m/s from the datasheets, weighted by rounds; n = sheets)
 * call("status") returns {app, version, link}.
 */
public class LinkProvider extends ContentProvider {
    static final int LINK_VERSION = 1;
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
                out.putString("json", o.toString());
            } else if ("ballistics".equals(method)) {
                out.putString("json", ballistics(readDb()).toString());
            } else {
                out.putString("json", "{\"error\":\"unknown method\"}");
            }
        } catch (Exception e) {
            out.putString("json", "{\"error\":\"failed\"}");
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
