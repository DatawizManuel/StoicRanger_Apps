import at.stoicranger.fitness.ReminderPlan;
import java.util.Arrays;
import java.util.Calendar;

/** Drinking reminder times and the "on track" rule (ReminderPlan.java). Run by tools/test-reminders.sh. */
public class ReminderPlanTest {
    static int fails = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fails++; }
    static long at(int dayOff, int h, int m) { Calendar c = Calendar.getInstance(); c.set(2026, 10, 17, h, m, 0); c.set(Calendar.MILLISECOND, 0); c.add(Calendar.DAY_OF_YEAR, dayOff); return c.getTimeInMillis(); }
    public static void main(String[] a) {
        int s = ReminderPlan.minutes("08:00"), e = ReminderPlan.minutes("20:00");
        ok(s == 480 && e == 1200 && ReminderPlan.minutes("7:30") == 450 && ReminderPlan.minutes("25:00") == -1 && ReminderPlan.minutes("") == -1, "HH:MM read");
        ok(Arrays.equals(ReminderPlan.times(s, e, 4), new int[] { 660, 840, 1020, 1200 }), "4 reminders in 08:00-20:00 = 11:00, 14:00, 17:00, 20:00 (none at the start)");
        ok(Arrays.equals(ReminderPlan.times(s, e, 1), new int[] { 1200 }), "1 reminder = at the end of the day");
        ok(ReminderPlan.times(s, e, 0).length == 0 && ReminderPlan.times(e, s, 3).length == 0, "no reminders when off or the day is wrong");
        ok(ReminderPlan.onTrack(1000, 2000, s, e, 840), "14:00 with half the goal: on track, no reminder");
        ok(!ReminderPlan.onTrack(999, 2000, s, e, 840), "14:00 with less than half: reminder");
        ok(!ReminderPlan.onTrack(1500, 2000, s, e, 1200) && ReminderPlan.onTrack(2000, 2000, s, e, 1200), "20:00: reminder until the whole goal is reached");
        ok(ReminderPlan.onTrack(0, 0, s, e, 840), "no goal: no reminder");
        int[] t = ReminderPlan.times(s, e, 4);
        long[] n1 = ReminderPlan.next(at(0, 12, 0), t);
        ok(n1 != null && n1[0] == at(0, 14, 0) && n1[1] == 840, "at 12:00 the next is 14:00 today");
        long[] n2 = ReminderPlan.next(at(0, 20, 30), t);
        ok(n2 != null && n2[0] == at(1, 11, 0) && n2[1] == 660, "after the last one: 11:00 tomorrow");
        long[] n3 = ReminderPlan.next(at(0, 13, 59) + 45000, t);
        ok(n3 != null && n3[0] == at(0, 17, 0), "a reminder less than 30 s away is skipped to the next one");
        ok(ReminderPlan.next(at(0, 9, 0), new int[0]) == null, "off: no alarm");
        System.out.println(fails == 0 ? "all passed" : fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
