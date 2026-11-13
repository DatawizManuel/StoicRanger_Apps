package at.stoicranger.fieldkit;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * Field Kit's side of the link between Stoic Ranger apps (authority at.stoicranger.fieldkit.link), guarded by the
 * signature permission at.stoicranger.permission.LINK: only apps signed with the same key can call it.
 * Shared storage rule (Manuel 2026-11-07): one database file for all linked apps; switching storage in one app
 * switches all linked apps.
 *   call("status")              → {app, version, link}
 *   call("storage")             → {mode, url, user, folder, file, changed, password}
 *   call("setStorage", json)    → {ok}; json as above (password optional). Applied only if newer than ours.
 */
public class LinkProvider extends ContentProvider {
    static final String PERMISSION = "at.stoicranger.permission.LINK";

    @Override public boolean onCreate() { return true; }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        if (getContext().checkCallingPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("needs " + PERMISSION);
        Bundle out = new Bundle();
        try {
            JSONObject o;
            if ("status".equals(method)) {
                o = new JSONObject();
                o.put("app", "sr-field-kit");
                o.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
                o.put("link", 1);
            } else if ("storage".equals(method)) {
                o = SyncStore.get(getContext(), true);
            } else if ("setStorage".equals(method)) {
                JSONObject in = new JSONObject(arg == null ? "{}" : arg);
                String theirs = in.optString("changed", ""), ours = SyncStore.get(getContext(), false).optString("changed", "");
                o = new JSONObject();
                if (theirs.compareTo(ours) >= 0) {
                    String pw = in.has("password") ? in.optString("password", "") : null;
                    o.put("ok", SyncStore.set(getContext(), in, pw, theirs));
                } else o.put("ok", false).put("reason", "older");
            } else {
                o = new JSONObject().put("error", "unknown method");
            }
            out.putString("json", o.toString());
        } catch (Exception e) {
            out.putString("json", "{\"error\":\"failed\"}");
        }
        return out;
    }

    // no rows, no writes through the table API
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException("read-only"); }
}
