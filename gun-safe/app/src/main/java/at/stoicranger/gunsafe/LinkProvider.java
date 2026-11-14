package at.stoicranger.gunsafe;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * SR GunSafe's link for the other Stoic Ranger apps (shared contract, section C). Authority
 * &lt;applicationId&gt;.link, guarded by the signature permission at.stoicranger.permission.LINK (same signing key only).
 *   call("status")            → {app, version, link, linked}   (linked = the user allowed the calling app here)
 *   call("storage")           → {mode, url, user, folder, file, password, changed}   only to an app the user linked here
 *   call("setStorage", json)  → applies a newer storage setting pushed by a linked app → {ok, applied}
 * Same answers as the Daily Thoughts / Field Kit providers (contract v1).
 */
public class LinkProvider extends ContentProvider {
    static final int LINK_VERSION = 1;
    static final String PERMISSION = "at.stoicranger.permission.LINK";

    @Override public boolean onCreate() { return true; }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        if (getContext().checkCallingPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("needs " + PERMISSION);
        boolean linked = Storage.isLinked(getContext(), getCallingPackage());
        Bundle out = new Bundle();
        try {
            if ("status".equals(method)) {
                JSONObject o = new JSONObject();
                o.put("app", "sr-gunsafe");
                PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
                o.put("version", pi.versionName);
                o.put("link", LINK_VERSION);
                o.put("linked", linked);
                out.putString("json", o.toString());
            } else if (!linked && ("storage".equals(method) || "setStorage".equals(method))) {
                out.putString("json", "{\"error\":\"not linked\"}");
            } else if ("storage".equals(method)) {
                out.putString("json", Storage.load(getContext()).toLinkJson().toString());
            } else if ("setStorage".equals(method)) {
                String j = arg != null ? arg : extras != null ? extras.getString("json") : null;
                Storage s = Storage.load(getContext());
                boolean applied = j != null && s.apply(new JSONObject(j), true);
                if (applied) s.save(getContext());
                out.putString("json", new JSONObject().put("ok", true).put("applied", applied).toString());
            } else {
                out.putString("json", "{\"error\":\"unknown method\"}");
            }
        } catch (Exception e) {
            out.putString("json", "{\"error\":\"failed\"}");
        }
        return out;
    }

    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
}
