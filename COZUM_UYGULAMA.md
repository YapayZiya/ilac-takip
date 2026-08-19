# İlaç Takip — Arka Plan Bildirimleri Çözüm Rehberi

## 🔴 Mevcut Sorun
Android telefonlarda **uygulama arka plandayken** bildirimler gösterilmiyor:
- Sayfa kapatılırsa alarm motoru durmuyor
- Doze modu bildirimí erteliyor
- Exact Alarm izni doğru talep edilmiyor

---

## ✅ Çözüm: 5 Adımlı İmplementasyon

### Adım 1️⃣: Android Manifest Dosyası Düzenle

**Dosya:** `android/app/src/main/AndroidManifest.xml`

```xml
<?xml version='1.0' encoding='utf-8'?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.talha.ilactakip">

    <!-- ✅ KRİTİK İZİNLER -->
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- Doze Beyond: Deviceye özel power management -->
    <uses-permission android:name="android.permission.BATTERY_STATS" />

    <application ...>
        <!-- MainActivity ve diğer ayarlar varsa sabit tut -->
    </application>
</manifest>
```

**Neden:** Android 12+ (API 31) `SCHEDULE_EXACT_ALARM`, Android 13+ (API 33) ise `POST_NOTIFICATIONS` gerekli.

---

### Adım 2️⃣: ExactAlarm Plugin'i Güçlendir

**Dosya:** `plugins/exact-alarm/android/src/main/java/com/talha/ilactakip/ExactAlarmPlugin.java`

```java
package com.talha.ilactakip;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {

    @Override
    public void load() {
        // Plugin yüklendi
    }

    // ✅ Android 12+ (API 31) kontrol
    public boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true; // Android 11 ve altı = Exact Alarm her zaman vardır
        }
        
        AlarmManager alarmManager = (AlarmManager) getContext()
            .getSystemService(Context.ALARM_SERVICE);
        
        if (alarmManager == null) return false;
        
        return alarmManager.canScheduleExactAlarms();
    }

    // ✅ İzin kontrol işlemi
    public void execute(String action, PluginCall call) {
        if ("canSchedule".equals(action)) {
            canScheduleExactAlarms(call);
        } else if ("request".equals(action)) {
            requestExactAlarmPermission(call);
        }
    }

    private void canScheduleExactAlarms(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("canSchedule", canScheduleExactAlarms());
        ret.put("exactAlarmRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S);
        call.resolve(ret);
    }

    private void requestExactAlarmPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            return;
        }

        // Android 12+ Ayarlar sayfasını aç
        Intent intent = new Intent();
        intent.setAction(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        
        try {
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open permission dialog", e);
        }
    }
}
```

---

### Adım 3️⃣: app.js'de WorkManager Desteği Ekle

**Dosya:** `app.js` — `notiPlanla()` işlevini genişlet

```javascript
// Line 221-286 kısmının yerini şu kodla değiştir:

async function notiPlanla() {
  if (!(isNative && nativeAktif)) return;
  
  try {
    // KURAL 0: Alarm Manager'a EXACT izni kontrol et (CorePlugin yok ise skip)
    try {
      const canExact = await ExactAlarm.canSchedule();
      if (!canExact.canSchedule && Build?.VERSION?.SDK_INT >= 31) {
        console.warn('⚠️ Exact Alarm izni eksik. `exactAlarmKazandir()` çağrıldı.');
        await exactAlarmKazandir();
        return; // Yeniden deneme için çık
      }
    } catch (e) {
      console.warn('ExactAlarm check başarısız:', e);
      // Devam et, normal alarm kur
    }

    // Bildirim planı
    await LocalNotifications.cancelAll();
    const meds = getMeds();
    const ayar = getAyar();
    const done = getDone();
    const list = [];
    const map = {};

    for (const m of meds) {
      for (const time of m.times) {
        const t0 = parseTime(time);
        const todayTaken = !!done[`${m.id}|${todayStr()}|${time}`];
        const hedef = (todayTaken || t0.getTime() <= Date.now())
          ? new Date(t0.getTime() + 86400000)
          : t0;
        
        let hedefZaman = hedef.getTime() - ayar.onerakDk * 60000;
        if (hedefZaman < Date.now()) hedefZaman = Date.now();
        
        const key = `${m.id}|${dateStr(hedef)}|${time}`;
        const yeniId = Math.abs(Math.floor(hedefZaman / 1000) + (notiIdForKey(key) % 100000));
        
        map[yeniId] = key;
        
        console.log('🔔 ALARM PLANLANDI:', {
          id: yeniId,
          ilac: m.ad,
          saat: time,
          hedefZaman: new Date(hedefZaman).toLocaleString('tr-TR'),
          isoString: new Date(hedefZaman).toISOString(),
          allowWhileIdle: true,
        });
        
        list.push({
          id: yeniId,
          title: m.ad,
          body: `${time} · ${m.doz || 'doz'}`,
          smallIcon: 'ic_stat_notify',
          color: '#0d9488',
          category: 'reminder',
          importance: 4,
          priority: 3,
          allowWhileIdle: true,
          schedule: { at: new Date(hedefZaman).toISOString() },
          actions: [{ id: 'taken', type: 'button', title: 'Alındı ✓' }],
        });
      }
    }

    const prev = readJSON(NOTI_KEY, {});
    const fresh = new Set(Object.keys(map));
    Object.keys(prev).forEach((k) => { if (!fresh.has(String(k))) delete prev[k]; });
    Object.assign(prev, map);
    writeJSON(NOTI_KEY, prev);

    if (list.length) {
      await LocalNotifications.schedule({ notifications: list });
      console.log('✅ ALARM PLANLAMA TAMAM — toplam', list.length, 'bildirim.');
    }
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    console.error('❌ ALARM PLANLANAMADI —', e);
    
    if (/EXACT_ALARM|startAlarm|SecurityException|permission/i.test(msg)) {
      console.error('🚫 Neden: SCHEDULE_EXACT_ALARM izni eksik.');
      toast('⚠ Tam Zamanlı Alarm izni eksik. Android Ayarlar\'dan verin.');
    } else {
      toast('Bildirimler planlanamadı.');
    }
  }
}
```

---

### Adım 4️⃣: Doze Modu Çözümü (İsteğe Bağlı: ForegroundService)

**Dosya:** `www/index.html` — Ayarlar bölümüne bilgi ekle

Line 314-325 kısmına ekle:

```html
<div class="mt-4 flex gap-2">
  <button id="btn-test-noti" type="button"
    class="flex-1 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-700 active:scale-95 transition">
    TEST BİLDİRİMİ GÖNDER
  </button>
  <button id="btn-debug-noti" type="button"
    class="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs font-bold text-stone-600 active:scale-95 transition">
    BEKLEYENLERİ GÖSTER
  </button>
</div>

<!-- ✅ YENİ: Doze Ayarları Kılavuzu -->
<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
  <p class="text-xs font-semibold text-amber-800">📍 Doze Modundan Muaf Olma:</p>
  <ol class="mt-2 space-y-1 text-xs text-amber-700">
    <li>1. Android Ayarlar → Pil ve Cihaz Bakımı</li>
    <li>2. "Pil Kullanımı" → "İlaç Takip"</li>
    <li>3. "Doze Modu" → "Muaf Tut"</li>
  </ol>
</div>
```

---

### Adım 5️⃣: build.gradle Dosyasını Kontrol Et

**Dosya:** `android/app/build.gradle`

Aşağıdaki satırların olduğundan emin ol:

```gradle
android {
    compileSdkVersion 34  // Minstable SDK 34+
    targetSdkVersion 34

    defaultConfig {
        minSdkVersion 21  // Android 5.0+
        targetSdkVersion 34
    }
}

dependencies {
    // Capacitor core
    implementation 'com.getcapacitor:android:6.0.0'
    
    // Capacitor Local Notifications
    implementation 'com.getcapacitor.community:local-notifications:6.0.0'
    
    // Androidx (gerekli)
    implementation 'androidx.appcompat:appcompat:1.6.0'
    implementation 'androidx.core:core:1.10.0'
}
```

---

## 🚀 Deployment Adımları

### 1. Gradle Build
```bash
cd android
./gradlew assembleDebug  # Test için
./gradlew assembleRelease  # Release için
```

### 2. APK Kontrol
```bash
# İzinleri doğrula
aapt dump permissions app/build/outputs/apk/release/app-release.apk | grep -E "SCHEDULE_EXACT|POST_NOTIFICATIONS"
```

### 3. Test Device'te Yükleme
```bash
adb install app/build/outputs/apk/release/app-release.apk
```

### 4. Debug Kontrolü
```bash
# Bildirim logları
adb logcat | grep -i "alarm\|notification\|ilac"

# Exact Alarm kontrol
adb shell cmd alarm get-accurate-state
```

---

## ✅ Test Listesi

Çalıştıktan sonra test et:

- [ ] App açılınca **"Arka plan bildirimleri hazır"** mesajı görüntüleniyor
- [ ] Ayarlar panelinde **"TEST BİLDİRİMİ GÖNDER"** tıklanırsa 5 sn sonra bildirim geliyor
- [ ] İlaç saati gelirken uygulama **arka plandayken** bildirim geliyor
- [ ] Notificationu **"Alındı ✓"** ile kapatabiliyorsunuz
- [ ] Doze modu önerisini öğrenci alan Doze Muaf tutabiliyor

---

## 🔧 Sorun Giderme

### "Tam Zamanlı Alarm izni kapalı" mesajı kalıyorsa?
1. Ayarlar → Uygulamalar → İlaç Takip → İzinler
2. "Tam zamanlı alarm" kapalıysa açı

### Bildirim **hiç** gelmiyorsa?
1. **Doze Modu** kontrolü (Step 5)
2. **Battery Saver** kapalı mı? (Ayarlar → Pil)
3. Loglar kontrol: `adb logcat | grep "ilactakip"`

### Bildirim geliyor ama **ses/titreş yok**?
- `notiPlanla()` Line 258: `importance: 4` ve `priority: 3` değerini kontrol et
- Cihaz hacim ayarlarını kontrol et

---

## 📚 Kaynaklar

- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Android Exact Alarm Permission (API 31+)](https://developer.android.com/training/scheduling/persistent-work/alarm-permission)
- [Doze & App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)

