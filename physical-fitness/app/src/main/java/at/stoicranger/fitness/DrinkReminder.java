package at.stoicranger.fitness;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Locale;

/**
 * Drinking reminders (0.4.0): one alarm at a time, for the next reminder of the day (ReminderPlan). When it fires,
 * the app's own data (files/db.json) says whether the user is on track; only if not, a notification is shown. Then the
 * next one is set. The settings live in db.json (settings.remind {n, start, end}, settings.profile.drinkMl), so a
 * change made in the app or arriving by sync is picked up at the next schedule() (app start, settings change, after
 * each alarm, reboot). Inexact alarms (no special permission): Android may deliver them a few minutes late.
 * No lambdas (cloud build, see tools/build-debug.sh).
 */
public class DrinkReminder extends BroadcastReceiver {
    static final String ACTION = "at.stoicranger.fitness.DRINK_REMINDER";
    private static final String CHANNEL = "drinks";
    private static final int NOTE_ID = 4;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ACTION.equals(intent.getAction())) {
            try { check(ctx, intent.getIntExtra("min", -1)); } catch (Exception e) { android.util.Log.w("SRFitness", "reminder: " + e); }
        }
        schedule(ctx);
    }

    /** Settings and today's drinks from db.json; null when there is no data yet */
    static final class State { int n, start, end, goal, drank; }
    static State read(Context ctx) {
        File f = new File(ctx.getFilesDir(), "db.json");
        if (!f.exists()) return null;
        try (FileInputStream is = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0; while (off < b.length) { int r = is.read(b, off, b.length - off); if (r < 0) break; off += r; }
            JSONObject db = new JSONObject(new String(b, 0, off, StandardCharsets.UTF_8));
            JSONObject s = db.optJSONObject("settings"); if (s == null) return null;
            JSONObject rm = s.optJSONObject("remind"), pr = s.optJSONObject("profile");
            State st = new State();
            st.n = rm == null ? 0 : rm.optInt("n", 0);
            st.start = ReminderPlan.minutes(rm == null ? null : rm.optString("start", "08:00"));
            st.end = ReminderPlan.minutes(rm == null ? null : rm.optString("end", "20:00"));
            st.goal = pr == null ? 0 : (int) Math.round(pr.optDouble("drinkMl", 0));
            Calendar c = Calendar.getInstance();
            String today = String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
            JSONArray d = db.optJSONArray("drinks");
            if (d != null) for (int i = 0; i < d.length(); i++) {
                JSONObject x = d.optJSONObject(i);
                if (x != null && today.equals(x.optString("date"))) st.drank += (int) Math.round(x.optDouble("ml", 0));
            }
            return st;
        } catch (Exception e) { return null; }
    }

    private static void check(Context ctx, int min) {
        State st = read(ctx);
        if (st == null || st.n <= 0 || st.goal <= 0) return;
        Calendar c = Calendar.getInstance();
        int now = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        if (min < 0 || Math.abs(now - min) > 90) min = now;          // delivered very late (phone off): judge by now
        if (ReminderPlan.onTrack(st.drank, st.goal, st.start, st.end, min)) return;
        notify(ctx, String.format(Locale.ROOT, "Drinks today: %,d of %,d ml.", st.drank, st.goal));
    }

    @SuppressWarnings("deprecation")
    private static void notify(Context ctx, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            // NotificationChannel by reflection: the cloud build compiles against an API 23 android.jar
            try {
                Class<?> ch = Class.forName("android.app.NotificationChannel");
                Object channel = ch.getConstructor(String.class, CharSequence.class, int.class).newInstance(CHANNEL, "Drinking reminders", 3);
                ch.getMethod("setDescription", String.class).invoke(channel, "Reminds you to drink when you are behind your daily goal");
                NotificationManager.class.getMethod("createNotificationChannel", ch).invoke(nm, channel);
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(ctx, CHANNEL);
            } catch (Exception e) { b = new Notification.Builder(ctx); }
        } else b = new Notification.Builder(ctx);
        Intent open = new Intent(ctx, MainActivity.class).putExtra("open", "dashboard").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.mipmap.ic_launcher_monochrome).setContentTitle("Time for a drink").setContentText(text)
            .setContentIntent(pi).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER);
        try { nm.notify(NOTE_ID, b.build()); } catch (SecurityException e) { /* notifications not allowed */ }
    }

    private static PendingIntent alarmIntent(Context ctx, int min) {
        Intent i = new Intent(ctx, DrinkReminder.class).setAction(ACTION).putExtra("min", min);
        return PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Sets the alarm for the next reminder, or cancels it (no reminders, no goal). Returns the time or 0. */
    static long schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;
        State st = read(ctx);
        long[] nx = st == null || st.goal <= 0 ? null : ReminderPlan.next(System.currentTimeMillis(), ReminderPlan.times(st.start, st.end, st.n));
        if (nx == null) { am.cancel(alarmIntent(ctx, -1)); return 0; }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nx[0], alarmIntent(ctx, (int) nx[1]));
        return nx[0];
    }

    /** After a reboot, an app update or a clock / time zone change: set the alarm again (alarms do not survive these). */
    public static class Restart extends BroadcastReceiver {
        @Override public void onReceive(Context ctx, Intent intent) { schedule(ctx); }
    }
}
