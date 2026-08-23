/* ===========================================================
   İLAÇ TAKİP — Service Worker (PWA / çevrimdışı)
   Adım 1: iskelet. Uygulama kabuğunu (app shell) önbelleğe alır.
   =========================================================== */
const CACHE = 'ilac-takip-v2';
const APP_SHELL = [
  './',
  'index.html',
  'app.bundle.js',
  'style.css',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Kurulum: uygulama kabuğunu önbelleğe al
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Etkinleştirme: eski önbellekleri temizle
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// İstek: önce önbellek, sonra ağ (önbelleğe-first)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        const url = new URL(e.request.url);
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
