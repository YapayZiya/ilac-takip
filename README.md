# İlaç Takip

İlaçlarınızı kaçırmamanız için çalışan, hasta başına PIN korumalı, çoklu hasta destekli bir Android/PWA hatırlatıcı uygulaması. Aile üyeleriyle gerçek zamanlı senkronizasyon desteği.

## Özellikler

- Çoklu hasta yönetimi (her hasta için ayrı ilaç listesi)
- İsteğe bağlı PIN koruması (4–6 haneli)
- İlaç ekleme / düzenleme / silme
- Saatlerde otomatik alarm ve bildirim
- Önce uyarı süresi ayarı (0–45 dk)
- Erteleme (5 / 10 / 15 / 20 / 30 dk)
- Alındı takibi + günlük özet
- Veri yedeği (dışa aktarma / içe aktarma / telefonda klasöre kaydetme, JSON)
- Arka planda çalışan native Android bildirimleri
- Tam zamanlı alarm (Exact Alarm) desteği
- Android 12+ `SCHEDULE_EXACT_ALARM` izni kontrolü
- Android 13+ `POST_NOTIFICATIONS` izni desteği
- Yüksek öncelikli bildirimler + titreşim + ekran açma
- Alındı işaretinde alınan saatin kartta kalıcı gösterimi
- Ayarlar ekranı geri tuşu ile ana ekrana dönüş
- Uzun ilaç listelerinde bekleyen ilaçlara otomatik kaydırma
- Gün sonu özet raporu (alınan / atlanan ilaçlar)
- **Firebase gerçek zamanlı senkronizasyonu** (aile üyeleri arasında)
- PWA + Capacitor Android (APK)

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Arayüz | HTML5 + Tailwind CSS (Play CDN) |
| Mantık | Vanilla JS (ES2019), esbuild ile paketlenir |
| Depolama | LocalStorage (+ Firebase Realtime Database) |
| Native | Capacitor 6 |
| Bildirim | `@capacitor/local-notifications` |
| Alarm | Custom `@ilac/exact-alarm` plugin (Android 12+) |
| Senkronizasyon | Firebase Realtime Database (REST API) |
| Build | Gradle + GitHub Actions |

## Kurulum (Yerel)

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

## Firebase Senkronizasyonu

Uygulama, aile üyeleri arasında gerçek zamanlı ilaç durumu senkronizasyonu için Firebase Realtime Database kullanır.

### Firebase Kurulum Adımları:

1. [Firebase Console](https://console.firebase.google.com/) adresine gidin
2. Yeni bir proje oluşturun veya mevcut bir proje seçin
3. **Realtime Database** ekleyin:
   - Database türü: **Real-time Database**
   - Konumu: **us-central1** (veya en yakın bölge)
   - Başlangıç modu: **Test mode** (veya gerekirse kilitli mod)

4. Uygulama ayarlarından **Ayarlar > Firebase Senkronizasyonu** bölümüne şunları girin:
   - Database URL: `https://PROJECT_ID-default-rtdb.firebaseio.com`
   - API Key: Firebase projesinin AI Platform Kimlik bilgileri altından alınabilir

### Etkinleştirme:

1. Uygulama içinde **Ayarlar** (ayar simgesi) butonuna dokunun
2. **Firebase Senkronizasyonu** bölümünün altında **Firebase Yapılandır** butonuna dokunun
3. Database URL ve API Key sorulacak, gerekinize göre girin
4. Ayarları kaydedip uygulamayı yeniden başlatın

### Güvenlik Kuralları (önerilen):

```json
{
  "rules": {
    "patients": {
      "$patientId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

## APK Oluşturma (GitHub Actions)

Ana dal'a (`main`) her push'ta otomatik olarak debug APK derlenir:

1. Web varlıkları esbuild ile paketlenir (`npm run build`)
2. Capacitor senkronize edilir (`npx cap sync android`)
3. Android izinleri enjekte edilir
4. Gradle ile debug APK derlenir
5. APK, GitHub Actions artifacts olarak yüklenir

> **Not:** Tam zamanlı alarm için Android 12+ cihazlarda uygulamayı ilk açarken `Ayarlar > Uygulamalar > İlaç Takip > Tam zamanlı alarm` iznini açın. Android 13+ cihazlarda ek olarak `POST_NOTIFICATIONS` izni istenecektir.

## Proje Yapısı

```
ilac_takip/
├── app.js                   # Tüm uygulama mantığı (ES module)
├── www/
│   ├── index.html           # PWA şablonu
│   ├── app.bundle.js        # esbuild çıktısı
│   ├── style.css            # Özel stiller
│   └── sw.js                # Service Worker
├── plugins/
│   └── exact-alarm/         # Android Exact Alarm custom plugin
├── android/                 # Capacitor Android projesi
├── docs/
│   └── screenshots/         # Uygulama ekran görüntüleri
├── .github/workflows/       # CI/CD
├── package.json
├── capacitor.config.json
└── scripts/
```

## Ekran Görüntüleri

<div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;">
  <img src="docs/screenshots/Screenshot_1.jpg" alt="Ekran 1" style="width: 40%; max-width: 320px; height: auto; border-radius: 8px;" />
  <img src="docs/screenshots/Screenshot_2.jpg" alt="Ekran 2" style="width: 40%; max-width: 320px; height: auto; border-radius: 8px;" />
</div>

## Lisans

MIT