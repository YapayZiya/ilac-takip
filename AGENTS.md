# AGENTS.md — İlaç Takip Kod Kuralları

Bu dosya, bu repo için yapay zeka asistanlarının (agent'ların) kod yazarkan izlemesi gereken kuralları içerir.

## Genel İlkiler

- **Tek dosya:** `app.js` tüm uygulama mantığını içerir. Yeni dosya açmak yerine bu dosyayı düzenle.
- **firebase-config.js:** Firebase yapılandırması ayrı bir dosyada saklanır (hardcoded).
- **Stil:** vanilla JS (ES2019), strict mode, IIFE. No framework.
- **Paketleme:** esbuild ile `www/app.bundle.js` oluşturulur. Build komutu: `npm run build`.
- **Depolama:** LocalStorage (Offline-First). Firebase Realtime Database REST API ile senkronizasyon.
- **Native:** Capacitor 6. Sadece `isNative` kontrolü ile native API çağrılır.

## Mimari (Offline-First)

Uygulama **Offline-First** olarak tasarlanmıştır:

1. **İnternet varsa:** Firebase'den veri çekilir → LocalStorage'e kaydedilir
2. **İnternet yoksa:** Sadece LocalStorage kullanılır
3. **Veri değişikliği:** Otomatik olarak Firebase'e push edilir

Firebase konfigürasyonu `firebase-config.js` dosyasında sabittir, kullanıcıdan girmeye gerek yoktur.

## Bildirim & Alarm

- Native bildirimler: `@capacitor/local-notifications`
- Android 12+ exact alarm: custom plugin `@ilac/exact-alarm`
- `setupNative()` içinde izin kontrolü + exact alarm izni isteme yapılır.
- `notiPlanla()`: aktif hastanın tüm dozlarını planlar. `cancelAll()` ÇALIŞMIYOR, eski ID'ler tek tek iptal edilir.
- **Kritik:** `allowWhileIdle: true` ve `notiPlanla()` her değişiklikte çağrılır.
- Zaman kontrolü (web tarafı): `kontrol()` + `setInterval(15sn)` — sayfa açıkken çalışır.
- Android'de bildirim: `priority: 4`, `visibility: 'public'`, `vibrationPattern`, `channelId: 'med-reminders'`.
- `izinIste()` native'de LocalPermissions kullanır.

## UX Kuralları

- Ayarlar paneli kapanınca ana ekrana dönülür (`ayarKapa()` → `appGoster()`).
- Uzun ilaç listelerinde bekleyen ilaçlara otomatik kaydırma.
- Gün sonu özeti: tüm ilaçlar alındıysa `#modal-summary` gösterilir.
- PIN ekranı basit bir input, doğruysa hastayı aç.

## Veri Akışı

### Hasta Seçimi
1. `loadHastalarFromFirebase()` → internet varsa Firebase'den çek
2. `listeyiCizHastalar()` → hastaları görüntüle

### Hasta Girişi (PIN)
1. Kullanıcı hastaya tıklar
2. PIN kutusu açılır (varsa)
3. PIN doğruysa `hastaGir()` → ilaçları getir

### İlaç Çekme
- `navigator.onLine` kontrolü yapılır
- İnternet varsa: `fetchFromFirebase('/patients/{id}/meds')` → LocalStorage
- İnternet yoksa: `getMeds()` sadece LocalStorage okur

## AndroidManifest

- `android/app/src/main/AndroidManifest.xml` zaten `SCHEDULE_EXACT_ALARM` içerir.
- GitHub Actions, build sırasında izinleri otomatik enjekte eder.
- Android 13+ için `POST_NOTIFICATIONS` izni gereklidir.
- Pil optimizasyonu için `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` izni eklenmiştir.

## Düzenlemeler Yaparken

- `app.js` değişikliği yapıldığında: `npm run build` çalıştır.
- `firebase-config.js` değişikliği yapıldığında: API anahtarlarını güncelle.
- Android-specific değişiklik: `android/` klasörünü düzenle.
- Plugin değişikliği: `plugins/exact-alarm/android/` altındaki Java dosyasını düzenle, sonra `npx cap sync android`.

## Firebase Kullanım Kuralları

- REST API kullanılır (SDK yok)
- URL: `https://ilac-takip-da59e-default-rtdb.europe-west1.firebasedatabase.app`
- API Key: `AIzaSyCvwNDuE0QFD6K4OcUhJ-688_-MD9k0Jc8`
- Veri yolu: `/patients/{hasta_id}/meds` ve `/patients/{hasta_id}/done`

## Yasaklar

- Backend/API ekleme (REST API dışında)
- Yeni npm paketi eklemeden önce mevcutları kullan (`@capacitor/*`)
- `localStorage` dışı kalıcı depolama ekleme (sadece Firebase REST)
- Kodda yorum satırı gerektiren karmaşık mantıkları `README` veya `PROGRESS.md` ye açıklayabilirsin.