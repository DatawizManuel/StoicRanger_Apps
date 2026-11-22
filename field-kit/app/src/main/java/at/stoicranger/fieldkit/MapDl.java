package at.stoicranger.fieldkit;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Map downloads that keep running with the app closed or the phone in standby (remark #16, 0.5.0).
 *
 * The files are fetched by Android's own download service (DownloadManager): it runs outside the app, waits for Wi-Fi
 * when "Wi-Fi only" is on, carries on after standby and network drops (it resumes where it stopped) and shows its
 * progress in the notification bar. Each file (or each part of a split map, format FK-2) is one download into the
 * app's own folder Android/data/at.stoicranger.fieldkit/files/mapdl/. When all are finished, the app checks every part
 * (SHA-256), joins them into files/maps/<name>.part, checks the whole file and only then replaces an older copy
 * (MapFiles.finish). That last step runs when Android reports the download as complete (Done receiver) or, if the
 * phone stopped it, the next time the app is opened: it can be repeated safely, nothing is deleted before it worked.
 *
 * The job is kept in SharedPreferences "fk-mapdl" (not in db.json): {id, meta, files:[{key, name, sha256, bytes,
 * pieces:[{path, bytes, sha256, dm}], done}], state, msg, at}. state: run | checking | done | error | cancelled.
 * Note: the download service keeps the request (with the Nextcloud login header) in Android's own download list
 * until the download is removed, which this class does as soon as the files are checked or the download is stopped.
 */
final class MapDl {
    private MapDl() { }
    private static final Object LOCK = new Object();
    private static volatile boolean finishing;

    private static SharedPreferences p(Context c) { return c.getSharedPreferences("fk-mapdl", Context.MODE_PRIVATE); }
    private static JSONObject job(Context c) { try { String s = p(c).getString("job", ""); return s.isEmpty() ? null : new JSONObject(s); } catch (Exception e) { return null; } }
    private static void save(Context c, JSONObject j) { p(c).edit().putString("job", j == null ? "" : j.toString()).commit(); }
    private static DownloadManager dm(Context c) { return (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE); }
    private static File pieceFile(Context c, String id, int i) { return new File(c.getExternalFilesDir("mapdl"), id + "-" + i + ".bin"); }

    /** Starts a job (one region). → {ok, msg} */
    static JSONObject start(Context c, String jobJson) {
        JSONObject r = new JSONObject();
        try {
            synchronized (LOCK) {
                JSONObject old = job(c);
                if (old != null && ("run".equals(old.optString("state")) || "checking".equals(old.optString("state"))))
                    return r.put("ok", false).put("msg", "Another map is still downloading.");
                if (old != null) cleanup(c, old);
                JSONObject j = new JSONObject(jobJson);
                String id = j.optString("id").replaceAll("[^A-Za-z0-9-]", "");
                if (id.isEmpty()) id = "dl" + System.currentTimeMillis();
                j.put("id", id);
                JSONObject cfg = SyncStore.get(c, true);
                String base = cfg.optString("url"), user = cfg.optString("user"), pw = cfg.optString("password");
                if (!base.startsWith("https://") || user.isEmpty() || pw.isEmpty())
                    return r.put("ok", false).put("msg", "Set up your Nextcloud first (⋯ › Where your data is stored).");
                JSONArray files = j.getJSONArray("files");
                long total = 0, biggest = 0;
                for (int f = 0; f < files.length(); f++) {
                    JSONObject fo = files.getJSONObject(f);
                    MapFiles.file(c, fo.optString("name"));          // checks the name
                    JSONArray ps = fo.getJSONArray("pieces");
                    if (ps.length() == 0 || ps.length() > 1000) throw new IOException("bad parts list");
                    for (int i = 0; i < ps.length(); i++) {
                        JSONObject pc = ps.getJSONObject(i);
                        String path = pc.optString("path");
                        if (path.isEmpty() || path.contains("..")) throw new IOException("bad path");
                        long b = pc.optLong("bytes"); total += b; biggest = Math.max(biggest, b);
                    }
                }
                File ext = c.getExternalFilesDir("mapdl");
                if (ext == null) return r.put("ok", false).put("msg", "The phone's storage is not available.");
                long need = total + biggest + 200L * 1024 * 1024;
                if (MapFiles.free(c) < need || ext.getUsableSpace() < total + 100L * 1024 * 1024)
                    return r.put("ok", false).put("msg", "Not enough free space on the phone (" + Math.round(need / 1e6) + " MB needed while downloading).");
                String auth = "Basic " + Base64.encodeToString((user + ":" + pw).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                boolean wifi = j.optBoolean("wifi", true);
                String region = j.optJSONObject("meta") != null ? j.getJSONObject("meta").optString("name", "Map") : "Map";
                DownloadManager d = dm(c);
                int n = 0, count = 0;
                for (int f = 0; f < files.length(); f++) count += files.getJSONObject(f).getJSONArray("pieces").length();
                for (int f = 0; f < files.length(); f++) {
                    JSONObject fo = files.getJSONObject(f);
                    JSONArray ps = fo.getJSONArray("pieces");
                    for (int i = 0; i < ps.length(); i++) {
                        JSONObject pc = ps.getJSONObject(i);
                        File dest = pieceFile(c, id, n);
                        dest.delete();
                        DownloadManager.Request q = new DownloadManager.Request(Uri.parse(NcClient.davUrl(base, user, pc.optString("path"))));
                        q.addRequestHeader("Authorization", auth);
                        q.setTitle("SR Field Kit · " + region);
                        q.setDescription(("terrain".equals(fo.optString("key")) ? "Terrain" : "Map") + (count > 1 ? " · file " + (n + 1) + " of " + count : ""));
                        q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                        q.setVisibleInDownloadsUi(false);
                        q.setDestinationInExternalFilesDir(c, "mapdl", dest.getName());
                        if (wifi) q.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI);
                        q.setAllowedOverMetered(!wifi);
                        q.setAllowedOverRoaming(false);
                        pc.put("dm", d.enqueue(q)).put("local", dest.getName());
                        n++;
                    }
                    fo.put("done", false);
                }
                j.put("state", "run").put("msg", "").put("at", System.currentTimeMillis()).put("total", total);
                save(c, j);
                return r.put("ok", true).put("msg", "");
            }
        } catch (Exception e) {
            try { return r.put("ok", false).put("msg", e.getMessage() == null ? "failed" : e.getMessage()); } catch (Exception ignored) { return r; }
        }
    }

    /** The current job for the page: {state, id, meta, done, total, msg, finished:[{key, name, ...}], wait}. */
    static String state(Context c) {
        try {
            JSONObject j = job(c);
            if (j == null) return "{\"state\":\"none\"}";
            String st = j.optString("state");
            long done = 0, total = j.optLong("total");
            String wait = "";
            if ("run".equals(st)) {
                boolean all = true, failed = false; int reason = 0;
                JSONArray files = j.getJSONArray("files");
                for (int f = 0; f < files.length(); f++) {
                    JSONArray ps = files.getJSONObject(f).getJSONArray("pieces");
                    for (int i = 0; i < ps.length(); i++) {
                        JSONObject pc = ps.getJSONObject(i);
                        Cursor cur = dm(c).query(new DownloadManager.Query().setFilterById(pc.optLong("dm")));
                        try {
                            if (cur == null || !cur.moveToFirst()) { failed = true; reason = -1; all = false; continue; }
                            int s = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_STATUS));
                            long got = cur.getLong(cur.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            done += s == DownloadManager.STATUS_SUCCESSFUL ? Math.max(got, pc.optLong("bytes")) : Math.max(0, got);
                            if (s != DownloadManager.STATUS_SUCCESSFUL) all = false;
                            if (s == DownloadManager.STATUS_FAILED) { failed = true; reason = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_REASON)); }
                            if (s == DownloadManager.STATUS_PAUSED) {
                                int rs = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_REASON));
                                wait = rs == DownloadManager.PAUSED_QUEUED_FOR_WIFI ? "Waiting for Wi-Fi" : rs == DownloadManager.PAUSED_WAITING_FOR_NETWORK ? "Waiting for the network" : "Waiting, will try again";
                            }
                        } finally { if (cur != null) cur.close(); }
                    }
                }
                if (failed) {
                    fail(c, j, failMessage(reason));
                    st = "error";
                } else if (all) {
                    finishAsync(c);
                    st = "checking";
                }
            }
            JSONObject o = new JSONObject();
            o.put("state", st).put("id", j.optString("id")).put("meta", j.opt("meta")).put("msg", j.optString("msg"))
             .put("done", "run".equals(st) ? done : total).put("total", total).put("wait", wait);
            JSONArray fin = new JSONArray();
            JSONArray files = j.getJSONArray("files");
            for (int f = 0; f < files.length(); f++) {
                JSONObject fo = files.getJSONObject(f);
                if (fo.optBoolean("done")) fin.put(new JSONObject().put("key", fo.optString("key")).put("name", fo.optString("name")).put("bytes", fo.optLong("bytes")).put("sha256", fo.optString("sha256")));
            }
            o.put("finished", fin);
            return o.toString();
        } catch (Exception e) {
            return "{\"state\":\"none\"}";
        }
    }

    private static String failMessage(int reason) {
        if (reason == 401) return "Nextcloud refused the login. Check the app password.";
        if (reason == 404) return "A file is not on Nextcloud (yet). Wait until the PC has uploaded everything, then try again.";
        if (reason >= 400 && reason < 600) return "Nextcloud answered " + reason + ".";
        if (reason == DownloadManager.ERROR_INSUFFICIENT_SPACE) return "Not enough free space on the phone.";
        if (reason == DownloadManager.ERROR_CANNOT_RESUME) return "The download could not be continued. Try again.";
        if (reason == -1) return "Android's download service lost the download. Try again.";
        return "The download failed (" + reason + "). Try again.";
    }

    private static void fail(Context c, JSONObject j, String msg) {
        synchronized (LOCK) {
            try { removeDownloads(c, j); j.put("state", "error").put("msg", msg); save(c, j); } catch (Exception ignored) { }
        }
    }

    /** Checks and joins the finished downloads, on its own thread (from the page's state call). */
    static void finishAsync(final Context c) {
        if (finishing) return;
        new Thread(new Runnable() { @Override public void run() { finishNow(c.getApplicationContext()); } }, "map-finish").start();
    }

    /** Checks every part, joins them, checks the whole file, moves it into place. Safe to run again. */
    static void finishNow(Context c) {
        synchronized (LOCK) {
            if (finishing) return;
            finishing = true;
        }
        try {
            JSONObject j = job(c);
            if (j == null || !"run".equals(j.optString("state"))) return;
            String err = null;
            JSONArray files = j.getJSONArray("files");
            for (int f = 0; f < files.length() && err == null; f++) {
                JSONObject fo = files.getJSONObject(f);
                if (fo.optBoolean("done")) continue;
                File target = MapFiles.file(c, fo.optString("name"));
                File part = new File(MapFiles.dir(c), fo.optString("name") + ".part");
                part.delete();
                MessageDigest whole = MessageDigest.getInstance("SHA-256");
                JSONArray ps = fo.getJSONArray("pieces");
                try (FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[131072];
                    for (int i = 0; i < ps.length() && err == null; i++) {
                        JSONObject pc = ps.getJSONObject(i);
                        File src = new File(c.getExternalFilesDir("mapdl"), pc.optString("local"));
                        MessageDigest one = MessageDigest.getInstance("SHA-256");
                        long n = 0;
                        try (InputStream in = new FileInputStream(src)) {
                            int k;
                            while ((k = in.read(buf)) > 0) { out.write(buf, 0, k); whole.update(buf, 0, k); one.update(buf, 0, k); n += k; }
                        }
                        String want = pc.optString("sha256");
                        if (!want.isEmpty() && !want.equalsIgnoreCase(MapFiles.hex(one.digest())))
                            err = "Part " + (i + 1) + " of " + ps.length() + " is damaged or was not fully uploaded yet (checksum differs). Nothing was replaced.";
                        else if (pc.optLong("bytes") > 0 && n != pc.optLong("bytes") && want.isEmpty())
                            err = "A downloaded file has the wrong size. Nothing was replaced.";
                    }
                    out.getFD().sync();
                }
                String want = fo.optString("sha256");
                if (err == null && !want.isEmpty() && !want.equalsIgnoreCase(MapFiles.hex(whole.digest())))
                    err = "The downloaded map is damaged (checksum differs). Nothing was replaced.";
                if (err == null && !MapFiles.finish(part, target)) err = "Could not store the map file.";
                if (err != null) { part.delete(); break; }
                fo.put("done", true);
                save(c, j);
            }
            synchronized (LOCK) {
                removeDownloads(c, j);
                if (err != null) j.put("state", "error").put("msg", err); else j.put("state", "done").put("msg", "");
                save(c, j);
            }
        } catch (Exception e) {
            JSONObject j = job(c);
            if (j != null) fail(c, j, "Could not store the map: " + e.getMessage());
        } finally {
            finishing = false;
        }
    }

    /** Stops the job: removes the downloads and their files. */
    static void cancel(Context c) {
        synchronized (LOCK) {
            JSONObject j = job(c);
            if (j == null) return;
            if ("checking".equals(j.optString("state")) || finishing) return;   // almost done: let it finish
            cleanup(c, j);
            try { j.put("state", "cancelled").put("msg", "cancelled"); save(c, j); } catch (Exception ignored) { }
        }
    }

    /** The page has taken over a finished / failed / stopped job. */
    static void clear(Context c) {
        synchronized (LOCK) {
            JSONObject j = job(c);
            if (j == null) return;
            String st = j.optString("state");
            if ("run".equals(st) || finishing) return;
            cleanup(c, j);
            save(c, null);
        }
    }

    private static void cleanup(Context c, JSONObject j) {
        removeDownloads(c, j);
        try {
            JSONArray files = j.getJSONArray("files");
            for (int f = 0; f < files.length(); f++) {
                JSONObject fo = files.getJSONObject(f);
                if (!fo.optBoolean("done")) new File(MapFiles.dir(c), fo.optString("name") + ".part").delete();
            }
        } catch (Exception ignored) { }
    }

    private static void removeDownloads(Context c, JSONObject j) {
        try {
            JSONArray files = j.getJSONArray("files");
            for (int f = 0; f < files.length(); f++) {
                JSONArray ps = files.getJSONObject(f).getJSONArray("pieces");
                for (int i = 0; i < ps.length(); i++) {
                    JSONObject pc = ps.getJSONObject(i);
                    long id = pc.optLong("dm", -1);
                    if (id >= 0) { try { dm(c).remove(id); } catch (Exception ignored) { } pc.remove("dm"); }
                    String local = pc.optString("local");
                    File dir = c.getExternalFilesDir("mapdl");
                    if (!local.isEmpty() && dir != null) new File(dir, local).delete();
                }
            }
        } catch (Exception ignored) { }
    }

    /** Android tells us a download is complete: when the whole job is, check and store it now, even with the app closed. */
    public static final class Done extends BroadcastReceiver {
        @Override public void onReceive(final Context context, Intent intent) {
            final Context c = context.getApplicationContext();
            JSONObject j = job(c);
            if (j == null || !"run".equals(j.optString("state"))) return;
            final PendingResult pr = goAsync();
            new Thread(new Runnable() { @Override public void run() {
                try {
                    JSONObject s = new JSONObject(state(c));          // fails the job or starts checking when all are done
                    if ("checking".equals(s.optString("state"))) { while (finishing) Thread.sleep(200); }
                } catch (Exception ignored) { }
                finally { pr.finish(); }
            } }, "map-done").start();
        }
    }
}
