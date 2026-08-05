// ================== SERVICE WORKER - AbsensiPro PWA ==================
// Menyediakan caching app-shell agar aplikasi bisa diinstal & tetap terbuka
// walau koneksi internet tidak stabil (fitur kamera/GPS tetap butuh koneksi
// untuk model AI face-api.js, tapi antarmuka tetap bisa dimuat dari cache).

const CACHE_NAME = 'absensipro-cache-v1';

// Berkas inti aplikasi (app shell) yang di-precache saat instalasi
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// INSTALL: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: bersihkan cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// FETCH: strategi "network-first, fallback ke cache" untuk app shell same-origin,
// agar user tetap dapat versi terbaru saat online, namun tetap bisa membuka
// aplikasi saat offline/koneksi buruk.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya tangani request GET; biarkan request lain (POST dsb) lewat apa adanya
  if (req.method !== 'GET') return;

  const isSameOrigin = req.url.startsWith(self.location.origin);

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (isSameOrigin && networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
