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

## Faz 8 — Hata Düzeltmeleri ve Yeni Özellikler

### Düzeltmeler:
- [x] **Problem 1 çözüldü**: İlaç alındıysa ilgili native bildirimleri iptal ediliyor. Alarm, ilaç alındı olarak işaretlendikten sonra çalışmıyor.
- [x] **Problem 2 çözüldü**: Gün sonu özet raporu, ilaçlar alındıysa veya saati geçtiğinde gösteriliyor. Atlanan ilaçları da içerir.

### Yeni Özellikler:
- [x] **Firebase Realtime Database Senkronizasyonu**: Aile üyeleri uygulamayı açtıkça ilaç durumlarını gerçek zamanlı görüyor
- [x] **REST API tabanlı senkronizasyon**: Firebase SDK yerine, daha hafif REST API kullanımı
- [x] **Firebase yapılandırma UI**: Ayarlar paneline Firebase yapılandırma seçeneği eklendi
- [x] **30 saniyelik polling**: Gerçek zamanlı senkronizasyon için periyodik veri senkronizasyonu

## Açık Sorunlar
- [ ] OEM bateri optimizasyonu (Xiaomi, Huawei vb.) engellemeleri
- [ ] Release APK + signing yapılandırması

## Kararlar ve Notlar

### Firebase Seçimi
Ücretsiz bir sunucu çözümü olarak Firebase Realtime Database seçildi:
- Ücretsiz tier: 100 GB veritabanı, 10k okuma/s, 1k yazma/s
- Gerçek zamanlı senkronizasyon için ideal
- Mobil uygulama entegrasyonu kolaylığı

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