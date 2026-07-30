# AbsensiPro - Sistem Presensi Digital Berbasis Web (Multi-Role)

AbsensiPro adalah aplikasi presensi berbasis web yang dirancang untuk mengelola kehadiran sumber daya manusia secara terstruktur. Sistem ini memanfaatkan API bawaan peramban (Web APIs) untuk verifikasi identitas visual dan geolokasi pengguna tanpa memerlukan infrastruktur server backend yang kompleks pada tahap awal pengembangan.

## Arsitektur & Teknologi Utama

- **Frontend Core:** HTML5 & JavaScript (ES6+)
- **UI Framework:** Tailwind CSS (Utilitas Antarmuka Responsif)
- **Klien-Sisi API:** 
  - `MediaDevices API` (`getUserMedia`) untuk integrasi kamera *real-time*.
  - `Geolocation API` untuk verifikasi koordinat lokasi perangkat.
- **Manajemen Sesi & Data:** `localStorage` & `sessionStorage` native untuk persistensi data lokal dan manajemen autentikasi berbasis peran.

## Fitur Akses Berdasarkan Peran

### 1. Modul Karyawan
- **Presensi Masuk & Pulang:** Menggunakan verifikasi kamera langsung dan pencatatan lokasi GPS.
- **Proteksi Logika Presensi Pulang:** Sistem memberlakukan validasi alur di mana absen pulang hanya dapat dilakukan jika pengguna telah mencatatkan absen masuk pada hari yang sama dan telah memenuhi batas minimal jam kerja yang ditentukan (pukul 17:00 WIB).
- **Pengajuan Izin/Sakit:** Formulir digital terintegrasi untuk pendelegasian dokumen pendukung (surat keterangan medis).
- **Kalkulasi Jam Kerja:** Perhitungan durasi akumulatif jam kerja secara otomatis.

### 2. Modul HRD
- **Pemantauan Terpusat:** Dashboard rekapitulasi kehadiran karyawan secara *real-time*.
- **Penyaringan & Laporan:** Fitur filter riwayat berdasarkan rentang tanggal serta fungsi ekspor tampilan siap cetak (*print-ready report*).

### 3. Modul Administrator
- **Manajemen Pengguna:** Kontrol penuh atas otorisasi akun (penambahan, pembaruan, dan penghapusan identitas karyawan).
- **Audit Sesi:** Pengawasan status operasional seluruh akun terdaftar.

## Kredensial Pengujian (Sistem Default)

| Peran Akses | Username / Email | Kata Sandi |
| :--- | :--- | :--- |
| **Karyawan** | `user` / `karyawan@test.com` | `123456` |
| **HRD** | `hrd` / `hrd@test.com` | `123456` |
| **Administrator** | `admin` / `admin@test.com` | `123456` |

## Persyaratan Deploy & Keamanan Akses Perangkat

Untuk memastikan `MediaDevices API` (kamera) dan `Geolocation API` (GPS) dapat berfungsi pada seluruh peramban lintas platform (Android, iOS, macOS, Windows), aplikasi **wajib** di-host menggunakan protokol HTTPS. Lingkungan pengujian seperti Vercel, Netlify, atau GitHub Pages secara otomatis menyediakan sertifikat SSL yang diperlukan.