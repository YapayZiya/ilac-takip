# PROGRESS.md — İlaç Takip Geliştirme Fazları

## Faz 1 — İskelet + Arayüz + PWA
- [x] Capacitor projesi kurulumu
- [x] `index.html` ana ekranlar (hasta seçimi + ilaç listesi)
- [x] Tailwind CSS entegrasyonu
- [x] PWA manifest ve service worker
- [x] Alttan kayan ilaç ekleme paneli
- [x] Ayarlar paneli

## Faz 2 — Hasta Yönetimi + PIN
- [x] Çoklu hasta listesi
- [x] Hasta ekleme / düzenleme / silme
- [x] PIN koruması (4–6 haneli)
- [x] Aktif hasta chip ve geçiş

## Faz 3 — LocalStorage CRUD
- [x] İlaç ekleme, düzenleme, silme
- [x] `ilac_takip:ilac:<pid>` anahtarı ile kişiye özel depolama
- [x] `alindi` (taken) takibi + 14 gün otomatik temizlik
- [x] Ayarlar (önce uyarı dk, erteleme dk) kişiye özel

## Faz 4 — Alarm + Bildirim + Ses
- [x] Web tarafı zaman kontrolü (`setInterval 15 sn`)
- [x] Önce uyarı penceresi + erteleme
- [x] AudioContext bip sesi
- [x] Web Notification API (sayfa açıkken)
- [x] Native LocalNotifications (Capacitor)
- [x] Exact Alarm izni kontrolü + isteme (Android 12+)
- [x] `notiPlanla()` — aktif hasta tüm dozlarını planlar
- [x] Android bildirimlerinde `priority: 4`, `visibility: public`, `vibrationPattern`
- [x] Full-screen intent ile ekran açma + uygulamayı öne getirme
- [x] Alındı işaretinde zaman bilgisi kartta kalıcı gösterimi

## Faz 5 — Veri Yedeği
- [x] Dışa aktarma (JSON + Share API)
- [x] İçe aktarma (JSON + FileReader)
- [x] Hasta + ilaç + alındı + ayarlar tam yedek
- [x] Telefonda `Documents/ilac-takip-yedekler/` klasörüne yedek kaydetme

## Faz 6 — Android APK + CI/CD
- [x] GitHub Actions workflow (debug APK)
- [x] Otomatik izin enjeksiyonu (AndroidManifest)
- [x] APK artifact upload

## Faz 7 — UX İyileştirmeleri
- [x] Ayarlar ekranı geri tuşu ile ana ekrana dönüş
- [x] Uzun listelerde bekleyen ilaçlara otomatik kaydırma
- [x] Gün sonu özet raporu (alındı / atlanan ilaçlar)

## Faz 8 — Firebase Senkronizasyonu ve Offline-First Mimari

### Düzeltmeler:
- [x] **Problem 1 çözüldü**: İlaç alındıysa ilgili native bildirimleri iptal ediliyor. Alarm, ilaç alındı olarak işaretlendikten sonra çalışmıyor.
- [x] **Problem 2 çözüldü**: Gün sonu özet raporu, ilaçlar alındıysa veya saati geçtiğinde gösteriliyor. Atlanan ilaçları da içerir.

### Yeni Özellikler:
- [x] **Offline-First Mimari**: LocalStorage öncelikli, Firebase senkronizasyonu arka planda
- [x] **Firebase Realtime Database Senkronizasyonu**: `fetchFromFirebase()` ile veri çek, `syncToFirebase()` ile push et
- [x] **Firebase yapılandırma sabitlendirildi**: `firebase-config.js` dosyasında sabit API Key ve URL
- [x] **API Key**: `AIzaSyCvwNDuE0QFD6K4OcUhJ-688_-MD9k0Jc8`
- [x] **Database URL**: `https://ilac-takip-da59e-default-rtdb.europe-west1.firebasedatabase.app`

## Açık Sorunlar
- [ ] OEM bateri optimizasyonu (Xiaomi, Huawei vb.) engellemeleri
- [ ] Release APK + signing yapılandırması

## Kararlar ve Notlar

### Firebase Seçimi
Ücretsiz bir sunucu çözümü olarak Firebase Realtime Database seçildi:
- Ücretsiz tier: 100 GB veritabanı, 10k okuma/s, 1k yazma/s
- Gerçek zamanlı senkronizasyon için ideal
- Mobil uygulama entegrasyonu kolaylığı

### Firebase Yapılandırması
- API anahtarları `firebase-config.js` dosyasında sabittir (**gizli değil**)
- Veri yolu: `/patients/{hasta_id}/meds` ve `/patients/{hasta_id}/done`

### Alarm Mantığı Yeniden Düzenlendi
`almIsaretle()` fonksiyonu, ilaç alındı işaretlendikten sonra:
1. Local storage'da `done` kaydını günceller
2. Native bildirimleri iptal eder (eğer varsa)
3. Firebase'e yerel değişikliği gönderir
4. Gün sonu özet kontrolü yapılır

### Gün Sonu Özet Mantığı
Yeni mantık: `hasNotYetDue` kontrolü
- Eğer tüm ilaç saatleri ya alındıysa ya da geçmişse, özet gösterilir
- Bekleyen (hala gelmesi gereken) ilaçlar varsa, özet gösterilmez