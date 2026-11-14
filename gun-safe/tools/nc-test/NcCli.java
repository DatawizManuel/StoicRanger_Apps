import at.stoicranger.gunsafe.Nextcloud;
import java.nio.file.Files;
import java.nio.file.Paths;
/** Runs one op of the app's own WebDAV code (Nextcloud.java) like MainActivity.nc does, for the real-server test.
 *  java NcCli <url> <user> <pw> <op> <path> <in-file|-> <ifMatch|-> <out-file>  → prints {ok,status,etag,msg,names} */
public class NcCli {
    static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    public static void main(String[] a) throws Exception {
        Nextcloud n = new Nextcloud(a[0], a[1], a[2]);
        String op = a[3], path = a[4], ifm = "-".equals(a[6]) ? "" : a[6];
        byte[] in = "-".equals(a[5]) ? null : Files.readAllBytes(Paths.get(a[5]));
        Nextcloud.Result r;
        if ("get".equals(op)) r = n.get(path);
        else if ("put".equals(op)) r = n.put(path, in, ifm, false);
        else if ("putNew".equals(op)) r = n.put(path, in, null, true);
        else if ("mkdirs".equals(op)) r = n.mkdirs(path);
        else if ("list".equals(op)) r = n.list(path);
        else if ("delete".equals(op)) r = n.delete(path);
        else throw new Exception("op?");
        if (r.body != null && "get".equals(op)) Files.write(Paths.get(a[7]), r.body);
        StringBuilder names = new StringBuilder("[");
        if (r.names != null) for (int i = 0; i < r.names.size(); i++) names.append(i > 0 ? "," : "").append(q(r.names.get(i)));
        System.out.println("{\"ok\":" + r.ok() + ",\"status\":" + r.status + ",\"etag\":" + q(r.etag) + ",\"msg\":" + q(r.error)
            + (r.names != null ? ",\"names\":" + names + "]" : "") + ",\"hasData\":" + (r.body != null && "get".equals(op)) + "}");
    }
}
