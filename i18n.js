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
        "Batal": "Cancel",
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

        // --- Dashboard HRD ---
        "Dashboard HRD - Realtime Absensi & Jam Kerja": "HR Dashboard - Real-time Attendance & Working Hours",
        "Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja. Rekap total per staff tersedia langsung di kolom tabel.": "Track attendance, lateness, clock-in, clock-out, and working duration. Per-staff totals are available directly in the table columns.",
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

        // --- Footer ---
        "© 2026 AbsensiPro Web System - Ready for Vercel Deployment": "© 2026 AbsensiPro Web System - Ready for Vercel Deployment",

        // --- Pesan alert dinamis (dipakai lewat t() di app.js) ---
        "Pengajuan berhasil dikirim!": "Request submitted successfully!",
        "berhasil dikirim!": "submitted successfully!",
        "Pengajuan": "Request",
        "Surat dokter wajib diupload untuk pengajuan Sakit!": "A doctor's note is required for a Sick request!",
        "Ukuran file surat dokter maksimal 4MB.": "Doctor's note file size must be under 4MB.",
        "Gagal membaca file surat dokter.": "Failed to read the doctor's note file.",
        "Tanggal selesai tidak boleh sebelum tanggal mulai.": "End date cannot be before the start date.",
        "Surat dokter akan diverifikasi HRD/Admin.": "The doctor's note will be verified by HR/Admin.",
        "Tidak ada pengajuan izin/cuti pada bulan ini.": "No leave/time-off requests this month.",
        "Tidak ada data izin/cuti pada bulan ini untuk diunduh.": "No leave/time-off data this month to download.",
        "hari": "day(s)",
        "Anda telah keluar dari sistem.": "You have been signed out.",
        "Lokasi GPS belum terdeteksi! Klik tombol ambil lokasi / izinkan akses lokasi terlebih dahulu.": "GPS location not detected yet! Click Get Location / allow location access first.",
        "Izin akses lokasi ditolak. Aktifkan izin lokasi untuk browser/aplikasi ini di pengaturan perangkat, lalu coba lagi.": "Location access denied. Enable location permission for this browser/app in your device settings, then try again.",
        "Gagal mengambil lokasi GPS. Pastikan izin lokasi browser sudah diizinkan.": "Failed to get GPS location. Make sure browser location permission is granted."
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