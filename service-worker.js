// ================== SERVICE WORKER - AbsensiPro PWA ==================
// Menyediakan caching app-shell & asset CDN agar aplikasi bisa diinstal & tetap terbuka
// serta berfungsi penuh saat koneksi internet terputus (PWA Offline Mode).

const CACHE_NAME = 'absensipro-cache-v4';

// Berkas inti aplikasi (app shell) yang di-precache saat instalasi
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './i18n.js',
  './protect.js',
  './security.js',
  './supabase_client.js',
  './face-api.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/i18next@23/dist/umd/i18next.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// INSTALL: precache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' })
            .then((res) => {
              if (res && (res.status === 200 || res.type === 'opaque')) {
                return cache.put(url, res);
              }
            })
            .catch((err) => {
              console.warn('Pre-cache item skipped:', url, err);
            })
        )
      );
    })
  );
});

// ACTIVATE: bersihkan cache versi lama & klaim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Bypass cache untuk realtime database, API auth Supabase, Discord webhook, Telegram API, Sentry ingest
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('discord.com') ||
    url.hostname.includes('api.telegram.org') ||
    url.hostname.includes('ingest.sentry.io') ||
    url.hostname.includes('accounts.google.com')
  ) {
    return;
  }

  // 1. Navigation Request (Buka halaman HTML) -> Network First dengan Fallback ke Cached index.html
  if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(req).then((cached) => cached || caches.match('./index.html') || caches.match('/index.html'));
        })
    );
    return;
  }

  // 2. Static Assets & CDN (Tailwind, FontAwesome, JS SDK, Face-api models, Local JS/CSS/Images)
  // Strategi: Stale-While-Revalidate / Cache-First
  const isCdn =
    url.hostname.includes('tailwindcss.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('cloudflare.com') ||
    url.hostname.includes('sentry-cdn.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com');

  const isSameOriginAsset = req.url.startsWith(self.location.origin);

  if (isCdn || isSameOriginAsset) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Jika network gagal dan tidak ada di cache, jangan return index.html untuk aset js/css
            return cachedResponse || null;
          });

        // Jika sudah ada di cache, langsung kembalikan cache sambil update di background (Stale-While-Revalidate)
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Fallback umum
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req);
    })
  );
});

