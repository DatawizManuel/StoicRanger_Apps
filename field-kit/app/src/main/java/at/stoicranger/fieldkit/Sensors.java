package at.stoicranger.fieldkit;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

/**
 * Phone sensors for the tools (remarks #4 and #6): air pressure and ambient temperature for Drop & wind (only when
 * the user taps "Use sensors"), and the flashlight for the signal light. Nothing is logged or stored here.
 */
final class Sensors {
    private Sensors() { }

    interface Done { void done(JSONObject result); }

    /** Reads one value from the barometer and the temperature sensor (where the phone has them), at most 3 s. */
    static void read(Context c, final Done done) {
        final SensorManager sm = (SensorManager) c.getSystemService(Context.SENSOR_SERVICE);
        final JSONObject out = new JSONObject();
        final Sensor p = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_PRESSURE);
        final Sensor t = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_AMBIENT_TEMPERATURE);
        try { out.put("hasPressure", p != null).put("hasTemp", t != null); } catch (Exception ignored) { }
        if (p == null && t == null) { done.done(out); return; }
        final Handler h = new Handler(Looper.getMainLooper());
        final boolean[] finished = { false };
        final SensorEventListener l = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent e) {
                try {
                    if (e.sensor.getType() == Sensor.TYPE_PRESSURE && !out.has("pressure")) out.put("pressure", (double) e.values[0]);
                    if (e.sensor.getType() == Sensor.TYPE_AMBIENT_TEMPERATURE && !out.has("temp")) out.put("temp", (double) e.values[0]);
                } catch (Exception ignored) { }
                if ((p == null || out.has("pressure")) && (t == null || out.has("temp"))) finish();
            }
            @Override public void onAccuracyChanged(Sensor s, int a) { }
            void finish() {
                if (finished[0]) return;
                finished[0] = true;
                sm.unregisterListener(this);
                done.done(out);
            }
        };
        h.post(new Runnable() { @Override public void run() {
            if (p != null) sm.registerListener(l, p, SensorManager.SENSOR_DELAY_NORMAL);
            if (t != null) sm.registerListener(l, t, SensorManager.SENSOR_DELAY_NORMAL);
        }});
        h.postDelayed(new Runnable() { @Override public void run() {
            if (finished[0]) return;
            finished[0] = true;
            sm.unregisterListener(l);
            done.done(out);
        }}, 3000);
    }

    private static String torchId(Context c) {
        try {
            CameraManager cm = (CameraManager) c.getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                Boolean f = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (f != null && f) return id;
            }
        } catch (Exception ignored) { }
        return null;
    }

    static boolean hasTorch(Context c) { return torchId(c) != null; }

    /** Flashlight on/off (no camera permission needed for this). */
    static boolean torch(Context c, boolean on) {
        String id = torchId(c);
        if (id == null) return false;
        try { ((CameraManager) c.getSystemService(Context.CAMERA_SERVICE)).setTorchMode(id, on); return true; }
        catch (Exception e) { return false; }
    }
}
