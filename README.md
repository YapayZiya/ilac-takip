# İlaç Takip

Çoklu hasta destekli, PIN korumalı ilaç hatırlatma uygulaması.  
Hem tarayıcıda PWA olarak hem de Capacitor ile paketlenmiş native Android APK olarak çalışır.

## Özellikler

- **Çoklu hasta yönetimi** — her hastanın kendi ilaç listesi ve ayarları
- **Opsiyonel PIN koruma** — 4-6 haneli PIN ile hasta girişi
- **İlaç CRUD** — ad, doz, günde 1-8 doz saati
- **Günlük ilaç kartları** — duruma göre renklendirilmiş kartlar (bekliyor/gecikti/alındı)
- **Sesli+Görsel alarm** — Web Audio API bip, tarayıcı bildirimi, modal alarm
- **Erteleme** — 5/10/15/20/30 dk erteleme
- **Gün sonu özeti** — tüm dozlar alındığında otomatik özet
- **Native Android bildirimleri** — Capacitor LocalNotifications, arka planda alarm
- **Firebase senkronizasyonu** — cihazlar arası veri paylaşımı (offline-first)
- **PWA** — ana ekrana eklenebilir, service worker ile offline önbellekleme
- **Ayarlar paneli** — önerak süresi, erteleme süresi

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Arayüz | Vanilla JS (ES2019), esbuild ile bundle |
| Stil | Tailwind CSS v4, build-time derlenmiş |
| Depolama | localStorage (offline-first) + Firebase RTDB |
| Native | Capacitor 8 (Android) |
| Bildirimler | @capacitor/local-notifications |
| Tam zamanlı alarm | @ilac/exact-alarm (SCHEDULE_EXACT_ALARM) |

## Geliştirme

```bash
# Bağımlılıkları kur
npm install

# Web asset'leri derle (CSS + JS)
npm run build

# Geliştirme sunucusu
npm start
# http://localhost:8000

# Android platformu ekle (ilk sefer)
npx cap add android

# Web asset'lerini native projeye kopyala
npx cap sync android

# Android APK derle
cd android && ./gradlew assembleDebug
```

## Proje Yapısı

```
ilac-takip/
├── app.js                    # Ana uygulama mantığı
├── firebase-config.js        # Firebase yapılandırması
├── src/
│   └── tailwind-input.css    # Tailwind v4 giriş dosyası
├── www/                      # webDir (Capacitor + statik sunucu)
│   ├── index.html
│   ├── style.css             # Özel/animasyon stilleri
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   ├── tailwind.css          # BUILD çıktısı
│   └── app.bundle.js         # BUILD çıktısı
├── plugins/
│   └── exact-alarm/          # Özel Capacitor plugin
├── scripts/
│   └── copy-icon.cjs
├── capacitor.config.json
└── package.json
```