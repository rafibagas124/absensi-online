/**
 * i18n.js — Sistem multi-bahasa AbsensiPro (i18next)
 * ---------------------------------------------------
 * Pendekatan: dictionary dikunci oleh TEKS SUMBER Bahasa Indonesia
 * (keySeparator:false, nsSeparator:false) — pola resmi & umum dipakai
 * i18next untuk menambahkan i18n ke aplikasi yang sudah jadi tanpa
 * perlu menulis ulang seluruh markup dengan key abstrak (t('some.key')).
 *
 * - ISO 639-1 yang didukung: "id" (Bahasa Indonesia) & "en" (English).
 * - Deteksi otomatis: localStorage (pilihan manual user) > bahasa perangkat
 *   (navigator.language) > fallback "id".
 * - Semua teks statis di index.html otomatis diterjemahkan lewat DOM walker
 *   (translateStaticDOM). Semua teks dinamis yang dibuat oleh app.js
 *   (alert, badge, label kalender, dst) tinggal dibungkus fungsi global t().
 * - Format tanggal/angka ikut locale aktif (id-ID / en-US) lewat helper
 *   appLocale() yang dipakai ulang di app.js.
 */
(function (global) {
    'use strict';

    // ===================== 1. KAMUS TERJEMAHAN (EN) =====================
    // Key = teks sumber persis (Bahasa Indonesia). Value = terjemahan Inggris.
    // Tambahkan entri baru kapan pun ada teks baru yang perlu diterjemahkan.
    const EN = {
        // --- Umum / navigasi ---
        "Masuk akun": "Sign in",
        "Email": "Email",
        "Password": "Password",
        "Masukkan password": "Enter your password",
        "Ingat Saya": "Remember me",
        "Lupa password?": "Forgot password?",
        "Masuk sekarang": "Sign in now",
        "atau": "or",
        "Lanjutkan dengan Google": "Continue with Google",
        "Belum punya akun?": "Don't have an account?",
        "Daftar disini": "Sign up here",
        "Akun Demo (Password: 123456):": "Demo Accounts (Password: 123456):",
        "Presensi wajah AI, GPS, & manajemen shift dalam satu sistem.": "AI face attendance, GPS, & shift management in one system.",
        "AI Face Verification Ready": "AI Face Verification Ready",
        "Kembali": "Back",
        "Lanjutkan": "Continue",
        "Simpan": "Save",
        "Batal": "Cancel",

        // --- Login form ---
        "Kode Perusahaan": "Company Code",
        "Kode ini didapat saat admin mendaftarkan perusahaan Anda.": "This code is provided when your admin registers the company.",
        "Belum punya akun perusahaan?": "Don't have a company account yet?",
        "Login sekarang tersimpan di server (bukan lagi di browser), jadi akun yang sama bisa dipakai login dari perangkat manapun.": "Login is now stored on the server (not the browser), so the same account can be used from any device.",
        "Isi email terlebih dahulu.": "Please fill in your email first.",

        // --- Sidebar ---
        "Presensi Saya": "My Attendance",
        "Panel Kontrol": "Control Panel",
        "Verifikasi Surat": "Verify Documents",
        "Master Data": "Master Data",
        "Jam Kerja / Shift": "Working Hours / Shift",
        "Staff": "Staff",
        "Lokasi Kantor": "Office Location",
        "Kalender Izin": "Leave Calendar",
        "Permintaan Password": "Password Requests",
        "Logout": "Logout",
        "Nama User": "User Name",
        "Role": "Role",

        // --- Halaman Presensi Saya (staff) ---
        "Presensi Wajah & GPS": "Face & GPS Attendance",
        "Masa Kerja:": "Tenure:",
        "Jam Masuk:": "Clock-in:",
        "Min. Pulang:": "Min. clock-out:",
        "Shift:": "Shift:",
        "Kamera Absensi": "Attendance Camera",
        'Kamera belum dibuka. Klik tombol "Buka Kamera" di bawah.': 'Camera not started yet. Click "Open Camera" below.',
        "Sistem AI akan memindai wajah, oklusi (wajah tertutup), dan kondisi cahaya secara live sebelum absen bisa dikirim.": "The AI system scans your face, occlusion (covered face), and lighting live before check-in/out can be submitted.",
        "Buka Kamera": "Open Camera",
        "Matikan Kamera": "Close Camera",
        "Ambil Lokasi": "Get Location",
        "Input Manual": "Manual Input",
        "Absen Masuk": "Clock In",
        "Absen Pulang": "Clock Out",
        "Input Koordinat GPS Manual": "Manual GPS Coordinate Input",
        "Gunakan opsi ini jika GPS otomatis tidak berfungsi atau sinyal lemah. Jarak ke kantor tetap dihitung & divalidasi seperti biasa, sehingga koordinat yang jauh dari kantor akan tetap terdeteksi dan ditolak.": "Use this option if automatic GPS fails or the signal is weak. Distance to the office is still calculated & validated as usual, so coordinates far from the office will still be detected and rejected.",
        "Latitude": "Latitude",
        "Longitude": "Longitude",
        "Gunakan Koordinat Ini": "Use This Coordinate",
        "Alamat Real-Time (GPS):": "Real-Time Address (GPS):",
        'Klik tombol "Ambil Lokasi" untuk mendapatkan koordinat GPS Anda, atau gunakan "Input Manual".': 'Click "Get Location" to fetch your GPS coordinates, or use "Manual Input".',
        "Pengajuan / Keterangan Absensi": "Leave / Attendance Request",
        "Jenis Keterangan": "Request Type",
        "Izin Tidak Masuk": "Absence Request",
        "Sakit (Butuh Surat Dokter)": "Sick (Doctor's Note Required)",
        "Hadir (Manual / Luar Kantor)": "Present (Manual / Off-site)",
        "Kategori Izin": "Leave Category",
        "Cuti Tahunan": "Annual Leave",
        "Menikah": "Marriage",
        "Melahirkan": "Maternity",
        "Duka / Keluarga": "Bereavement / Family",
        "Libur / Lainnya": "Other",
        "Tanggal Mulai": "Start Date",
        "Tanggal Selesai": "End Date",
        "Upload Surat Dokter": "Upload Doctor's Note",
        "Surat akan diverifikasi oleh HRD/Admin. Status verifikasi bisa dilihat pada Statistik Saya.": "The note will be verified by HR/Admin. Verification status is shown under My Statistics.",
        "Alasan / Catatan": "Reason / Notes",
        "Tuliskan alasan...": "Write your reason...",
        "Kirim Pengajuan": "Submit Request",
        "Statistik Saya": "My Statistics",
        "Hadir": "Present",
        "Terlambat": "Late",
        "Izin": "Leave",
        "Sakit": "Sick",
        "Sisa Jatah Cuti Tahunan": "Remaining Annual Leave",
        "Status Surat Dokter Saya": "My Doctor's Note Status",
        "Belum ada pengajuan sakit dengan surat dokter.": "No sick leave with a doctor's note submitted yet.",
        "Magang / PKL": "Intern",
        "Sisa jatah cuti tahunan Anda:": "Your remaining annual leave balance:",
        "dari": "of",
        "Ubah Password Saya": "Change My Password",
        "Anda belum diizinkan Admin untuk mengubah password sendiri. Hubungi Admin/HRD untuk mengaktifkan izin ini.": "You are not yet allowed by Admin to change your own password. Contact Admin/HR to enable this permission.",
        "Password Baru": "New Password",
        "Minimal 4 karakter": "Minimum 4 characters",
        "Konfirmasi Password Baru": "Confirm New Password",
        "Ulangi password baru": "Repeat new password",
        "Pengajuan akan dikirim ke Admin/HRD untuk disetujui sebelum password aktif.": "The request will be sent to Admin/HR for approval before the new password becomes active.",
        "Ajukan Perubahan Password": "Request Password Change",

        // --- Badge AI kamera ---
        "Cahaya: Terlalu Gelap": "Light: Too Dark",
        "Cahaya: Terlalu Gelap (< 40)": "Light: Too Dark (< 40)",
        "Cahaya: Terlalu Terang": "Light: Too Bright",
        "Cahaya: Baik": "Light: Good",
        "Pencahayaan Adaptif (CLAHE)": "Adaptive Lighting (CLAHE)",
        "Wajah: Tidak Terdeteksi": "Face: Not Detected",
        "Wajah: Tidak Valid": "Face: Invalid",
        "Wajah: Menunggu Model": "Face: Waiting for Model",
        "Wajah: Terdeteksi": "Face: Detected",
        "Oklusi: Wajah Tertutup / Masker": "Occlusion: Face Covered / Mask",
        "Oklusi: Terdeteksi Kacamata": "Occlusion: Glasses Detected",
        "Oklusi: Kacamata Hitam": "Occlusion: Sunglasses",
        "Oklusi: Wajah Kurang Jelas": "Occlusion: Face Unclear",
        "Oklusi: Wajah Tertutup/Kurang Jelas": "Occlusion: Face Covered / Unclear",
        "Oklusi: Terdeteksi Masker": "Occlusion: Mask Detected",
        "Oklusi: Wajah Terlihat Jelas": "Occlusion: Face Clearly Visible",
        "Oklusi: -": "Occlusion: -",
        "Mohon lepas masker/penutup wajah Anda": "Please remove your mask or face cover",
        "Mohon lepas masker / jauhkan tangan dari wajah": "Please remove your mask or move your hands away from your face",
        "Mohon lepas kacamata Anda": "Please remove your glasses",
        "Mohon lepas kacamata hitam / penutup mata Anda": "Please remove sunglasses or eye coverings",
        "Mata tertutup / tidak terlihat jelas": "Eyes are closed or not clearly visible",
        "Wajah tertutup atau kurang jelas": "Face is covered or unclear",
        "Wajah Terhalang!": "Face Obstructed!",
        "Area Mata Terhalang!": "Eye Area Obstructed!",
        "Mata Tidak Terlihat!": "Eyes Not Visible!",
        "Buka mata Anda dan pastikan area mata terlihat jelas oleh kamera.": "Open your eyes and make sure the eye area is clearly visible to the camera.",
        "Ruangan terlalu gelap, cari tempat lebih terang": "Room is too dark, please move to a brighter place",
        "Memuat Model AI...": "Loading AI Model...",
        "Model AI: Aktif": "AI Model: Active",
        "Model AI: Siap": "AI Model: Ready",
        "Model AI Gagal Dimuat": "AI Model Failed to Load",

        // --- PWA & Offline Queue ---
        "Offline: Tersimpan di Memori": "Offline: Saved to Storage",
        "Offline: Tersimpan di Memori Perangkat": "Offline: Saved to Device Storage",
        "Mode Offline (Internet Terputus)": "Offline Mode (Internet Disconnected)",
        "Online (Terhubung)": "Online (Connected)",
        "Sinkronkan Data Offline": "Sync Offline Data",
        "Menyinkronkan presensi offline...": "Syncing offline attendance...",
        "Semua data presensi offline berhasil disinkronkan ke server.": "All offline attendance records were successfully synced to the server.",
        "antrean offline": "offline queue",

        // --- Status GPS & geofencing ---
        "Mendeteksi lokasi GPS...": "Detecting GPS location...",
        "Dalam radius kantor": "Within office radius",
        "Di luar radius kantor": "Outside office radius",
        "lokasi kantor belum diatur Admin": "office location not set by Admin",
        "Terindikasi Fake GPS/Mock Location (akurasi tidak wajar). Absen akan ditolak.": "Suspected Fake GPS/Mock Location (abnormal accuracy). Attendance will be rejected.",
        "Akurasi GPS rendah": "Low GPS accuracy",
        "Pindah ke area terbuka / aktifkan GPS akurasi tinggi lalu coba lagi.": "Move to an open area / enable high-accuracy GPS and try again.",
        "Sinyal GPS tidak tersedia/lemah. Pastikan GPS perangkat aktif dan Anda berada di area terbuka.": "GPS signal unavailable/weak. Make sure your device GPS is on and you are in an open area.",
        "Waktu pencarian lokasi GPS habis (timeout). Coba lagi di area dengan sinyal lebih baik.": "GPS location search timed out. Try again in an area with better signal.",
        "Lokasi GPS tidak tersedia (error tidak dikenal).": "GPS location unavailable (unknown error).",
        "Geolocation tidak didukung perangkat/browser ini.": "Geolocation is not supported by this device/browser.",
        "Anda tetap bisa memakai tombol \"Input Manual\" untuk memasukkan koordinat secara manual.": 'You can still use the "Manual Input" button to enter coordinates manually.',

        // --- Status surat dokter ---
        "Menunggu Verifikasi": "Awaiting Verification",
        "Disetujui": "Approved",
        "Ditolak": "Rejected",
        "MENUNGGU": "PENDING",
        "DISETUJUI": "APPROVED",
        "DITOLAK": "REJECTED",
        "SURAT PENDING": "NOTE PENDING",
        "SURAT OK": "NOTE OK",
        "SURAT DITOLAK": "NOTE REJECTED",
        "Belum ada surat dokter yang dikirimkan staff.": "No doctor's notes submitted by staff yet.",

        // --- Tabel HRD / badge status absensi ---
        "HADIR": "PRESENT",
        "TERLAMBAT": "LATE",
        "IZIN": "LEAVE",
        "SAKIT": "SICK",
        "Tidak ada data absensi untuk tanggal yang dipilih.": "No attendance data for the selected date.",
        "Sedang Bekerja...": "Currently Working...",

        // --- Masa kerja ---
        "Baru Masuk": "Newly Joined",
        "Thn": "Yr",
        "Bln": "Mo",

        // --- Admin panel (user management) ---
        "Aman": "Secure",
        "Terkunci Permanen": "Permanently Locked",
        "Diblokir Sementara": "Temporarily Blocked",
        "Diizinkan": "Allowed",
        "Belum Diizinkan": "Not Allowed",
        "Karyawan berhasil dinonaktifkan.": "Employee deactivated successfully.",
        "Nonaktifkan karyawan ini? Mereka tidak akan bisa login lagi.": "Deactivate this employee? They will no longer be able to log in.",
        "Email Karyawan (untuk Login)": "Employee Email (for Login)",
        "Gunakan alamat email lengkap agar akun bisa login ke sistem.": "Use a full email address so the account can log in to the system.",
        "Format Email Tidak Valid!": "Invalid Email Format!",
        "Format email tidak valid. Masukkan email lengkap seperti": "Invalid email format. Please enter a full email such as",

        // --- Admin panel (shift & lokasi) ---
        "Senin - Sabtu": "Monday - Saturday",
        "AKTIF": "ACTIVE",
        "menit": "min",
        "Jam kerja tidak ditemukan.": "No work hours found.",
        "Belum ada kantor/cabang yang diatur. Selama belum ada, validasi jarak GPS saat absen tidak aktif (staff bisa absen dari mana saja).": "No office/branch configured yet. Until one is added, GPS distance validation is disabled (staff can clock in from anywhere).",
        "terdaftar. Staff otomatis divalidasi terhadap kantor terdekat dari daftar ini.": "registered. Staff are automatically validated against the nearest office from this list.",
        "Belum ada data kantor.": "No office data yet.",
        "Tambah Kantor": "Add Office",
        "Update Kantor": "Update Office",

        // --- Alert pesan absen ---
        "Anda sudah melakukan Absen Masuk hari ini!": "You have already clocked in today!",
        "Anda sudah Absen Pulang untuk hari ini!": "You have already clocked out for today!",
        "Terlambat! (Batas masuk Shift": "Late! (Clock-in deadline Shift",
        "Tercatat Masuk pukul": "Recorded Clock-in at",
        "Berhasil Absen Masuk pukul": "Successfully Clocked In at",
        "Belum Waktunya Pulang!": "Not Yet Time to Clock Out!",
        "Absen Pulang Shift": "Clock Out Shift",
        "hanya bisa dilakukan mulai pukul": "can only be done starting at",
        "Berhasil Absen Pulang pukul": "Successfully Clocked Out at",
        "Total Jam Kerja:": "Total Working Hours:",
        "Memvalidasi lokasi...": "Validating location...",

        // --- Permintaan password ---
        "Tidak ada permintaan ganti password yang menunggu.": "No pending password change requests.",
        "Pengajuan ganti password terkirim! Menunggu persetujuan Admin/HRD.": "Password change request submitted! Awaiting Admin/HR approval.",
        "Konfirmasi password tidak sama.": "Passwords do not match.",
        "Pengajuan ganti password Anda sedang menunggu persetujuan Admin/HRD.": "Your password change request is awaiting Admin/HR approval.",

        // --- Dashboard & Monitoring ---
        "Dashboard Admin": "Admin Dashboard",
        "Dashboard HRD": "HR Dashboard",
        "Dashboard & Monitoring Absensi": "Dashboard & Attendance Monitoring",
        "Dashboard Admin - Monitoring & Rekap": "Admin Dashboard - Monitoring & Summary",
        "Dashboard HRD - Monitoring & Rekap": "HR Dashboard - HR Monitoring & Summary",
        "Dashboard Admin - Realtime Monitoring & Absensi": "Admin Dashboard - Real-time Attendance & Working Hours",
        "Dashboard HRD - Realtime Monitoring & Absensi": "HR Dashboard - Real-time Attendance & Working Hours",
        "Dashboard HRD - Realtime Absensi & Jam Kerja": "HR Dashboard - Real-time Attendance & Working Hours",
        "Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja secara realtime.": "Monitor attendance, lateness, clock-in, clock-out, and work duration in real time.",
        "Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja seluruh staff perusahaan.": "Track attendance, lateness, clock-in, clock-out, and working duration across all company staff.",
        "Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja staff.": "Track attendance, lateness, clock-in, clock-out, and working duration for staff.",
        "Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja. Rekap total per staff tersedia langsung di kolom tabel.": "Track attendance, lateness, clock-in, clock-out, and working duration. Per-staff totals are available directly in the table columns.",
        "Admin Perusahaan": "Company Admin",
        "HRD / Personalia": "HR / Personnel",
        "Karyawan / Staff": "Employee / Staff",
        "Presensi Mandiri": "Self Attendance",
        "Data Staff": "Staff Data",
        "Staff & Karyawan": "Staff & Employees",
        "Perusahaan": "Company",
        "Cetak Laporan": "Print Report",
        "Daftar Rekap Jam Kerja": "Working Hours Recap List",
        "Tanggal": "Date",
        "ID & Nama": "ID & Name",
        "Jabatan, Shift & Masa Kerja": "Position, Shift & Tenure",
        "Total Jam Kerja": "Total Working Hours",

        // --- Kalender Admin/HRD ---
        "Kalender Tim - Izin & Cuti Staff": "Team Calendar - Staff Leave & Time Off",
        "Lihat siapa saja yang izin/cuti (melahirkan, menikah, cuti tahunan, duka, dll) agar jadwal tim mudah dipantau bersama.": "See who is on leave/time off (maternity, marriage, annual leave, bereavement, etc.) so the team schedule is easy to monitor together.",
        "Arahkan kursor ke nama pada kalender untuk melihat kategori izin/cuti-nya.": "Hover over a name on the calendar to see its leave/time-off category.",
        "Tidak ada pengajuan izin/cuti pada bulan ini.": "No leave/time-off requests this month.",
        "Tidak ada data izin/cuti pada bulan ini untuk diunduh.": "No leave/time-off data this month to download.",
        "s/d": "to",
        "hari": "day(s)",

        // --- Registrasi ---
        "Pilih Bidang Perusahaan": "Select Company Industry",
        "Pilih Bidang": "Select Industry",
        "Pilih Paket": "Select Plan",
        "Daftar Akun": "Create Account",
        "Finish": "Finish",
        "Teknologi": "Technology",
        "Pemerintahan": "Government",
        "Jasa": "Services",
        "Media": "Media",
        "Lainnya": "Other",
        "Paket FREE 1": "FREE Plan 1",
        "Paket PLATINUM": "PLATINUM Plan",
        "Paket Gratis untuk 50 Staff": "Free Plan for 50 Staff",
        "Paket Platinum untuk Perusahaan/Usaha menengah keatas": "Platinum Plan for Medium to Large Businesses",
        "Paket Terpilih": "Selected Plan",
        "Pajak": "Tax",
        "Total": "Total",
        "Nama Perusahaan": "Company Name",
        "Kode Perusahaan (unik, dipakai saat login)": "Company Code (unique, used when logging in)",
        "Huruf/angka/strip saja, minimal 3 karakter. Ini yang membedakan data perusahaan Anda dari perusahaan lain.": "Letters/numbers/hyphens only, minimum 3 characters. This distinguishes your company data from others.",
        "Nomor Whatsapp": "WhatsApp Number",
        "Masukkan nomor Whatsapp": "Enter WhatsApp number",
        "Daftar Akun Sekarang": "Create Account Now",
        "Daftar": "Register",
        "Masukkan nama perusahaan": "Enter company name",
        "Pendaftaran Berhasil!": "Registration Successful!",
        "Akun perusahaan Anda sudah aktif. Silakan masuk menggunakan akun Admin baru Anda.": "Your company account is now active. Please sign in with your new Admin account.",
        "Simpan Kode Perusahaan Anda, dibutuhkan setiap kali login (dari perangkat manapun):": "Save your Company Code, it is required every time you log in (from any device):",
        "Ke Halaman Masuk": "Go to Sign In",
        "Informasi bidang perusahaan membantu kami memberikan fitur yang lebih relevan untuk bisnis Anda.": "Your company industry helps us provide more relevant features for your business.",

        // --- Verifikasi surat ---
        "Periksa": "Review",
        "Staff:": "Staff:",
        "Tanggal Pengajuan:": "Submission Date:",
        "Keterangan:": "Notes:",
        "Status Saat Ini:": "Current Status:",
        "Format file tidak dapat ditampilkan. Nama file:": "File format cannot be displayed. Filename:",

        // --- Footer ---
        "© 2026 AbsensiPro Web System - Ready for Vercel Deployment": "© 2026 AbsensiPro Web System - Ready for Vercel Deployment",

        // --- Pesan alert dinamis ---
        "Pengajuan berhasil dikirim!": "Request submitted successfully!",
        "berhasil dikirim!": "submitted successfully!",
        "Pengajuan": "Request",
        "Surat dokter wajib diupload untuk pengajuan Sakit!": "A doctor's note is required for a Sick request!",
        "Ukuran file surat dokter maksimal 4MB.": "Doctor's note file size must be under 4MB.",
        "Gagal membaca file surat dokter.": "Failed to read the doctor's note file.",
        "Tanggal selesai tidak boleh sebelum tanggal mulai.": "End date cannot be before the start date.",
        "Surat dokter akan diverifikasi HRD/Admin.": "The doctor's note will be verified by HR/Admin.",
        "hari": "day(s)",
        "Anda telah keluar dari sistem.": "You have been signed out.",
        "Lokasi GPS belum terdeteksi! Klik tombol ambil lokasi / izinkan akses lokasi terlebih dahulu.": "GPS location not detected yet! Click Get Location / allow location access first.",
        "Izin akses lokasi ditolak. Aktifkan izin lokasi untuk browser/aplikasi ini di pengaturan perangkat, lalu coba lagi.": "Location access denied. Enable location permission for this browser/app in your device settings, then try again.",
        "Gagal mengambil lokasi GPS. Pastikan izin lokasi browser sudah diizinkan.": "Failed to get GPS location. Make sure browser location permission is granted.",
        "Selamat datang kembali,": "Welcome back,",
        "Memeriksa akun...": "Verifying account...",
        "Menyimpan...": "Saving...",
        "Mengirim...": "Sending...",
        "Mendeteksi...": "Detecting...",
        "Link reset password telah dikirim ke": "Password reset link has been sent to",
        "Periksa kotak masuk email Anda.": "Please check your email inbox.",
        "Kirim Link Reset": "Send Reset Link",
        "Sudah terpakai tahun ini:": "Used this year:",

        // --- Masa kerja & durasi ---
        "Thn": "Yr",
        "Bln": "Mo",
        "Jam": "Hour(s)",
        "Mnt": "Min",
        "Baru Masuk": "Newly Joined",
        "Sedang Bekerja...": "Currently Working...",

        // --- Form Admin tambah user ---
        "Nama dan email wajib diisi.": "Name and email are required.",
        "ID Staff": "Staff ID",
        "Nama Lengkap": "Full Name",
        "Jabatan": "Position",
        "Shift": "Shift",
        "Jatah Cuti (hari/tahun)": "Annual Leave (days/year)",
        "Tanggal Masuk": "Join Date",
        "Tambah Karyawan": "Add Employee",
        "Menyimpan...": "Saving...",
        "Memuat data karyawan...": "Loading employee data...",

        // --- Manajemen password ---
        "Wajib Ganti Password": "Must Change Password",
        "Izin Ubah Mandiri": "Self-Change Permission",
        "Password baru minimal 6 karakter.": "New password must be at least 6 characters.",
        "Flag \"wajib ganti password\" diaktifkan": "\"Must change password\" flag activated",
        "Pengaturan izin password": "Password permission settings",
        "berhasil disimpan.": "saved successfully.",
        "Setujui": "Approve",
        "Tolak": "Reject",
        "MENUNGGU": "PENDING",

        // --- Shift master ---
        "Ubah Jam": "Edit Hours",
        "Atur Shift": "Set Shift",
        "Atur Cuti": "Set Leave",
        "Password": "Password",
        "Reset": "Reset",
        "Hapus": "Delete",
        "Atur Shift": "Set Shift",
        "Staff": "Staff",
        "Tambah Karyawan berhasil!": "Employee added successfully!",
        "Jam masuk & jam pulang wajib diisi.": "Clock-in & clock-out time are required.",
        "Jam kerja tidak ditemukan.": "No work hours found.",
        "Jam kerja Shift": "Shift working hours",
        "berhasil diubah menjadi": "changed to",

        // --- Lokasi kantor ---
        "Nama kantor/cabang wajib diisi.": "Office/branch name is required.",
        "Latitude tidak valid (harus berupa angka antara -90 sampai 90).": "Invalid Latitude (must be a number between -90 and 90).",
        "Longitude tidak valid (harus berupa angka antara -180 sampai 180).": "Invalid Longitude (must be a number between -180 and 180).",
        "Radius maksimal absen minimal 10 meter.": "Minimum allowed GPS radius is 10 meters.",
        "Latitude tidak valid (harus di antara -90 sampai 90).": "Invalid Latitude (must be between -90 and 90).",
        "Longitude tidak valid (harus di antara -180 sampai 180).": "Invalid Longitude (must be between -180 and 180).",
        "Koordinat lokasi Anda saat ini berhasil diambil. Pastikan Anda sedang benar-benar berada di lokasi kantor, lalu klik \"Simpan\".": "Your current location coordinates were fetched. Make sure you are physically at the office, then click \"Save\".",
        "Ambil Lokasi Saat Ini": "Get Current Location",
        "Koordinat GPS manual berhasil diterapkan.": "Manual GPS coordinates applied successfully.",
        "Koordinat manual diterapkan, tapi jaraknya sekitar": "Manual coordinates applied, but the distance is approximately",
        "meter dari": "meters from",
        "(di luar radius": "(outside the radius of",
        "meter). Absen akan ditolak sampai koordinat berada dalam radius kantor.": "meters). Attendance will be rejected until coordinates are within the office radius.",
        "Hapus kantor": "Delete office",
        "Latitude tidak valid": "Invalid latitude",
        "Longitude tidak valid": "Invalid longitude",

        // --- Alert GPS & absen ---
        "Kamera belum dibuka!": "Camera not opened!",
        "Klik \"Buka Kamera\" terlebih dahulu untuk verifikasi wajah.": "Click \"Open Camera\" first for face verification.",
        "Model AI masih dimuat.": "AI Model is still loading.",
        "Mohon tunggu beberapa detik lalu coba lagi.": "Please wait a few seconds and try again.",
        "Wajah tidak terdeteksi!": "Face not detected!",
        "Posisikan wajah Anda tepat di depan kamera.": "Position your face directly in front of the camera.",
        "Wajah terhalang!": "Face obstructed!",
        "Pastikan wajah tidak tertutup masker/tangan/topi dan terlihat jelas oleh kamera.": "Make sure your face is not covered by a mask/hand/hat and is clearly visible to the camera.",
        "Pencahayaan kurang mendukung!": "Lighting is insufficient!",
        "Sesuaikan pencahayaan ruangan (jangan terlalu gelap/terlalu terang) lalu coba lagi.": "Adjust the room lighting (not too dark/too bright) and try again.",
        "Gagal Pulang!": "Clock-out Failed!",
        "Anda belum melakukan Absen Masuk hari ini.": "You have not clocked in today.",
        "Terindikasi Fake GPS/Mock Location!": "Suspected Fake GPS/Mock Location!",
        "Akurasi lokasi tidak wajar. Nonaktifkan aplikasi fake GPS lalu coba lagi memakai GPS asli perangkat.": "Abnormal location accuracy. Disable the fake GPS app and try again with your device's real GPS.",
        "Berhasil Absen Masuk pukul": "Successfully Clocked In at",
        "Berhasil Absen Pulang pukul": "Successfully Clocked Out at",

        // --- Rekap & statistik ---
        "Total Karyawan": "Total Employees",
        "Hadir Hari Ini": "Present Today",
        "Izin/Cuti": "On Leave",
        "Sakit": "Sick",
        "Belum Absen": "Not Yet Clocked In",
        "Cetak Laporan": "Print Report",
        "Unduh CSV": "Download CSV",
        "Unduh Excel": "Download Excel",
        "Tidak ada data izin/cuti pada bulan ini untuk diunduh.": "No leave/time-off data this month to download.",
        "s/d": "to",
        "hari": "day(s)",

        // --- Kalender izin ---
        "Tidak ada pengajuan izin/cuti pada bulan ini.": "No leave/time-off requests this month.",

        // --- Verifikasi surat ---
        "Surat dokter dari": "Doctor's note from",
        "telah": "has been",
        "Keputusan Verifikasi": "Verification Decision",
        "Catatan (opsional)": "Notes (optional)",
        "Catatan verifikasi...": "Verification notes...",
        "Belum ada data kantor.": "No office data yet.",

        // --- Karyawan section ---
        "Nama:": "Name:",
        "ID:": "ID:",
        "Jabatan:": "Position:",
        "Masa Kerja": "Tenure",
        "sisa": "remaining",
        "dari": "of",

        // --- Notifikasi & konfirmasi ---
        "Akun berhasil dipulihkan! Silakan login dengan username & password baru Anda.": "Account recovered successfully! Please log in with your new username & password.",
        "Kamera berhasil dimatikan. Klik \"Buka Kamera\" lagi saat ingin absen.": "Camera turned off. Click \"Open Camera\" again when you want to clock in/out.",
        "Semua kolom wajib diisi.": "All fields are required.",
        "Password baru minimal 4 karakter.": "New password must be at least 4 characters.",
        "ID Staff / Username lama tidak ditemukan.": "Old Staff ID / Username not found.",
        "Username baru sudah digunakan, silakan pilih yang lain.": "New username is already taken, please choose another.",
        "Tidak ada riwayat blokir untuk user ini.": "No block history for this user.",
        "Status keamanan login untuk": "Login security status for",
        "berhasil direset.": "reset successfully.",
        "Monitoring & Rekap": "Monitoring & Summary",
        "Monitoring & Rekap HRD": "HR Monitoring & Summary",
        "Kelola User & Admin": "Manage Users & Admins",
        "Geolocation tidak didukung browser ini.": "Geolocation is not supported by this browser.",
        "Konfirmasi Password": "Confirm Password",
        "Ulangi password": "Repeat password",
        "Kembali pilih paket": "Back to plan selection",
        "Catatan:": "Note:",
        "berhasil diperbarui.": "updated successfully.",
        "berhasil ditambahkan.": "added successfully.",
        "berhasil dihapus.": "deleted successfully.",
        "Gagal menyimpan data kantor.": "Failed to save office data.",
        "Gagal menghapus kantor.": "Failed to delete office.",
        "Gagal ubah shift:": "Failed to change shift:",

        // --- Registrasi extra ---
        "Konfirmasi password tidak cocok.": "Passwords do not match.",
        "Password minimal 8 karakter.": "Password must be at least 8 characters.",
        "Kode perusahaan harus 3-30 karakter, huruf/angka/strip saja.": "Company code must be 3-30 characters, letters/numbers/hyphens only.",
        "Membuat akun...": "Creating account...",
        "Kembali pilih paket": "Back to package selection"
    };

    // ===================== 2. INIT I18NEXT =====================
    function safeLocalStorageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeLocalStorageSet(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* ignore (private mode dll) */ }
    }

    function detectInitialLang() {
        const saved = safeLocalStorageGet('absensi_lang');
        if (saved === 'id' || saved === 'en') return saved;
        const nav = (navigator.language || navigator.userLanguage || 'id').toLowerCase();
        return nav.startsWith('id') ? 'id' : 'en'; // default: kalau bukan device berbahasa Indonesia, pakai Inggris
    }

    let ready = false;
    const readyCallbacks = [];

    function initI18n() {
        if (typeof i18next === 'undefined') {
            // Fallback tanpa i18next (mis. CDN gagal dimuat / offline): tetap jalan pakai Bahasa Indonesia.
            console.warn('i18next tidak termuat, aplikasi berjalan dalam Bahasa Indonesia saja.');
            global.__i18nFallback = true;
            ready = true;
            readyCallbacks.forEach(fn => fn());
            return;
        }
        i18next.init({
            lng: detectInitialLang(),
            fallbackLng: 'id',
            supportedLngs: ['id', 'en'],
            keySeparator: false,   // key = teks sumber lengkap, bukan "a.b.c"
            nsSeparator: false,    // hindari ':' pada teks sumber dianggap namespace
            interpolation: { escapeValue: false },
            resources: {
                id: { translation: {} }, // Bahasa Indonesia = teks sumber asli, tidak perlu mapping
                en: { translation: EN }
            }
        }, function () {
            ready = true;
            document.documentElement.lang = i18next.language;
            translateStaticDOM();
            renderLangSwitchers();
            readyCallbacks.forEach(fn => fn());
        });
    }

    // ===================== 3. TERJEMAHKAN TEKS STATIS DI DOM =====================
    // Menyimpan teks asli (Bahasa Indonesia) di data-i18n-orig supaya bisa
    // toggle bolak-balik ID<->EN tanpa kehilangan sumber aslinya.
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

    function translateNode(node) {
        // Text node murni
        if (node.nodeType === Node.TEXT_NODE) {
            const raw = node.nodeValue;
            const trimmed = raw.trim();
            if (!trimmed) return;
            let orig = node.__i18nOrig;
            if (!orig) { orig = trimmed; node.__i18nOrig = orig; }
            const translated = t(orig);
            // Pertahankan whitespace asli di sekitar teks (indentation dari template HTML)
            node.nodeValue = raw.replace(trimmed, translated);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (SKIP_TAGS.has(node.tagName)) return;

        // Atribut yang perlu diterjemahkan
        ['placeholder', 'title', 'aria-label'].forEach(attr => {
            if (node.hasAttribute(attr)) {
                const key = 'data-i18n-orig-' + attr;
                let orig = node.getAttribute(key);
                if (!orig) { orig = node.getAttribute(attr); node.setAttribute(key, orig); }
                node.setAttribute(attr, t(orig));
            }
        });

        // <option value="..">Teks</option> ditangani sebagai anak biasa via childNodes,
        // tapi cukup 1 level agar tidak menabrak elemen dinamis yang di-render app.js.
        for (let i = 0; i < node.childNodes.length; i++) {
            translateNode(node.childNodes[i]);
        }
    }

    function translateStaticDOM(root) {
        root = root || document.body;
        translateNode(root);
    }

    // Daftar frasa diurutkan dari yang PALING PANJANG ke pendek, supaya frasa
    // panjang & spesifik diterjemahkan lebih dulu sebelum frasa pendek generik
    // (mencegah terjemahan parsial yang salah/ambigu).
    let sortedPhraseKeys = null;
    function getSortedPhraseKeys() {
        if (!sortedPhraseKeys) {
            sortedPhraseKeys = Object.keys(EN).sort((a, b) => b.length - a.length);
        }
        return sortedPhraseKeys;
    }

    // translateText: dipakai untuk string CAMPURAN (HTML tag + nilai dinamis
    // seperti nama/angka + potongan kalimat Bahasa Indonesia yang statis),
    // misalnya pesan pada showAlert(). Setiap frasa Indonesia yang dikenali
    // di kamus EN akan diganti in-place, sisanya (nama orang, angka, tag HTML)
    // tetap dibiarkan apa adanya.
    function translateText(str) {
        if (!str || typeof str !== 'string') return str;
        if (global.__i18nFallback || typeof i18next === 'undefined') return str;
        if (currentLang() !== 'en') return str; // Bahasa Indonesia = teks asli, tidak perlu diubah
        let out = str;
        getSortedPhraseKeys().forEach(function (phrase) {
            if (out.indexOf(phrase) !== -1) {
                out = out.split(phrase).join(EN[phrase]);
            }
        });
        return out;
    }

    // ===================== 4. HELPER GLOBAL t() & LOCALE =====================
    // Dipakai di app.js untuk teks yang dibuat lewat JS (alert, badge, dst):
    //   showAlert(t('Pengajuan berhasil dikirim!'))
    function t(key) {
        if (!key) return key;
        if (global.__i18nFallback || typeof i18next === 'undefined') return key;
        return i18next.t(key, { defaultValue: key });
    }

    // Locale untuk Intl/toLocaleDateString mengikuti bahasa aktif saat ini.
    function appLocale() {
        const lang = (typeof i18next !== 'undefined' && i18next.language) ? i18next.language : 'id';
        return lang === 'en' ? 'en-US' : 'id-ID';
    }

    function currentLang() {
        return (typeof i18next !== 'undefined' && i18next.language) ? i18next.language : 'id';
    }

    // ===================== 5. GANTI BAHASA (MANUAL SWITCH) =====================
    function setLanguage(lang) {
        if (lang !== 'id' && lang !== 'en') return;
        if (global.__i18nFallback || typeof i18next === 'undefined') return;
        i18next.changeLanguage(lang, function () {
            safeLocalStorageSet('absensi_lang', lang);
            document.documentElement.lang = lang;
            translateStaticDOM();
            renderLangSwitchers();
            // Minta app.js me-render ulang bagian dinamis (tabel, kalender, badge, dsb)
            // supaya ikut berubah bahasa tanpa reload halaman.
            if (typeof global.onLanguageChanged === 'function') {
                try { global.onLanguageChanged(lang); } catch (e) { console.error(e); }
            }
        });
    }

    // Tombol switch bahasa kecil (ID | EN) — dipasang otomatis di pojok kanan
    // atas layar login & di sidebar aplikasi, tanpa perlu edit index.html.
    function buildSwitcherEl() {
        const wrap = document.createElement('div');
        wrap.className = 'i18n-lang-switch flex items-center gap-1 text-[11px] font-semibold select-none';
        wrap.innerHTML = `
            <button type="button" data-lang="id" class="px-2 py-1 rounded transition"></button>
            <span class="opacity-40">|</span>
            <button type="button" data-lang="en" class="px-2 py-1 rounded transition"></button>
        `;
        wrap.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => setLanguage(btn.getAttribute('data-lang')));
        });
        return wrap;
    }

    function styleSwitcherButtons(wrap, dark) {
        const active = currentLang();
        wrap.querySelectorAll('button').forEach(btn => {
            const isActive = btn.getAttribute('data-lang') === active;
            btn.textContent = btn.getAttribute('data-lang').toUpperCase();
            btn.className = 'px-2 py-1 rounded transition ' + (isActive
                ? (dark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                : (dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'));
        });
    }

    function renderLangSwitchers() {
        // 1) Pojok kanan-atas layar login
        let loginHost = document.getElementById('i18nSwitchLogin');
        if (!loginHost) {
            loginHost = document.createElement('div');
            loginHost.id = 'i18nSwitchLogin';
            loginHost.className = 'fixed top-4 right-4 z-50 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-2 py-1 shadow-sm';
            document.body.appendChild(loginHost);
            loginHost.appendChild(buildSwitcherEl());
        }
        styleSwitcherButtons(loginHost, false);
        const authWrapper = document.getElementById('authWrapper');
        loginHost.style.display = (authWrapper && !authWrapper.classList.contains('hidden')) ? '' : 'none';

        // 2) Sidebar aplikasi (dekat info user / logout)
        let sideHost = document.getElementById('i18nSwitchSidebar');
        const userInfoSidebar = document.getElementById('userInfoSidebar');
        if (!sideHost && userInfoSidebar) {
            sideHost = document.createElement('div');
            sideHost.id = 'i18nSwitchSidebar';
            sideHost.className = 'flex justify-center mb-3';
            sideHost.appendChild(buildSwitcherEl());
            userInfoSidebar.insertBefore(sideHost, userInfoSidebar.firstChild);
        }
        if (sideHost) styleSwitcherButtons(sideHost, true);
    }

    // ===================== 6. EXPOSE KE GLOBAL (dipakai app.js & index.html) =====================
    global.t = t;
    global.translateText = translateText;
    global.appLocale = appLocale;
    global.setLanguage = setLanguage;
    global.currentLang = currentLang;
    global.translateStaticDOM = translateStaticDOM;
    global.onI18nReady = function (fn) {
        if (ready) fn(); else readyCallbacks.push(fn);
    };

    document.addEventListener('DOMContentLoaded', initI18n);
})(window);