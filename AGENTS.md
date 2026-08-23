# AGENTS.md

Bu dosya, bu projede çalışan kod yapay zekâ ajanları için kural ve komut referansıdır.
Projede değişiklik yapmadan önce tamamını okuyun.

## Proje Özeti

**İlaç Takip** — çoklu hasta destekli, PIN korumalı ilaç hatırlatma uygulaması.
Hem tarayıcıda PWA hem de Capacitor ile paketlenmiş native Android APK olarak çalışır.

**Mimari ilke: offline-first.** Uygulama açılışı hiçbir zaman ağa bağımlı değildir:
tüm veri önce localStorage'da tutulur; Firebase Realtime Database sadece cihazlar arası
senkronizasyon için arka planda (bloklamadan) kullanılır.

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Arayüz mantığı | Vanilla JavaScript (ES2019), tek dosya `app.js`, esbuild ile `www/app.bundle.js` |
| Stil | Tailwind CSS v4, build-time'da yerel `www/tailwind.css`'e derlenir — CDN yok |
| Depolama | localStorage (birincil), Firebase RTDB REST API (senkronizasyon) |
| Native paketleme | Capacitor 8.x (Java 21, Node >= 22, Gradle 8.14 / AGP 8.13) |
| Bildirimler | `@capacitor/local-notifications` (sürüm 8.x) |
| Uygulama yaşam döngüsü | `@capacitor/app` |
| Tam zamanlı alarm | Özel plugin `@ilac/exact-alarm` (Android 12+ `SCHEDULE_EXACT_ALARM`) |
| Build | esbuild (JS) + `@tailwindcss/cli` (CSS) + Gradle + GitHub Actions |
| CI | `.github/workflows/build-android.yml` (Node 22, JDK 21) |

## Zorunlu Komutlar

```bash
npm install          # bağımlılıkları kur (postinstall: scripts/copy-icon.cjs çalışır)
npm run build        # build:css (tailwindcss) + build:js (esbuild)
npm run build:css    # tailwindcss -i ./src/tailwind-input.css -o ./www/tailwind.css --minify
npm run build:js     # esbuild app.js --bundle --minify ... --outfile=www/app.bundle.js
npx cap sync android # web asset'lerini native projeye kopyala
cd android && ./gradlew assembleDebug
```

Build çıktıları (`www/tailwind.css`, `www/app.bundle.js`, `package-lock.json`) `.gitignore`'dadır,
commit edilmez. `android/` klasörü de gitignore'dadır (CI'da `npx cap add android` ile üretilir).

## Kritik Kurallar (tarihteki gerçek hatalardan çıkarılmıştır)

1. **Tailwind ASLA CDN'den yüklenmez.** `www/index.html`'de `https://cdn.tailwindcss.com`
   satırı kesinlikle olmayacak. Tailwind v4, `src/tailwind-input.css` üzerinden
   `@tailwindcss/cli` ile build-time'da yerel `www/tailwind.css` dosyasına derlenir.
   v3 sözdizimi (`tailwind.config.js` + `@tailwind base/components/utilities`) KULLANILMAZ.
   v4 sözdizimi: `@import "tailwindcss";` + `@theme { ... }` + `@source "..."`.
   Build komutu doğrudan `tailwindcss` CLI çalıştırır; `tailwindcss` paketini Node API'siyle
   çağırmayın (v4'te bu API yok, script çöker).

2. **Uygulama açılışı asla ağ isteğiyle bloke edilmez.** `DOMContentLoaded`'de önce
   localStorage'dan SENKRON çizim yapılır, sonra arka planda senkronizasyon başlatılır.
   Firebase'e yapılan HER `fetch` çağrısı `AbortController` ile en fazla 6 saniye zaman
   aşımına sahiptir (`firebaseGet`/`firebasePut`). `navigator.onLine` tek başına güvenilir
   değildir — timeout zorunludur.

3. **Native plugin import'ları aktif kod olarak kalır.** `app.js` en üstünde
   `LocalNotifications`, `App`, `ExactAlarm` (ve `Capacitor`) import satırları asla yorum
   satırına alınmaz. Tüm native çağrılar `isNative` false ise `if (!isNative) return;`
   korumasıyla atlanır. `NATIVE_PLUGINS` sabiti, minify sonrası bundle'da plugin adlarının
   korunmasını sağlar (grep doğrulaması bundan geçer).

4. **`package.json` script'leri eksiksizdir.** Yardımcı dosya oluşturulup script'e
   bağlanmadan bırakılmaz. `@capacitor/cli` devDependencies'te OLMALIDIR (yoksa
   `npx cap` çalışmaz — gerçek CI hatası).

5. **`www/sw.js`'deki `APP_SHELL` listesi build çıktısıyla birebir eşleşir.**
   `app.bundle.js` (app.js değil) ve `tailwind.css` dahildir. Var olmayan dosya eklenirse
   `caches.addAll()` başarısız olur ve service worker aktive olmaz.

6. **CSS dosya sırası:** `style.css`, `tailwind.css`'ten SONRA yüklenir. Bu yüzden
   `style.css` içinde Tailwind utility'lerini ezecek kurallar yazılmaz. Modal gizleme/gösterme
   için HTML'de `class="modal flex hidden"` kullanılır; `.modal` kuralında `display` tanımlanmaz
   (tanımlanırsa `hidden` sınıfı ezilir ve açılışta tüm modallar görünür — gerçek hata).

7. **Türkçe karakterler:** Tüm kaynak dosyalar UTF-8 olmalıdır. PowerShell 5.1'in
   `Get-Content`/`Set-Content` döngüsü UTF-8 dosyayı bozar (mojibake: `Ä°laÃ§`). Dosya
   düzenleme için UTF-8 koruyan araçları kullanın (Edit/Write araçları, ya da
   `[System.IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding(false)`).

8. **Java sürümü:** `@capacitor/android` modülü Java 21 hedefler (`sourceCompatibility
   VERSION_21`). Android Gradle build için JDK 21 gerekir (JDK 17 → "invalid source release: 21").

## Dosya Yapısı

```
ilac-takip/
├── app.js                    # Ana uygulama mantığı (tek dosya, esbuild ile bundle)
├── firebase-config.js        # DB_URL + API_KEY sabitleri
├── src/
│   └── tailwind-input.css    # Tailwind v4 giriş dosyası (@theme + @source)
├── www/                      # webDir — Capacitor ve statik sunucu buradan servis eder
│   ├── index.html            # 3 ekran + 7 modal (hasta, pin, hasta paneli, raporlar)
│   ├── style.css             # Özel/animasyon stilleri (tailwind.css'ten SONRA yüklenir)
│   ├── manifest.json         # PWA manifest (Türkçe)
│   ├── sw.js                 # Service worker (APP_SHELL önbelleği)
│   ├── tailwind.css          # BUILD ÇIKTISI
│   ├── app.bundle.js         # BUILD ÇIKTISI
│   └── icons/                # postinstall'da scripts/copy-icon.cjs üretir
├── plugins/
│   └── exact-alarm/          # Özel Capacitor plugin (JS + Android Java)
│       ├── index.js          # registerPlugin('ExactAlarm')
│       ├── package.json      # capacitor.android.src → android
│       └── android/          # build.gradle (Java 21) + ExactAlarmPlugin.java
├── scripts/
│   └── copy-icon.cjs         # PNG ikon üretici (postinstall + android:icon)
├── .github/workflows/
│   └── build-android.yml     # CI: build → cap add/sync → izin enjeksiyonu → APK
├── capacitor.config.json     # appId com.ilac.takip, webDir www
└── package.json
```

## Veri Modeli

### localStorage anahtarları

```
ilac_takip:hastalar           → [{ id, ad, pin }]
ilac_takip:aktif              → hasta id (string)
ilac_takip:ilac:{hastaId}     → [{ id, ad, doz, times: ["09:00","20:00"], updatedAt }]
ilac_takip:alindi:{hastaId}   → { "{ilacId}|{YYYY-MM-DD}|{saat}": timestamp }
ilac_takip:ayar:{hastaId}     → { onerakDk: 15, erteleDk: 5, duzenButonlari: false }
ilac_takip:rapor:{hastaId}    → { "YYYY-MM-DD": { planlanan, alinan, geciken, detay: [{ilac, saat, alindi, alindiSaat}] } } (son 7 gün)
ilac_takip:noti               → { [bildirimId]: "{ilacId}|{tarih}|{saat}" } (native eşleme)
ilac_takip:ozet:{hastaId}     → son gösterilen özet tarihi
ilac_takip:exact-asked        → tam zamanlı alarm izni istendi mi (flag)
ilac_takip:battery-asked      → pil optimizasyonu muafiyeti istendi mi (flag)
```

`duzenButonlari` (varsayılan `false`): ilaç kartlarında Düzenle/Sil butonlarının gösterilip
gösterilmeyeceğini kontrol eder — Ayarlar panelindeki checkbox ile değiştirilir.
`ilac_takip:rapor:{hastaId}`: gün sonu raporları; kayıt sırasında 7 günden eski kayıtlar
silinir (tarih anahtarları `YYYY-MM-DD` string karşılaştırmasıyla kesilir).

### Firebase Realtime Database

```
patients/
  {hastaId}/
    ad, pin
    meds: [ { id, ad, doz, times, updatedAt }, ... ]
    done: { "{ilacId}|{tarih}|{saat}": timestamp, ... }
  __registry__/              ← kayıt defteri (hasta keşfi için)
    ids: [ "{hastaId}", ... ]
```

`DB_URL` = `https://ilac-takip-da59e-default-rtdb.europe-west1.firebasedatabase.app`
`API_KEY` = `AIzaSyCvwNDuE0QFD6K4OcUhJ-688_-MD9k0Jc8`

## Mimari Akışlar

### Açılış (DOMContentLoaded)
1. `hastaListesiniCiz()` — localStorage'dan SENKRON çizim (asla boş/donuk ekran olmaz)
2. `gosterEkran('ekran-hastalar')`
3. Olay bağlama, native geri tuşu, service worker kaydı
4. `navigator.onLine` ise `senkronizeEt()` arka planda (timeout'lu, catch'li)

### Hasta paneli açılışı
1. `hastaPaneliAc(hastaId)` — hasta verilerini yükle, ekranı göster
2. `ilacKartlariniCiz()` — günün dozlarını durum bazlı kartlar halinde çiz
3. `kalanIlacaKaydir()` — bekleyen/gecikmiş ilk karta otomatik kaydır
4. `alarmKontrolu()` — anlık alarm kontrolü
5. `gunSonuKontrol()` — tüm dozlar alındıysa gün sonu özetini göster

### Gün sonu raporları
- `gunSonuKontrol()`: son doz alındığında tetiklenir; `gunSonuRaporuKaydet()` ile
  saklanır, `modal-ozet` gösterilir
- `gunSonuRaporuKaydet()`: `ilac_takip:rapor:{hastaId}` altına günün raporunu yazar
  (planlanan, alınan, geciken, detay listesi); 7 günden eski raporları temizler
- `raporlariGoster()`: hasta başlığındaki 📊 butonu ile son 7 günün raporlarını
  `modal-raporlar`'da listeler

### Senkronizasyon (senkronizeEt)
Kural: Firebase kuralları yalnızca `patients/$patientId` altında okuma/yazmaya izin verir;
üst düzey `/patients.json` okuması 401 döner. Bu yüzden:
1. `GET /patients` dene (kurallar genişletilmişse tam liste; yoksa 401 → null)
2. Olmazsa `GET /patients/__registry__` ile ID'leri keşfet
3. Yerel listedeki hastaları da ekle
4. Hasta başına `GET /patients/{id}` çek → `bulguyuBirlestir()` ile birleştir
5. Değişiklik varsa kaydet, `firebaseRegistryPush()`, yeniden çiz

Her CRUD sonrası `firebasePushHasta(hastaId)` → `PUT /patients/{hastaId}` (meds + done dahil).
Fonksiyon `async`'tir ve `firebasePut` sonucunu döndürür; çağıranlar (alındı işaretleme, ilaç
kaydetme/silme) başarı/başarısızlığa göre toast gösterir.
`firebaseRegistryPush()` → `PUT /patients/__registry__` = `{ ids: [...] }`.
Önerilen kurallar (tam liste okuması için): `{"patients": {".read": true, "$patientId": {".write": true}}}`.

### Alarm motoru (web tarafı)
- `setInterval(..., 15000)` ile `alarmKontrolu()`
- Aktif pencere: doz saati − önerak (varsayılan 15 dk) ile doz saati + 120 dk
- Aktif penceredeki, alınmamış, ertelenmemiş dozlar `alarmKuyrugu`'na eklenir, sırayla gösterilir
- Modal + Web Audio bip (iki notalık) + tarayıcı bildirimi
- Erteleme: `ertelenenler` haritasında `{key: timestamp}`; süre dolunca tekrar uyarır
- `alarmAcikKey` tek seferde tek alarm gösterilmesini garantiler

### Native bildirimler (Capacitor)
- `ilac_takip:noti` haritası bildirim ID → doz anahtarı eşlemesi tutar
- Her CRUD/alındı sonrası `nativeDozBildirimleriniKur()` ile bugün + yarın yeniden kurulur
- `registerActionTypes` → "Alındı ✓" aksiyonu; `localNotificationActionPerformed` dinleyicisi
  bildirimden direkt `ilacAlindi()` çağırır
- `ExactAlarm.canScheduleExactAlarms()` → izin yoksa settings'e yönlendir
- İzin istekleri (POST_NOTIFICATIONS, exact alarm, pil optimizasyonu) birer kez yapılır

### Durum yönetimi
`hastalar` (global dizi) + aktif hasta/ilaçlar/alındı/ayarlar bellek değişkenlerinde tutulur,
her değişiklikte localStorage'a yazılır. Ekran geçişleri `gosterEkran(id)`; modallar
`modalAc/ModalKapat` (classList hidden ekle/kaldır).

İlaç kartları `data-durum` attribute'u taşır (`alindi`, `bekliyor`, `yakin`, `gecikti`, `gecti`);
`kalanIlacaKaydir()` bunu kullanarak bekleyen ilk karta kayar. Kart altındaki Düzenle/Sil
butonları yalnızca `ayarlar.duzenButonlari === true` ise render edilir.

## Hata Kılavuzu (daha önce yaşandı)

- **Açılışta "Evet, Sil"/"Vazgeç" modalı görünüyor** → `.modal` içinde `display` tanımlandı
  ve `hidden` sınıfını ezip modalı görünür yaptı. Çözüm: Kural 6.
- **Türkçe karakterler bozuk (Ä°laÃ§)** → PowerShell 5.1 ile UTF-8 dosyaya yazım.
  Çözüm: Kural 7. Dosyaları UTF-8 doğrulamak için `[System.IO.File]::ReadAllText` ile
  `İlaç` (U+0130) karakterini ara.
- **`npx cap` çalışmıyor** → `@capacitor/cli` eksik. Kural 4.
- **Gradle: invalid source release 21** → JDK 21 gerekli. Kural 8.
- **Firebase'te veri var ama açılışta "Henüz hasta yok"** → kurallar liste okumasına izin
  vermiyor; hasta keşfi kayıt defteri (`__registry__`) ile yapılır. Mevcut verilerin defterde
  görünmesi için kuralların genişletilmesi veya verinin olduğu cihazda uygulamanın bir kez
  açılıp defteri oluşturması gerekir.

## Doğrulama

```bash
npm run build
# 1. www/tailwind.css ve www/app.bundle.js üretildiğini kontrol et
# 2. www/index.html içinde "cdn.tailwindcss.com" geçmemeli (count = 0)
# 3. www/app.bundle.js içinde "registerPlugin", "LocalNotifications", "App", "ExactAlarm" olmalı
# 4. www/sw.js APP_SHELL listesindeki her dosya www/ altında mevcut olmalı
# 5. www/index.html ve app.js Türkçe karakterler düzgün (mojibake yok)
# 6. npm run build:css çıktısı brand renklerini içermeli (bg-brand-600 vb.)
```
