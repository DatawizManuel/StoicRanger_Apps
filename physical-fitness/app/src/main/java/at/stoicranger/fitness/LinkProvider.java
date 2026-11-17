package at.stoicranger.fitness;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * Link to the other Stoic Ranger apps (shared contract v1, section C), authority at.stoicranger.fitness.link,
 * guarded by the signature permission at.stoicranger.permission.LINK (only apps signed with the same key).
 *   call("status")            → {app, version, link, linked}   (linked = the user here allowed the calling app)
 *   call("storage")           → {mode, url, user, folder, file, password, changed}   only to an app the user linked here
 *   call("setStorage", json)  → applies a pushed setting when it is newer ("changed"), only from a linked app
 * Results come back as Bundle "json" (like Stoic Ranger's provider).
 */
public class LinkProvider extends ContentProvider {
    static final int LINK_VERSION = 1;
    static final String PERMISSION = "at.stoicranger.permission.LINK";

    @Override public boolean onCreate() { return true; }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        Context c = getContext();
        // call() is not covered by the provider's android:permission: check the caller here
        if (c.checkCallingPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED) throw new SecurityException("needs " + PERMISSION);
        Storage st = new Storage(c);
        String caller = getCallingPackage();
        boolean linked = st.isLinked(caller);
        Bundle out = new Bundle();
        try {
            JSONObject o;
            if ("status".equals(method)) {
                o = new JSONObject();
                o.put("app", "sr-physical-fitness");
                PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
                o.put("version", pi.versionName);
                o.put("link", LINK_VERSION);
                o.put("linked", linked);
            } else if ("storage".equals(method)) {
                o = linked ? st.toJson(true) : err("not linked");
            } else if ("setStorage".equals(method)) {
                if (!linked) o = err("not linked");
                else {
                    JSONObject in = new JSONObject(arg == null ? (extras == null ? "{}" : extras.getString("json", "{}")) : arg);
                    boolean took = st.apply(in, in.optString("password", ""), in.optString("changed", ""), true);
                    o = new JSONObject(); o.put("ok", true); o.put("applied", took);
                    if (took) MainActivity.storageChangedElsewhere();
                }
            } else o = err("unknown method");
            out.putString("json", o.toString());
        } catch (Exception e) {
            out.putString("json", "{\"error\":\"failed\"}");
        }
        return out;
    }

    private static JSONObject err(String m) { try { return new JSONObject().put("error", m); } catch (Exception e) { return new JSONObject(); } }

    // no rows, no writes through the table interface
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
}
