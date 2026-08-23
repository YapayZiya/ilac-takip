# AGENTS.md

Bu dosya, bu projede çalışan kod yapay zekâ ajanları için kural ve komut referansıdır.

## Proje Özeti

İlaç Takip: çoklu hasta destekli, PIN korumalı ilaç hatırlatma uygulaması.
Offline-first: tüm veri önce localStorage'da tutulur; Firebase Realtime Database sadece
cihazlar arası senkronizasyon için arka planda kullanılır.

## Zorunlu Komutlar

```bash
npm install          # bağımlılıkları kur (postinstall: scripts/copy-icon.cjs çalışır)
npm run build        # build:css (tailwindcss) + build:js (esbuild)
npm run build:css    # tailwindcss -i ./src/tailwind-input.css -o ./www/tailwind.css --minify
npm run build:js     # esbuild app.js --bundle --minify ... --outfile=www/app.bundle.js
npx cap sync android # web asset'lerini native projeye kopyala
cd android && ./gradlew assembleDebug
```

Build çıktıları (`www/tailwind.css`, `www/app.bundle.js`) `.gitignore`'dadır, commit edilmez.

## Kritik Kurallar

1. **Tailwind ASLA CDN'den yüklenmez.** `www/index.html`'de `https://cdn.tailwindcss.com`
   satırı kesinlikle olmayacak. Tailwind v4, `src/tailwind-input.css` üzerinden
   `@tailwindcss/cli` ile build-time'da yerel `www/tailwind.css` dosyasına derlenir.
   `tailwind.config.js` + `@tailwind base/components/utilities` sözdizimi KULLANILMAZ
   (v3 sözdizimi). v4 sözdizimi: `@import "tailwindcss";` + `@theme { ... }` + `@source "..."`.

2. **Uygulama açılışı asla ağ isteğiyle bloke edilmez.** `DOMContentLoaded`'de önce
   localStorage'dan senkron çizim (`hastaListesiniCiz()`), sonra `navigator.onLine` kontrolüyle
   arka planda `senkronizeEt()`. Firebase'e yapılan HER `fetch` çağrısı `AbortController` ile
   en fazla 6 saniye zaman aşımına sahiptir (`firebaseGet`/`firebasePut` içindeki timeout).
   `navigator.onLine` tek başına güvenilir değildir — timeout zorunludur.

3. **Native plugin import'ları aktif kod olarak kalır.** `app.js` en üstünde
   `LocalNotifications`, `App`, `ExactAlarm` import'ları yorum satırına alınmaz.
   Tüm native çağrılar `isNative` (Capacitor.isNativePlatform()) false ise atlanacak şekilde
   `if (!isNative) return;` korumasıyla sarılır. `NATIVE_PLUGINS` sabitindeki referanslar,
   minify sonrası bundle'da plugin adlarının korunmasını sağlar.

4. **`package.json` script'leri eksiksizdir.** Yardımcı dosya oluşturulup script'e
   bağlanmadan bırakılmaz. `build` = `build:css && build:js`; `postinstall` ve `android:icon`
   = `scripts/copy-icon.cjs`.

5. **`www/sw.js`'deki `APP_SHELL` listesi build çıktısıyla birebir eşleşir.**
   `app.bundle.js` (app.js değil) ve `tailwind.css` dahildir. Var olmayan dosya eklenirse
   `caches.addAll()` başarısız olur ve service worker aktive olmaz.

6. **CSS dosya sırası:** `style.css`, `tailwind.css`'ten SONRA yüklenir. Bu yüzden
   `style.css` içinde Tailwind utility'lerini ezecek kurallar yazma. Modal gizleme/gösterme
   için HTML'de `class="modal flex hidden"` kullanılır; `.modal` içinde `display` tanımlanmaz
   (yoksa `hidden` sınıfı çalışmaz — bu, açılışta modalın görünmesine neden olan bilinen hatadır).

7. **Türkçe karakterler:** Tüm kaynak dosyalar UTF-8 olmalıdır. PowerShell veya benzeri
   araçlarla `Get-Content`/`Set-Content` döngüsü yapma — PowerShell 5.1 varsayılan kod sayfası
   UTF-8 dosyayı bozar (mojibake: `Ä°laÃ§`). Dosya düzenleme için UTF-8 koruyan araçları
   kullan; toplu değişimde `[System.IO.File]::ReadAllText/WriteAllText` (UTF8Encoding(false)) tercih et.

## Mimari Notlar

- **Durum:** `hastalar` (localStorage `ilac_takip:hastalar`), seçili hasta, ilaç listesi,
  alındı haritası (`{ilacId}|{tarih}|{saat}` → timestamp), ayarlar.
- **Alarm motoru:** 15 saniyede bir `setInterval` ile `alarmKontrolu()`. Aktif pencere:
  doz saati − önerak (varsayılan 15 dk) ile doz saati + 120 dk. Kuyrukta birden fazla doz
  varsa sırayla gösterilir. Erteleme `ertelenenler` haritasında tutulur.
- **Native bildirimler:** `ilac_takip:noti` anahtarı bildirim ID → doz anahtarı eşlemesini
  tutar. Her CRUD sonrası `nativeDozBildirimleriniKur()` ile bugün + yarın için yeniden kurulur.
- **Firebase:** Rules yalnızca `patients/$patientId` altında okuma/yazmaya izin verir
  (üst düzey `/patients.json` okuması 401 döner). Bu yüzden hasta keşfi bir **kayıt defteri**
  ile yapılır: her hasta CRUD işleminde `firebaseRegistryPush()` → `PUT /patients/__registry__`
  = `{ ids: [...] }` yazar (aynı `$patientId` wildcard'ı altında olduğu için kurallara takılmaz).
  `senkronizeEt()` önce `GET /patients` dener (kurallar genişletilmişse tam liste),
  olmazsa `GET /patients/__registry__` ile ID'leri keşfeder, sonra hasta başına
  `GET /patients/{id}` ile veriyi çeker. Yazma `PUT /patients/{id}` ile yapılır.
  Önerilen kurallar (tam liste okuması için): `{"patients": {".read": true, "$patientId": {".write": true}}}`.
- **Versiyonlar:** Capacitor 8.x (Java 21, Node >= 22 gerekir). `@capacitor/cli`
  devDependencies'tedir. CI: `.github/workflows/build-android.yml`.

## Doğrulama

```bash
npm run build
# www/tailwind.css ve www/app.bundle.js üretildiğini kontrol et
# www/index.html içinde "cdn.tailwindcss.com" geçmemeli
# www/app.bundle.js içinde "registerPlugin", "LocalNotifications", "ExactAlarm" olmalı
# www/sw.js APP_SHELL listesindeki her dosya www/ altında mevcut olmalı
```
