# AGENTS.md — İlaç Takip Kod Kuralları

Bu dosya, bu repo için yapay zeka asistanlarının (agent'ların) kod yazarken izlemesi gereken kuralları içerir.

## Genel İlkeler

- Tek dosya: `app.js` tüm uygulama mantığını içerir. Yeni dosya açmak yerine bu dosyayı düzenle.
- Stil: vanilla JS (ES2019), strict mode, IIFE. No framework.
- Paketleme: esbuild ile `www/app.bundle.js` oluşturulur. Build komutu: `npm run build`.
- Depolama: yalnızca `localStorage`. Backend yok.
- Native: Capacitor 6. Sadece `isNative` kontrolüyle native API çağrılır.

## Bildirim & Alarm

- Native bildirimler: `@capacitor/local-notifications`
- Android 12+ exact alarm: custom plugin `@ilac/exact-alarm`
- `setupNative()` içinde izin kontrolü + exact alarm izni isteme yapılır.
- `notiPlanla()`: aktif hastanın tüm dozlarını planlar. `cancelAll()` ÇALIŞMIYOR, bunun yerine eski ID’ler tek tek iptal edilir.
- Her değişiklikte `notiPlanla()` çağrılır.
- Zaman kontrolü (web tarafı): `kontrol()` + `setInterval(15sn)` — sayfa açıkken çalışır.
- Test butonları: `testNotiGonder()` ve `debugNotiGoster()` mevcut.
- Android’de bildirim uyandırma/titreşim için `priority: 4`, `visibility: 'public'`, `vibrationPattern`, `fullScreenIntent: true` kullan.
- `izinIste()` native’de LocalPermissions kullanır.

## Veri Yedeği

- Native’de iki seçenek vardır:
  - `veriDisa()`: dosyayı `Documents/` dizinine yazıp paylaşır.
  - `veriDisaKaydet()`: dosyayı `Documents/ilac-takip-yedekler/` klasörüne kaydeder, paylaşmaz.
- İçe aktarma için dosya seçici `#import-file` kullanılır.

## AndroidManifest

- `android/app/src/main/AndroidManifest.xml` zaten `SCHEDULE_EXACT_ALARM` içerir.
- GitHub Actions, build sırasında izinleri otomatik enjekte eder.
- Android 13+ için `POST_NOTIFICATIONS` izni gereklidir.
- Pil optimizasyonu için `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` izni eklenmiştir.

## Düzenlemeler Yaparken

- `app.js` değişikliği yapıldığında: `npm run build` ve `npx cap sync android` çalıştır.
- Android-specific değişiklik (manifest, Java): `android/` klasörünü düzenle.
- Plugin değişikliği: `plugins/exact-alarm/android/` altındaki Java dosyasını düzenle, sonra `npx cap sync android`.

## Yasaklar

- Backend, API, veritabanı ekleme.
- Yeni npm paketi eklemeden önce mevcutları kullan (`@capacitor/*`).
- `localStorage` dışı kalıcı depolama ekleme.
- Kodda yorum satırı gerektiren karmaşık mantıkları `README` veya `PROGRESS.md` ye açıklayabilirsin.
