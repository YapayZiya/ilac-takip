# İlaç Takip

İlaçlarınızı kaçırmamanız için çalışan, hasta başına PIN korumalı, çoklu hasta destekli bir Android/PWA hatırlatıcı uygulaması. **Offline-First** mimari ile Firebase Realtime Database senkronizasyonu.

## Özellikler

- Çoklu hasta yönetimi (her hasta için ayrı ilaç listesi)
- İsteğe bağlı PIN koruması (4–6 haneli)
- İlaç ekleme / düzenleme / silme
- Saatlerde otomatik alarm ve bildirim
- Önce uyarı süresi ayarı (0–45 dk)
- Erteleme (5 / 10 / 15 / 20 / 30 dk)
- Alındı takibi + günlük özet
- **Otomatik Firebase senkronizasyonu** (yapılandırma gerektirmez)
- Arka planda çalışan native Android bildirimleri
- Tam zamanlı alarm (Exact Alarm) desteği
- Android 12+ `SCHEDULE_EXACT_ALARM` izni kontrolü
- Android 13+ `POST_NOTIFICATIONS` izni desteği
- Yüksek öncelikli bildirimler + titreşim + ekran açma
- Alındı işaretinde alınan saatin kartta kalıcı gösterimi
- Ayarlar ekranı geri tuşu ile ana ekrana dönüş
- Uzun ilaç listelerinde bekleyen ilaçlara otomatik kaydırma
- Gün sonu özet raporu (alınan / atlanan ilaçlar)
- PWA + Capacitor Android (APK)

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Arayüz | HTML5 + Tailwind CSS (Play CDN) |
| Mantık | Vanilla JS (ES2019), esbuild ile paketlenir |
| Depolama | LocalStorage (Offline-First, Firebase senkronizasyonu) |
| Native | Capacitor 6 |
| Bildirim | `@capacitor/local-notifications` |
| Alarm | Custom `@ilac/exact-alarm` plugin (Android 12+) |
| Senkronizasyon | Firebase Realtime Database (REST API) |
| Build | Gradle + GitHub Actions |

## Dosya Yapısı

```
ilac_takip/
├── app.js                   # Ana uygulama mantığı
├── firebase-config.js       # Firebase yapılandırması (hardcoded)
├── www/
│   ├── index.html           # PWA şablonu
│   ├── app.bundle.js        # esbuild çıktısı
│   ├── style.css            # Özel stiller
│   └── sw.js                # Service Worker
├── plugins/
│   └── exact-alarm/         # Android Exact Alarm plugin
├── android/                 # Capacitor Android projesi
├── docs/
│   └── screenshots/         # Ekran görüntüleri
├── .github/workflows/       # CI/CD
├── package.json
├── capacitor.config.json
└── scripts/
```

## Kurulum

```bash
# Bağımlılıklar
npm install

# PWA sunucu (localhost:8000)
npm start

# JS paketleme
npm run build

# Android ekle (ilk seferde)
npx cap add android

# Senkronize et
npx cap sync android

# Android Studio ile aç
npx cap open android
```

## Firebase Yapılandırması

Uygulama önceden yapılandırılmış Firebase projesini kullanır:
- **Project ID:** ilac-takip-da59e
- **Database:** europe-west1 bölgesinde Realtime Database

### Veri Yapısı

```
patients/
  ├── {hasta_id}/
  │   ├── meds: [...]       # İlaç listesi
  │   └── done: {}           # Alındı kayıtları
  └── {hasta_id_2}/...       # Diğer hastalar
```

### Güvenlik Kuralları (Firebase Console'da ayarlayın)

```json
{
  "rules": {
    "patients": {
      "$patientId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Test amaçlı (geliştirme modu) kurallar yukarıdaki gibidir.

## APK Oluşturma (GitHub Actions)

Ana dal'a (`main`) her push'ta debug APK derlenir:

1. Web varlıkları esbuild ile paketlenir
2. Capacitor senkronize edilir
3. Android izinleri enjekte edilir
4. Gradle ile debug APK derlenir
5. APK, GitHub Actions artifacts olarak yüklenir

## Offline-First Mimari

- **İnternet varsa:** Firebase'den veri çekilir, LocalStorage'e kaydedilir
- **İnternet yoksa:** Sadece LocalStorage kullanılır
- Veri değişikliklerinde otomatik olarak Firebase'e push edilir

## Lisans

MIT