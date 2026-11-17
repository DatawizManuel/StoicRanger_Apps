package at.stoicranger.fitness;

import java.util.Calendar;

/**
 * Drinking reminders (0.4.0, remark #4): plain Java, no Android classes, so it is tested on the build machine
 * (tools/nc-test/ReminderPlanTest.java). Same formula as PF.body.remindTimes in js/body.js.
 * - The reminders are spread evenly over the typical day: none at its start, the last one at its end
 *   (08:00-20:00 with 4 reminders: 11:00, 14:00, 17:00, 20:00).
 * - "On track": today's drinks reach the goal's share of the day that has passed (at 14:00 of 08:00-20:00: half the
 *   goal). Then that reminder is not shown.
 */
public final class ReminderPlan {
    private ReminderPlan() { }

    /** "HH:MM" → minutes after midnight, or -1 */
    public static int minutes(String hhmm) {
        if (hhmm == null) return -1;
        String s = hhmm.trim();
        int c = s.indexOf(':'); if (c < 1) return -1;
        try {
            int h = Integer.parseInt(s.substring(0, c)), m = Integer.parseInt(s.substring(c + 1, Math.min(s.length(), c + 3)));
            return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : -1;
        } catch (NumberFormatException e) { return -1; }
    }

    /** reminder times (minutes after midnight) of one day */
    public static int[] times(int start, int end, int n) {
        if (n <= 0 || start < 0 || end <= start) return new int[0];
        int[] t = new int[n];
        for (int i = 1; i <= n; i++) t[i - 1] = start + (int) Math.round((double) i * (end - start) / n);
        return t;
    }

    /** true when the drinks so far reach the goal's share of the day passed at minute `at` (no goal: true) */
    public static boolean onTrack(int drankMl, int goalMl, int start, int end, int at) {
        if (goalMl <= 0 || end <= start) return true;
        double f = Math.max(0, Math.min(1, (double) (at - start) / (end - start)));
        return drankMl >= goalMl * f - 0.5;
    }

    /** the next reminder after `now` (millis): its time in millis and its minute of the day; null when none */
    public static long[] next(long now, int[] times) {
        if (times.length == 0) return null;
        Calendar c = Calendar.getInstance();
        for (int day = 0; day < 2; day++) {
            for (int t : times) {
                c.setTimeInMillis(now);
                c.add(Calendar.DAY_OF_YEAR, day);
                c.set(Calendar.HOUR_OF_DAY, t / 60); c.set(Calendar.MINUTE, t % 60); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
                if (c.getTimeInMillis() > now + 30000) return new long[] { c.getTimeInMillis(), t };
            }
        }
        return null;
    }
}
