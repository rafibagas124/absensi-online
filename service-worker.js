// ================== SERVICE WORKER - AbsensiPro PWA ==================
// Menyediakan caching app-shell & asset CDN agar aplikasi bisa diinstal & tetap terbuka
// serta berfungsi penuh saat koneksi internet terputus (PWA Offline Mode).

const CACHE_NAME = 'absensipro-cache-v2';

// Berkas inti aplikasi (app shell) yang di-precache saat instalasi
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './i18n.js',
  './protect.js',
  './supabase_client.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// INSTALL: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch((err) => {
        console.warn('Pre-caching partial failure:', err);
      }))
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

// FETCH: Network-first untuk same-origin, Stale-while-revalidate / Cache-first untuk CDN & asset statis
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = req.url.startsWith(self.location.origin);
  const isCdn = url.hostname.includes('jsdelivr.net') || 
                url.hostname.includes('cloudflare.com') || 
                url.hostname.includes('googleapis.com') || 
                url.hostname.includes('gstatic.com');

  if (isCdn) {
    // Cache-first / stale-while-revalidate untuk CDN (face-api models, tailwind, fontawesome, i18next)
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Network-first dengan fallback ke cache untuk dokumen & script lokal
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

