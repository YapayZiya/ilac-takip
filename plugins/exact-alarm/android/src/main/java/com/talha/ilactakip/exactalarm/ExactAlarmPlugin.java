package com.talha.ilactakip.exactalarm;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {

    @PluginMethod
    public void canSchedule(PluginCall call) {
        boolean canAlarm = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            canAlarm = am != null && am.canScheduleExactAlarms();
        }
        boolean canNotify = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            canNotify = getContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        call.resolve(new JSObject()
            .put("canSchedule", canAlarm)
            .put("needsPermission", !canAlarm)
            .put("exactAlarmRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            .put("canNotify", canNotify)
            .put("needsNotifyPermission", !canNotify && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU));
    }

    @PluginMethod
    public void request(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
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
            call.resolve(new JSObject()
                .put("opened", false)
                .put("manualPath", "Settings > Apps > " + ctx.getApplicationInfo().loadLabel(ctx.getPackageManager()) + " > Alarms & reminders"));
        }
    }

    @PluginMethod
    public void requestNotifyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        String[] perms = new String[]{ android.Manifest.permission.POST_NOTIFICATIONS };
        if (getActivity() != null) {
            getActivity().requestPermissions(perms, 1001);
            call.resolve(new JSObject().put("requested", true));
        } else {
            call.reject("Bildirim izni icin etkin bir Activity yok.");
        }
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(new JSObject().put("opened", false));
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            if (getActivity() != null) {
                getActivity().startActivity(intent);
                call.resolve(new JSObject().put("opened", true));
            } else {
                call.reject("Activity yok.");
            }
        } catch (Exception e) {
            call.resolve(new JSObject().put("opened", false));
        }
    }
}
