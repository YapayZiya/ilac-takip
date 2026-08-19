package com.talha.ilactakip.exactalarm;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android 12+ (API 31) uzerinde SCHEDULE_EXACT_ALARM iznini kontrol eder.
 * Capacitor LocalNotifications, bu izin yoksa AlarmManager.setExact* yerine
 * setAndAllowWhileIdle(non-exact) kullanir; bu da Doze/pil-tasarrufu modunda
 * saatler sonrasina kurulu alarmlari ERTELER. Bu plugin izni kontrol eder ve
 * kullaniciyi tek dokunuşla DOGRU ayar sayfasina gondermek iceriginde
 * izin sayfasi acar.
 */
@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {

    @PluginMethod
    public void canSchedule(PluginCall call) {
        boolean can = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            can = am != null && am.canScheduleExactAlarms();
        }
        call.resolve(new JSObject()
            .put("canSchedule", can)
            .put("needsPermission", !can)
            .put("exactAlarmRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S));
    }

    @PluginMethod
    public void request(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // API 30 ve altinda izin gerekmez
            call.resolve(new JSObject().put("opened", false));
            return;
        }
        try {
            Intent intent = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + ctx.getPackageName())
            );
            if (getActivity() != null) {
                getActivity().startActivity(intent);
                call.resolve(new JSObject().put("opened", true));
            } else {
                call.reject("Exact alarm izni icin etkin bir Activity yok.");
            }
        } catch (Exception e) {
            // Karsi sayfayi acamazsak (nadiren) kullaniciya manuel yol verilir.
            call.resolve(new JSObject()
                .put("opened", false)
                .put("manualPath", "Settings > Apps > " + ctx.getApplicationInfo().loadLabel(ctx.getPackageManager()) + " > Alarms & reminders"));
        }
    }
}
