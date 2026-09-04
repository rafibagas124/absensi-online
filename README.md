# AbsensiPro

AbsensiPro adalah aplikasi presensi karyawan berbasis web dan Progressive Web App (PWA). Aplikasi mendukung multi-perusahaan (multi-tenant), beberapa peran pengguna, verifikasi wajah, geofencing lokasi kantor, pengaturan shift, pengajuan izin, dan notifikasi pengingat shift.

## Teknologi

- HTML5, JavaScript ES Module, dan CSS hasil kompilasi Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security (RLS), Realtime, dan Storage
- `face-api.js` untuk deteksi wajah dan liveness check di browser
- MediaDevices API untuk kamera dan Geolocation API untuk lokasi
- Service Worker, Web Push, dan Web App Manifest untuk fitur PWA
- Vercel Functions di `api/` untuk subscription dan scheduler push
- Node.js 18 atau lebih baru untuk proses build

## Fitur Utama

- Registrasi perusahaan dan akun admin pertama
- Login menggunakan kode perusahaan, email/username, dan password
- Role `admin`, `hrd`, `staff`/`karyawan`, dan `magang`
- Absen masuk dan pulang dengan foto wajah, liveness check, GPS, dan validasi radius kantor
- Dukungan shift pagi, siang, dan malam, termasuk toleransi serta pengingat shift
- Dashboard HRD/admin, manajemen karyawan, lokasi kantor, konfigurasi shift, dan rekap presensi
- Pengajuan cuti/izin/sakit beserta dokumen pendukung
- Riwayat presensi, filter laporan, dan tampilan siap cetak
- Mode antrean/offline terbatas menggunakan cache browser, lalu sinkronisasi ketika koneksi tersedia
- Bahasa Indonesia dan Inggris melalui i18next

## Prasyarat

- Node.js `>=18`
- Project Supabase aktif
- Browser modern dengan akses kamera, lokasi, dan notifikasi bila fitur tersebut digunakan
- HTTPS untuk production dan untuk mengaktifkan kamera/geolokasi pada sebagian besar browser

## Menjalankan Secara Lokal

1. Install dependency:

  ```bash
  npm install
  ```

2. Buat file `.env` di root project. File ini dibaca oleh `build.js` dan tidak boleh di-commit:

  ```env
  SUPABASE_URL=https://project-ref.supabase.co
  SUPABASE_ANON_KEY=your-publishable-or-anon-key
  ```

3. Terapkan schema Supabase secara berurutan sesuai kebutuhan:

  - `supabase_schema.sql` untuk schema utama
  - file di `migrations/` untuk perubahan setelah schema utama
  - `Schema security patch.sql` dan `Schema multi-tenant patch.sql` bila instalasi memakai schema lama

  Jalankan SQL tersebut di Supabase SQL Editor dan pastikan RLS aktif sebelum aplikasi digunakan.

4. Buat bundle production:

  ```bash
  npm run build
  ```

  Perintah ini membersihkan `dist/`, menyalin asset, menyalin model face recognition, lalu meng-obfuscate JavaScript. Hasil deploy berada di `dist/`.

Untuk preview lokal yang membutuhkan HTTPS, gunakan server development HTTPS atau deploy preview. Membuka `index.html` langsung dengan skema `file://` tidak cocok untuk kamera, geolokasi, service worker, dan request Supabase.

## Deployment ke Vercel

1. Hubungkan repository ke Vercel.
2. Set environment variable berikut pada Vercel Project Settings:

  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` untuk Web Push
  - `CRON_SECRET` untuk mengamankan endpoint scheduler

3. Vercel memakai `npm run build` dan mempublikasikan folder `dist/` sesuai `vercel.json`.

Jangan menaruh `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, atau `CRON_SECRET` di JavaScript frontend. `SUPABASE_ANON_KEY` memang digunakan oleh browser, tetapi akses datanya tetap harus dilindungi oleh RLS.

## Scheduler Web Push

Endpoint `api/push-cron.js` memproses pengingat push yang tertunda. Untuk Vercel Hobby, endpoint dapat dipanggil oleh GitHub Actions setiap beberapa menit.

Set secret repository berikut pada GitHub Actions:

```text
PUSH_CRON_URL=https://domain-anda.vercel.app/api/push-cron
CRON_SECRET=nilai-rahasia-yang-sama-dengan-di-vercel
```

Endpoint subscription yang digunakan aplikasi adalah `api/push-subscribe.js`. Pengguna harus memberikan izin notifikasi di browser agar subscription dapat dibuat.

## Struktur Penting

```text
index.html             UI utama dan shell PWA
app.js                 alur UI, kamera, GPS, shift, dan dashboard
supabase_client.js     Auth, query database, storage, dan sinkronisasi Supabase
service-worker.js      cache PWA dan dukungan push
models/                model face-api.js
api/                   endpoint Vercel untuk Web Push
migrations/            migrasi schema Supabase
build.js               build dan obfuscation ke dist/
dist/                  output build, tidak diedit langsung
```

## Backend PHP Lama

`auth.php`, `absen_submit.php`, `office_locations.php`, dan `config.php` adalah jalur backend MySQL/PHP yang masih disimpan untuk kompatibilitas atau migrasi. Jalur frontend saat ini menggunakan Supabase melalui `supabase_client.js`. Jangan mengaktifkan kedua jalur sebagai sumber data utama secara bersamaan tanpa menyesuaikan autentikasi, schema, dan aturan aksesnya.

Jika jalur PHP digunakan, isi konfigurasi server melalui environment variable `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `RESEND_API_KEY`, dan `RESEND_FROM`, lalu sesuaikan daftar `ALLOWED_ORIGINS` di `config.php`. Secret backend hanya boleh berada di server.

## Keamanan Operasional

- Aktifkan dan uji RLS untuk seluruh tabel tenant.
- Gunakan password minimal 8 karakter dan akun terpisah untuk setiap pengguna.
- Batasi domain yang diizinkan untuk OAuth, CORS, dan Supabase Auth.
- Gunakan HTTPS pada production.
- Jangan commit `.env`, service role key, private VAPID key, atau secret scheduler.
- Ganti kredensial dan key contoh sebelum aplikasi dipakai sungguhan.