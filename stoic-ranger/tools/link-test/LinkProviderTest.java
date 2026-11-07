import org.json.JSONArray;
import org.json.JSONObject;

/* Desktop check of what the Field Kit link returns (at.rangebook.app.LinkProvider.ballistics), with the real org.json.
   Run: bash stoic-ranger/tools/test-link.sh */
public class LinkProviderTest {
    static int fails = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fails++; }

    public static void main(String[] a) throws Exception {
        JSONObject db = new JSONObject("{"
            + "\"weapons\":[{\"id\":\"W-001\",\"name\":\"Tikka T3x\",\"caliber\":\"6.5 Creedmoor\",\"sightHeightMm\":\"48,5\",\"zeroM\":100,\"scopeUnit\":\"mrad\",\"clickValue\":0.1,\"optic\":\"S&B\",\"twist\":\"1:8\",\"notes\":\"x\"},"
            + "{\"id\":\"W-EX\",\"name\":\"Example\",\"example\":true},{\"name\":\"no id\"}],"
            + "\"munitions\":[{\"id\":\"M-001\",\"name\":\"ELD-M 140\",\"caliber\":\"6.5 Creedmoor\",\"bulletWeightG\":9.07,\"bcG1\":\"0,646\",\"bcG7\":0.326,\"nominalV0\":\"\"}],"
            + "\"sheets\":[{\"weaponId\":\"W-001\",\"munitionId\":\"M-001\",\"v0\":800,\"rounds\":10},"
            + "{\"weaponId\":\"W-001\",\"munitionId\":\"M-001\",\"v0\":\"810\",\"hits\":[{},{},{},{},{}]},"
            + "{\"weaponId\":\"W-001\",\"munitionId\":\"M-001\",\"v0\":\"\",\"rounds\":5},"
            + "{\"weaponId\":\"W-001\",\"munitionId\":\"M-001\",\"v0\":900,\"rounds\":5,\"example\":true}]}");
        JSONObject r = at.rangebook.app.LinkProvider.ballistics(db);
        JSONArray w = r.getJSONArray("weapons"), m = r.getJSONArray("munitions");
        ok(w.length() == 1, "only real guns with an id (examples left out)");
        JSONObject g = w.getJSONObject(0);
        ok(g.getDouble("sightHeightMm") == 48.5 && g.getDouble("zeroM") == 100 && g.getString("twist").equals("1:8") && !g.has("notes"), "gun fields as agreed, decimal comma read");
        JSONObject x = m.getJSONObject(0);
        ok(x.getDouble("bcG1") == 0.646 && x.isNull("nominalV0") && x.getDouble("bulletWeightG") == 9.07, "ammunition fields, empty numbers are null");
        JSONObject v = r.getJSONObject("v0").getJSONObject("W-001|M-001");
        ok(Math.abs(v.getDouble("v") - (800 * 10 + 810 * 5) / 15.0) < 0.06 && v.getInt("n") == 2, "measured V0 weighted by rounds, n = sheets with a V0: " + v);
        ok(at.rangebook.app.LinkProvider.ballistics(new JSONObject()).getJSONArray("weapons").length() == 0, "an empty database gives empty lists");
        // SR GunSafe (contract D)
        JSONObject db2 = new JSONObject(db.toString());
        db2.put("barrels", new JSONArray("[{\"id\":\"B-001\",\"weaponId\":\"W-001\",\"name\":\"Factory\",\"installed\":\"2024-01-01\",\"removed\":\"\",\"roundsAtInstall\":0}]"));
        db2.put("roundsLog", new JSONArray("[{\"id\":\"R-0001\",\"date\":\"2026-11-07\",\"weaponId\":\"W-001\",\"barrelId\":\"\",\"munitionId\":\"M-001\",\"rounds\":40,\"note\":\"Shot by shooter xy\"}]"));
        JSONObject gs = at.rangebook.app.LinkProvider.gunsafe(db2);
        JSONArray rd = gs.getJSONArray("rounds");
        int sheetRounds = 0, logRounds = 0;
        for (int i = 0; i < rd.length(); i++) { JSONObject o = rd.getJSONObject(i); if ("sheet".equals(o.getString("source"))) sheetRounds += o.getInt("rounds"); else logRounds += o.getInt("rounds"); }
        ok(gs.getJSONArray("weapons").length() == 1 && gs.getJSONArray("barrels").length() == 1 && gs.getJSONArray("munitions").length() == 1, "gunsafe: guns, barrels and ammunition");
        ok(sheetRounds == 10 + 5 + 5 && logRounds == 40, "gunsafe: rounds fired from datasheets and the rounds log (examples left out): " + sheetRounds + " + " + logRounds);
        ok(rd.getJSONObject(rd.length() - 1).getString("munitionId").equals("M-001") && rd.getJSONObject(rd.length() - 1).getString("ref").equals("R-0001"), "gunsafe: a rounds entry carries its ammunition and id");
        JSONArray inbox = new JSONArray("[{\"barrels\":[{\"id\":\"B-002\",\"isNew\":true,\"weaponId\":\"W-001\",\"name\":\"New\",\"installed\":\"2026-11-07\"},{\"id\":\"B-001\",\"removed\":\"2026-11-07\"}]}]");
        at.rangebook.app.LinkProvider.applyInbox(db2, inbox);
        JSONArray bs = db2.getJSONArray("barrels");
        ok(bs.length() == 2 && bs.getJSONObject(0).getString("removed").equals("2026-11-07") && bs.getJSONObject(1).getString("name").equals("New"), "a queued barrel switch shows at once (old removed, new added)");
        System.out.println(fails == 0 ? "ALL PASSED" : fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
