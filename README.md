# İlaç Takip 💊

Çoklu hasta destekli, PIN korumalı ilaç hatırlatma uygulaması.
Hem tarayıcıda **PWA** olarak hem de **Capacitor** ile paketlenmiş **native Android APK** olarak çalışır.

> **Offline-first mimari:** Uygulama açılışı hiçbir zaman ağa bağımlı değildir. Tüm veri önce
> cihazda (localStorage) tutulur; Firebase Realtime Database sadece cihazlar arası
> senkronizasyon için arka planda kullanılır.

## ✨ Özellikler

### Hasta Yönetimi
- **Çoklu hasta** — her hastanın kendi ilaç listesi, alındı takibi ve ayarları
- **PIN koruma** — opsiyonel 4-6 haneli PIN; PIN'li hastaya girişte doğrulama ekranı
- **"Bu telefona güven"** — PIN doğru girildiğinde işaretlenirse o hasta bu cihazda bir daha PIN sormadan açılır; güven Ayarlar'dan kaldırılabilir
- **Hasta düzenleme / silme** — listede her kartın yanındaki ikonlarla (silme onay ister)

### İlaç Takibi
- **İlaç CRUD** — ad, doz bilgisi, günde 1-8 doz saati (dinamik saat ekleme/çıkarma, önerilen saatler)
- **Günlük ilaç kartları** — saate göre sıralı, durum bazlı renklendirme:
  - 🟡 **Bekliyor** — doz saatine henüz yaklaşılmadı
  - 🔴 **Yaklaşıyor / Gecikti** — hatırlatma penceresi içinde
  - ⚪ **Geçti** — pencere sona erdi
  - 🟢 **Alındı** — alınma saatiyle birlikte
- **Düzenle / Sil butonları** — varsayılan olarak gizli, **Ayarlar** panelinden tek tıkla açılıp kapanır (daha temiz görünüm)

### Hatırlatmalar
- **Sesli + Görsel alarm** — Web Audio API iki notalık bip, tarayıcı bildirimi ve ekranda alarm kartı
- **Akıllı zamanlama** — doz saatinden "önerak" süresi (0-45 dk, varsayılan 15 dk) kadar önce uyarır, doz saatinden 120 dk sonrasına kadar aktif kalır
- **Alarm kuyruğu** — birden fazla doz aynı anda geldiğinde sırayla gösterilir
- **Erteleme** — 5/10/15/20/30 dk (Ayarlar'dan seçilir); süre dolunca tekrar uyarır
- **15 saniyede bir kontrol** — uygulama açıkken alarm motoru sürekli çalışır
- **Sadece açık hasta alarmları** — alarmlar yalnızca o an ekranda açık olan hasta için çalar; hiç açılmamış bir hastanın web alarmı gelmez
- **Native bildirimler** — `@capacitor/local-notifications` ile uygulama arka plandayken bile zamanlanmış bildirimler; yalnızca bu cihazda açılmış hastalar için kurulur, bildirimin üzerindeki **"Alındı ✓"** butonuyla doğrudan işaretleme

### Raporlar
- **Gün sonu özeti** — günün tüm dozları alındığında otomatik özet modalı (alınan saat / geçen dozlar)
- **7 günlük rapor geçmişi** — hasta ekranındaki **📊** butonuyla son 1 haftanın gün sonu raporlarını görüntüleme (her gün: planlanan/alınan/geçen dozlar, doz detayları)

### Senkronizasyon
- **Firebase senkronizasyonu** — her işlemden sonra (ilaç ekle/düzenle/sil, alındı işaretle, ayar değiştir) veri arka planda Firebase'e push edilir
- **Görünür onay** — senkron başarılıysa "Sunucuya senkronize edildi ✓", çevrimdışıysa "Değişiklik cihazda tutuluyor" bildirimi
- **Hasta keşfi** — kayıt defteri (`__registry__`) sayesinde yeni cihaz/temiz kurulumda Firebase'deki hastalar otomatik bulunur
- **Bloklamayan tasarım** — tüm istekler 6 saniye zaman aşımlı, açılış asla bekletilmez

### Deneyim
- **Kalan ilaca otomatik kaydırma** — hasta ekranına her dönüşte ekran, alınmamış ilk doza kayar
- **PWA** — ana ekrana eklenebilir, service worker ile offline app-shell önbellekleme
- **Native geri tuşu** — açık modal/panel önce kapanır, sonra normal geri davranışı

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Arayüz mantığı | Vanilla JavaScript (ES2019), esbuild ile `www/app.bundle.js` |
| Stil | Tailwind CSS v4, build-time'da yerel `www/tailwind.css`'e derlenir (CDN yok) |
| Depolama | localStorage (birincil) + Firebase RTDB REST API (senkronizasyon) |
| Native paketleme | Capacitor 8.x (Java 21, Node >= 22, Gradle 8.14 / AGP 8.13) |
| Bildirimler | `@capacitor/local-notifications` |
| Uygulama yaşam döngüsü | `@capacitor/app` |
| Tam zamanlı alarm | Özel plugin `@ilac/exact-alarm` (Android 12+ `SCHEDULE_EXACT_ALARM`) |
| Build | esbuild (JS) + `@tailwindcss/cli` (CSS) + Gradle |
| CI | GitHub Actions — `.github/workflows/build-android.yml` (Node 22, JDK 21) |

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

> `npm run build` ile `www/tailwind.css` ve `www/app.bundle.js` üretilir; bu dosyalar
> `.gitignore`'dadır. `android/` klasörü de gitignore'dadır (CI'da `npx cap add android` ile üretilir).

## Firebase Yapılandırması

```
patients/
  {hastaId}/
    ad, pin
    meds: [ { id, ad, doz, times, updatedAt }, ... ]
    done: { "{ilacId}|{tarih}|{saat}": timestamp, ... }
  __registry__/              ← hasta keşfi kayıt defteri
    ids: [ "{hastaId}", ... ]
```

- **DB_URL:** `https://ilac-takip-da59e-default-rtdb.europe-west1.firebasedatabase.app`
- **Kurallar:** okuma/yazma `patients/$patientId` seviyesinde tanımlıdır. Tam liste okuması
  için önerilen kurallar:
  ```json
  {
    "rules": {
      "patients": {
        ".read": true,
        "$patientId": { ".write": true }
      }
    }
  }
  ```

## Proje Yapısı

```
ilac-takip/
├── app.js                    # Ana uygulama mantığı (tek dosya, esbuild ile bundle)
├── firebase-config.js        # Firebase yapılandırması (DB_URL + API_KEY)
├── src/
│   └── tailwind-input.css    # Tailwind v4 giriş dosyası (@theme + @source)
├── www/                      # webDir (Capacitor + statik sunucu)
│   ├── index.html            # 3 ekran + 7 modal
│   ├── style.css             # Özel/animasyon stilleri
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker (APP_SHELL önbelleği)
│   ├── tailwind.css          # BUILD çıktısı
│   ├── app.bundle.js         # BUILD çıktısı
│   └── icons/                # postinstall'da üretilir
├── plugins/
│   └── exact-alarm/          # Özel Capacitor plugin (JS + Android Java)
│       ├── index.js
│       ├── package.json
│       └── android/          # build.gradle + ExactAlarmPlugin.java
├── scripts/
│   └── copy-icon.cjs         # PNG ikon üretici
├── .github/workflows/
│   └── build-android.yml     # CI: build → cap sync → APK
├── capacitor.config.json     # appId com.ilac.takip, webDir www
└── package.json
```

## Veri Modeli (localStorage)

```
ilac_takip:hastalar           → [{ id, ad, pin }]
ilac_takip:aktif              → hasta id (string)
ilac_takip:ilac:{hastaId}     → [{ id, ad, doz, times, updatedAt }]
ilac_takip:alindi:{hastaId}   → { "{ilacId}|{YYYY-MM-DD}|{saat}": timestamp }
ilac_takip:ayar:{hastaId}     → { onerakDk, erteleDk, duzenButonlari }
ilac_takip:rapor:{hastaId}    → { "YYYY-MM-DD": { planlanan, alinan, geciken, detay } } (7 gün)
ilac_takip:noti               → { [bildirimId]: "{ilacId}|{tarih}|{saat}" }
ilac_takip:ozet:{hastaId}     → son gösterilen özet tarihi
ilac_takip:guven:{hastaId}    → true (bu telefona güvenildiyse — PIN sorulmaz)
ilac_takip:acilan             → [hastaId, ...] (bu cihazda açılmış hastalar)
ilac_takip:exact-asked        → tam zamanlı alarm izni istendi mi
ilac_takip:battery-asked      → pil optimizasyonu muafiyeti istendi mi
```
