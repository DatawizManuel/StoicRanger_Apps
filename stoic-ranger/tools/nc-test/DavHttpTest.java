import at.rangebook.app.DavHttpProbe;

/** Runs the Android app's WebDAV code (DavHttp) against a real Nextcloud: tools/test-nextcloud.sh starts one. */
public class DavHttpTest {
    public static void main(String[] a) throws Exception { System.exit(DavHttpProbe.run(a[0], a[1], a[2], a[3]) ? 0 : 1); }
}
