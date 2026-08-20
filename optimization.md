# optimization.md — İlaç Takip İyileştirme Önerileri

## 1. Tekrar Eden Kodlar (DRY İhlalleri)

### 1.1 Bildirim nesnesi yapısı tekrarı
- **Durum:** `notiPlanla()` ve `testNotiGonder()` içinde neredeyse aynı bildirim objesi tekrar tekrar tanımlanıyor.
- **Risk:** Sonradan `importance` veya `vibrationPattern` değiştiğinde iki yeri de güncellemek gerekir. Unutulma riski yüksek.
- **Öneri:** `defaultNotificationPayload(med, raw, hedefZaman)` gibi bir yardımcı çıkar. Hem planlayıcı hem test tekrarı kullanır.

### 1.2 `isNative && nativeAktif` guard tekrarı
- **Durum:** `testNotiGonder()`, `debugNotiGoster()`, `debugNotiDurum()` gibi birçok fonksiyon başında aynı guard tekrarlanıyor.
- **Öneri:** `nativeReady()` gibi bir helper döndür veya yüksek seviyede bir `ensureNative()` katmanı ekle.

### 1.3 Tarih/saat hesaplama tekrarı
- **Durum:** `todayStr()`, `parseTime()`, `slotKey()` ve benzeri küçük yardımcılar hem listede hem planlamada hem kontrol motorunda tekrar kullanılıyor.
- **Öneri:** Zaten merkezi yardımcı bölümde var, yeni zaman mantıkları eklenecekse mutlaka oraya ekle.

### 1.4 Hata mesajı ve toast tekrarı
- **Durum:** `toast('Bildirimler planlanamadı: ...')`, `toast('Paylaşım başarısız: ...')` gibi mesajlar birkaç yerde kopyalanıyor.
- **Öneri:** `messages.js` benzeri küçük bir constants objesi ile tek seferde tanımla.

## 2. Kullanılmayan / Ölü Kodlar

### 2.1 `saatDM` kullanılmıyor
- **Konum:** `app.js:32`
- **Durum:** Tanımlanmış ama hiçbir yerde çağrılmıyor.
- **Öneri:** Kaldır veya ilerde UI’de zaman formatlama olarak kullan.

### 2.2 `$$` kullanılmıyor
- **Konum:** `app.js:25`
- **Durum:** `querySelectorAll` wrapper tanımlı ama proje boyunca hiç kullanılmıyor.
- **Öneri:** `$` dışında çoklu seçiciye ihtiyacın yoksa kaldır.

### 2.3 `res/ic_stat_notify.xml` alternatif ikonlar
- **Konum:** `res/ic_stat_notify.xml`
- **Durum:** Sadece bir adet statik ikon var. Eğer `ic_notification` gibi başka isimlerle kaynak olsa da kullanılmıyorsa fazladır.
- **Öneri:** Kullanılmayan Android drawable/vector dosyalarını temizle.

### 2.4 `pruneDone` gün sonu kontrolü eksikliği
- **Konum:** `app.js:104`
- **Durum:** `pruneDone()` tanımlı ve `ilacAlindi()` içinde çağrılıyor, ancak `veriIcce()` içe aktarma sonrası çalıştırılmıyor.
- **Öneri:** İçe aktarma sonrası da `pruneDone()` çağrısı ekle ki eski alınma kayıtları birikmesin.

## 3. Gereksiz Bağımlılıklar

### 3.1 `@capacitor/share` sadece yedekleme için
- **Durum:** Sadece `veriDisa()` içinde kullanılıyor.
- **Alternatif:** Web tarafında zaten `navigator.share` var. Native’de `Share` kapalı olsa da dosya URI’si ile share çalışıyor.
- **Öneri:** Paylaşım akışı sadece bir yerde kullanılıyorsa, kullanıcıya alternatif sunmak için bağımlılığı kaldırıp sadece web fallback bırakılabilir. Ancak native paylaşım kalitesi için şimdilik tutmak daha iyi.

### 3.2 `esbuild` alternatifi yok
- **Durum:** Proje zaten esbuild kullanıyor, bu uygun.
- **Öneri:** Geliştirme sürecinde kaynak haritası (`sourcemap`) eklenebilir. Şu an minify + bundle çalışıyor ama debug için sourcemap kapatılmış olabilir. Gerekirse `--sourcemap` ekle.

## 4. Performans Darboğazları

### 4.1 `listeyiCiz()` her seferinde tüm listeyi yeniden oluşturuyor
- **Konum:** `app.js:427+`
- **Sorun:** İlaç ekleme, silme, alma işlemlerinde tüm kartlar DOM’dan silinip yeniden ekleniyor. Kullanıcı 50+ ilaç varsa bu hissi yavaşlatabilir.
- **Öneri:** Diff tabanlı güncelleme veya en azından `innerHTML` yerine daha küçük DOM patch kullan. Basit yaklaşım: sadece değişen kartı güncelle, tüm listeyi resetleme.

### 4.2 `notiPlanla()` her değişiklikte `cancelAll()` yerine tek tek iptal
- **Konum:** `app.js:266+`
- **Sorun:** Eskiden `cancelAll()` çalışmıyordu, şimdi ID listesi üzerinden tek tek iptal ediliyor. Çok sayıda bildirim varsa bu yavaş olabilir.
- **Öneri:** İptal edilecek ID listesini optimize et. `prevIds` kümesi ile `fresh` kümesi karşılaştırılıp sadece farklı olanları iptal et.

### 4.3 `kontrol()` 15 sn’de tüm ilaçları ve tüm zamanları tarıyor
- **Konum:** `app.js:522+`
- **Sorun:** Her 15 saniyede tüm ilaçlar + tüm zamanlar + `done`/`alerted`/`deferred` kontrolü yapılıyor.
- **Öneri:** Sabit küçük veri seti için sorun değil, ama ilaç sayısı artarsa sadece bir sonraki zamanı hesaplayan bir sıralı veri yapısı kullanılabilir. Şimdilik optimize edilmesine gerek yok.

### 4.4 `Date.now()` ve `new Date()` tekrar tekrar oluşturuluyor
- **Sorun:** `kontrol()`, `notiPlanla()`, `listeyiCiz()` içinde tekrar tekrar `new Date()` çağrıları var.
- **Öneri:** `kontrol()` ve zaman odaklı fonksiyonlarda tekrar eden `new Date()` çağrılarını azaltmak için `now` değişkenini daha yüksek seviyede tanımla.

## 5. Kod Bakımı / Okunabilirlik

### 5.1 `app.js` tek dosya halinde çok büyük
- **Öneri:** Mantıksal bölümleri modüllere ayır:
  - `storage.js` — localStorage erişimi
  - `notifications.js` — native bildirim + planlama
  - `patients.js` — hasta CRUD
  - `ui.js` — kart çizimi, panel aç/kapa
  - Ana dosya import edip orchestrate etsin.

### 5.2 Debug loglarını opsiyonel yap
- **Durum:** `console.log('🔔 ALARM PLANLANDI: ...')` gibi loglar production’da da çalışıyor.
- **Öneri:** `DEBUG` flag’i ile koşullu log ekle. Veya logları bir ayrı fonksiyona taşı ve production’da kapat.

### 5.3 `kontrol()` içindeki `queue.push` sonrası `kuyruguIsle()` çağrısı
- **Sorun:** 15 sn’de bir alarm varsa `modalGoster()` tekrar tekrar çalışabilir.
- **Öneri:** Zaten `currentDue` kontrolü var, bu kısım şu an korunuyor. Ek bir flag ile gereksiz tekrar önlenebilir.

## 6. Güvenlik / Kenar Durumlar

### 6.1 `slug()` ve `esc()` güvenliği
- **Durum:** XSS önleme için `esc()` var, bu iyi.
- **Risk:** `slug()` ile dosya adı üretilirken `aktifHasta.ad` boş/undefined ise varsayılan `ilac` kullanılıyor. Bu kabul edilebilir.

### 6.2 `readJSON` fallback kullanımı
- **Sorun:** `readJSON` fallback olarak `undefined` dönerse bazı fonksiyonlar `Array.isArray` kontrolü yapıyor, bazıları yapmıyor.
- **Öneri:** Tüm `readJSON` kullanımlarında güvenli fallback sağla.

## Özet Öncelikler
1. Bildirim objesi factory çıkar — DRY
2. `$$` ve `saatDM` ölü kodları kaldır
3. `pruneDone()` içe aktarma sonrası da çalıştır
4. `listeyiCiz()` DOM’u her seferinde resetleme, diff patch’e geç
5. `notiPlanla()` iptal listesini optimize et
6. Debug logları `DEBUG` bayrağıyla opsiyonel yap
