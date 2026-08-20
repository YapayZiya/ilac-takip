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
- [x] Full-screen intent ile ekran açma + alarm çalma
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

## Açık Sorunlar
- [x] ~~Android 13+ `POST_NOTIFICATIONS` izni eksik~~ (eklendi)
- [ ] Uygulama öldürüldüğünde exact alarm güvenilirliği
- [ ] OEM bateri optimizasyonu (Xiaomi, Huawei vb.) engellemeleri
- [ ] Release APK + signing yapılandırması
