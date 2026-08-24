const APP_SHELL = [
  './',
  './index.html',
  './tailwind.css',
  './style.css',
  './app.bundle.js',
  './manifest.json',
  './alarm.wav',
  './icons/icon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const CACHE_NAME = 'ilac-takip-v1';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var fetchPromise = fetch(event.request).then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
      });
    })
  );
});