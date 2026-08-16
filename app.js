// ================== SIDEBAR MOBILE (BUKA/TUTUP) ==================
function toggleSidebar(show) {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    if (show) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

// ================== KONFIGURASI BACKEND PHP (GEOFENCING SERVER-SIDE) ==================
        // Ganti sesuai lokasi folder backend-php/ Anda di-host, contoh:
        // 'https://domainanda.com/backend-php' atau '/backend-php' kalau 1 domain dengan frontend.
        const API_BASE_URL = '/backend-php';

        // DATABASE LOKAL
        let users = JSON.parse(localStorage.getItem('absensi_users')) || [
            { id: "EMP-001", nama: "Budi Santoso", jabatan: "Frontend Dev", tglMasuk: "2023-01-15", username: "user", pass: "123456", role: "staff", shift: "pagi", allowChangePassword: false },
            { id: "HRD-101", nama: "Siti Rahma", jabatan: "HR Manager", tglMasuk: "2022-05-10", username: "hrd", pass: "123456", role: "hrd", shift: "pagi", allowChangePassword: false },
            { id: "ADM-999", nama: "Administrator", jabatan: "System Admin", tglMasuk: "2021-01-01", username: "admin", pass: "123456", role: "admin", shift: "pagi", allowChangePassword: false }
        ];
        // Migrasi data lama: pastikan setiap user punya field shift (default pagi) & izin ubah password (default belum diizinkan)
        users.forEach(u => {
            if (!u.shift) u.shift = 'pagi';
            if (typeof u.allowChangePassword === 'undefined') u.allowChangePassword = false;
            if (!u.role) u.role = 'staff';
            if (u.role === 'karyawan') u.role = 'staff'; // migrasi data lama: role "karyawan" -> "staff"
            if (typeof u.jatahCuti === 'undefined') u.jatahCuti = 12; // jatah cuti/izin tahunan default (hari)
        });
        localStorage.setItem('absensi_users', JSON.stringify(users)); // simpan hasil migrasi supaya tidak diulang tiap load

        // ================== KONFIGURASI SHIFT KERJA (BISA DIUBAH ADMIN/HRD, DISIMPAN DI localStorage) ==================
        const DEFAULT_SHIFT_CONFIG = {
            pagi:  { label: "Pagi",  jamMasuk: 8,  menitMasuk: 0, jamPulang: 16, menitPulang: 0, toleransi: 15, labelMasuk: "08:00 WIB", labelPulang: "16:00 WIB" },
            siang: { label: "Siang", jamMasuk: 13, menitMasuk: 0, jamPulang: 21, menitPulang: 0, toleransi: 15, labelMasuk: "13:00 WIB", labelPulang: "21:00 WIB" }
        };
        let SHIFT_CONFIG = JSON.parse(localStorage.getItem('absensi_shift_config')) || JSON.parse(JSON.stringify(DEFAULT_SHIFT_CONFIG));
        // Migrasi: pastikan field lengkap (jaga-jaga config lama tersimpan sebagian)
        Object.keys(DEFAULT_SHIFT_CONFIG).forEach(key => {
            if (!SHIFT_CONFIG[key]) SHIFT_CONFIG[key] = JSON.parse(JSON.stringify(DEFAULT_SHIFT_CONFIG[key]));
            if (typeof SHIFT_CONFIG[key].toleransi === 'undefined') SHIFT_CONFIG[key].toleransi = 15;
        });
        function saveShiftConfigToStorage() { localStorage.setItem('absensi_shift_config', JSON.stringify(SHIFT_CONFIG)); }
        function pad2(n) { return String(n).padStart(2, '0'); }
        function getShiftConfig(user) {
            return SHIFT_CONFIG[(user && user.shift) || 'pagi'];
        }

        // ================== PERMINTAAN UBAH PASSWORD KARYAWAN (BUTUH PERSETUJUAN ADMIN/HRD) ==================
        let passwordRequests = JSON.parse(localStorage.getItem('absensi_pwreq')) || [];
        function savePwReqToStorage() { localStorage.setItem('absensi_pwreq', JSON.stringify(passwordRequests)); }

        let absensiLogs = JSON.parse(localStorage.getItem('absensi_logs')) || [];
        // Sekarang TIDAK dibaca dari sessionStorage lagi -> diisi dari server lewat
        // restoreSessionFromServer() saat halaman dimuat (lihat DOMContentLoaded di bawah).
        let currentUser = null;
        let currentGPS = "Lokasi belum didapatkan";
        let currentLat = null;
        let currentLng = null;
        let currentGPSValid = null; // true = dalam radius, false = di luar radius, null = belum ada acuan/lokasi
        let currentGPSDistance = null;

        // ================== LOKASI KANTOR / CABANG (GEOFENCING MULTI-LOKASI) ==================
        // Sumber data resmi sekarang adalah backend PHP + MySQL (folder backend-php/),
        // BUKAN localStorage lagi. Array di bawah ini hanya cache di memori browser untuk
        // menampilkan preview jarak/nama kantor terdekat ke staff (UX saja).
        // Keputusan FINAL diterima/ditolaknya absen tetap dihitung ulang di server
        // (lihat absen_submit.php) supaya tidak bisa dimanipulasi dari sisi client.
        // Setiap kantor: { id, nama, alamat, lat, lng, radius }
        let officeLocations = [];

        async function loadOfficeLocationsFromServer() {
            try {
                const res = await fetch(`${API_BASE_URL}/office_locations.php`, { credentials: 'include' });
                const json = await res.json();
                if (json.success) {
                    officeLocations = json.data.map(o => ({ ...o, lat: parseFloat(o.lat), lng: parseFloat(o.lng), radius: parseInt(o.radius, 10) }));
                } else {
                    officeLocations = [];
                }
            } catch (err) {
                // Backend belum terhubung / offline. Fallback: validasi jarak dinonaktifkan
                // sampai koneksi ke backend-php pulih (staff tetap tidak bisa absen kalau
                // backend down, karena submitAbsen() mewajibkan panggilan ke server).
                officeLocations = [];
                console.error('Gagal memuat lokasi kantor dari backend:', err);
            }
            return officeLocations;
        }

        // Rumus Haversine: menghitung jarak (meter) antara dua titik koordinat GPS.
        // Dipakai di sisi client HANYA untuk preview UI (indikator jarak real-time ke
        // staff). Perhitungan yang menentukan sah/tidaknya absen ada di server (PHP).
        function hitungJarakMeter(lat1, lng1, lat2, lng2) {
            const R = 6371000; // radius bumi (meter)
            const toRad = (d) => d * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // Cari kantor/cabang TERDEKAT dari titik (lat,lng) di antara seluruh kantor terdaftar.
        // Mengembalikan null kalau Admin belum mendaftarkan satupun kantor.
        function findNearestOffice(lat, lng) {
            if (!officeLocations.length) return null;
            let nearest = null;
            officeLocations.forEach(office => {
                const dist = hitungJarakMeter(lat, lng, office.lat, office.lng);
                if (!nearest || dist < nearest.distance) {
                    nearest = { office, distance: Math.round(dist), valid: dist <= office.radius };
                }
            });
            return nearest;
        }

        // Akurasi GPS minimal yang diwajibkan (meter). Kalau akurasi device lebih buruk
        // (angka lebih besar) dari ini, absen ditolak dan user diminta pindah ke area terbuka.
        const GPS_ACCURACY_THRESHOLD_METER = 75;
        let currentNearestOffice = null;
        let currentGPSAccuracy = null;
        let currentGPSSuspicious = false; // indikasi kemungkinan Fake GPS / Mock Location

        // ================== KEAMANAN LOGIN (ANTI BRUTE-FORCE) ==================
        // Struktur per-username: { failCount, banUntil, banStage, permaBanned }
        let loginSecurity = JSON.parse(localStorage.getItem('absensi_security')) || {};
        function saveSecurity() { localStorage.setItem('absensi_security', JSON.stringify(loginSecurity)); }

        // Staff biasa: lebih ketat. Admin/HRD: diberi kelonggaran (threshold lebih tinggi, tanpa banned permanen).
        const SECURITY_RULES = {
            staff: { maxAttempt: 3, baseBanSeconds: 30, escalate: true, permaAfterStage: 3 },
            leniency: { maxAttempt: 5, baseBanSeconds: 15, escalate: false, permaAfterStage: Infinity } // admin & hrd
        };

        function getSecKey(username) { return (username || '').trim().toLowerCase(); }

        function getRuleForUsername(uInput) {
            const u = users.find(x => x.username.toLowerCase() === uInput.toLowerCase() || x.id.toLowerCase() === uInput.toLowerCase());
            if (u && (u.role === 'admin' || u.role === 'hrd')) return SECURITY_RULES.leniency;
            return SECURITY_RULES.staff;
        }

        // ================== SURAT DOKTER: FILE READER HELPER ==================
        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // MASA KERJA
        function hitungMasaKerja(tglMasukStr) {
            if (!tglMasukStr) return "-";
            const masuk = new Date(tglMasukStr);
            const sekarang = new Date();
            let tahun = sekarang.getFullYear() - masuk.getFullYear();
            let bulan = sekarang.getMonth() - masuk.getMonth();
            if (bulan < 0) { tahun--; bulan += 12; }
            let hasil = [];
            if (tahun > 0) hasil.push(`${tahun} Thn`);
            if (bulan > 0 || tahun === 0) hasil.push(`${bulan} Bln`);
            return hasil.join(' ') || "Baru Masuk";
        }

        // HITUNG DURASI JAM KERJA
        function hitungDurasiKerja(waktuMasuk, waktuPulang) {
            if(!waktuMasuk || !waktuPulang || waktuPulang === '-') return "Sedang Bekerja...";
            
            const [h1, m1] = waktuMasuk.split(':').map(Number);
            const [h2, m2] = waktuPulang.split(':').map(Number);
            
            let totalMenit1 = (h1 * 60) + m1;
            let totalMenit2 = (h2 * 60) + m2;
            
            let selisihMenit = totalMenit2 - totalMenit1;
            if(selisihMenit < 0) return "-";

            let jam = Math.floor(selisihMenit / 60);
            let menit = selisihMenit % 60;

            return `${jam} Jam ${menit} Mnt`;
        }

        document.addEventListener("DOMContentLoaded", () => {
            saveUsersToStorage();
            restoreSessionFromServer(); // cek sesi login ke server (bukan localStorage/sessionStorage lagi), lalu panggil checkSession()
            loadOfficeLocationsFromServer(); // ambil daftar kantor dari backend PHP (bukan localStorage)
            setInterval(updateOverlayTime, 1000);
            setTimeout(loadFaceModels, 800); // preload model AI di background
            setTimeout(initGoogleSignIn, 500); // tunggu script Google Identity Services siap
        });

        function saveUsersToStorage() { localStorage.setItem('absensi_users', JSON.stringify(users)); }
        function saveLogsToStorage() { localStorage.setItem('absensi_logs', JSON.stringify(absensiLogs)); }

        // Toggle lihat/sembunyikan password (icon mata)
        function togglePasswordVisibility(inputId, btn) {
            const input = document.getElementById(inputId);
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }

        function showAlert(msg, type = 'error') {
            const appVisible = !document.getElementById('appWrapper').classList.contains('hidden');
            const el = document.getElementById(appVisible ? 'globalAlertApp' : 'globalAlert');
            el.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-emerald-100', 'text-emerald-700', 'border-red-300', 'border-emerald-300');
            el.classList.add(type === 'error' ? 'bg-red-100' : 'bg-emerald-100', type === 'error' ? 'text-red-700' : 'text-emerald-700', 'border', type === 'error' ? 'border-red-300' : 'border-emerald-300');
            // Semua pesan alert otomatis melewati penerjemah i18n (lihat i18n.js -> translateText).
            // Jika bahasa aktif "id" atau frasa belum ada di kamus EN, teks tetap tampil apa adanya.
            el.innerHTML = (typeof translateText === 'function') ? translateText(msg) : msg;
            setTimeout(() => el.classList.add('hidden'), 5000);
        }

        // ================== JEMBATAN SEMENTARA: gabungkan profil dari server dengan data
        // UI-only yang MASIH tersimpan di localStorage (shift, jatah cuti, tglMasuk, izin
        // ubah password). Ini perlu ada karena fitur manajemen karyawan/shift/cuti belum
        // dipindah ke backend (lihat catatan di ringkasan chat) -- begitu fitur itu sudah
        // dipindah ke database sungguhan, fungsi ini bisa dihapus.
        function mergeLocalProfileFields(serverUser) {
            if (!serverUser) return serverUser;
            const local = users.find(u =>
                (serverUser.username && u.username && u.username.toLowerCase() === serverUser.username.toLowerCase()) ||
                (serverUser.email && u.username && u.username.toLowerCase() === serverUser.email.toLowerCase())
            );
            return {
                ...serverUser,
                shift: (local && local.shift) || 'pagi',
                jatahCuti: (local && typeof local.jatahCuti !== 'undefined') ? local.jatahCuti : 12,
                tglMasuk: (local && local.tglMasuk) || new Date().toISOString().split('T')[0],
                allowChangePassword: local ? !!local.allowChangePassword : false,
            };
        }

        // ================== LOGIN (SEKARANG BENERAN KE SERVER, BUKAN localStorage) ==================
        // Akun & rate-limiting percobaan gagal sekarang murni ditentukan oleh backend
        // (auth.php + tabel users/login_attempts di MySQL), supaya akun yang sama bisa
        // dipakai login dari perangkat MANAPUN, dan supaya lockout tidak bisa dilewati
        // hanya dengan clear localStorage di browser client.
        async function handleLogin(e) {
            e.preventDefault();
            const kodePerusahaan = document.getElementById('loginCompanyCode').value.trim();
            const uInput = document.getElementById('loginUser').value.trim();
            const pInput = document.getElementById('loginPass').value;
            if (!kodePerusahaan || !uInput || !pInput) return;

            const btnSubmit = e.target.querySelector('button[type="submit"]');
            if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.dataset.originalHtml = btnSubmit.innerHTML; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memeriksa akun...'; }

            let result;
            try {
                const res = await fetch(`${API_BASE_URL}/auth.php?action=login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kode_perusahaan: kodePerusahaan, username: uInput, password: pInput })
                });
                result = await res.json();
            } catch (err) {
                if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = btnSubmit.dataset.originalHtml; }
                return showAlert('<b>Gagal terhubung ke server.</b> Pastikan backend PHP aktif dan API_BASE_URL sudah benar.', 'error');
            }

            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = btnSubmit.dataset.originalHtml; }

            if (!result.success) {
                return showAlert(`<b>${result.message}</b>`, 'error');
            }

            currentUser = mergeLocalProfileFields(result.data); // { id, nama, jabatan, email, role, must_change_password } + field UI-only dari localStorage
            showAlert(`Selamat datang kembali, <b>${currentUser.nama}</b>!`, 'success');
            checkSession();
        }

        // Dipanggil sekali saat halaman dimuat: cek ke server apakah sesi login
        // (cookie PHP session) masih aktif, supaya refresh halaman tidak selalu
        // melempar user ke layar login walau sebenarnya masih login.
        async function restoreSessionFromServer() {
            try {
                const res = await fetch(`${API_BASE_URL}/auth.php?action=me`, { credentials: 'include' });
                if (!res.ok) { currentUser = null; return checkSession(); }
                const result = await res.json();
                currentUser = result.success ? mergeLocalProfileFields(result.data) : null;
            } catch (err) {
                currentUser = null;
            }
            checkSession();
        }

        // ================== MODAL PEMULIHAN AKUN (BANNED PERMANEN) ==================
        function openAccountLockedModal(prefillId) {
            document.getElementById('recoverOldId').value = prefillId || '';
            document.getElementById('recoverNewUsername').value = '';
            document.getElementById('recoverNewPassword').value = '';
            document.getElementById('accountLockedModal').classList.remove('hidden');
        }
        function closeAccountLockedModal() {
            document.getElementById('accountLockedModal').classList.add('hidden');
        }
        function handleAccountRecovery() {
            const oldId = document.getElementById('recoverOldId').value.trim();
            const newUsername = document.getElementById('recoverNewUsername').value.trim();
            const newPassword = document.getElementById('recoverNewPassword').value.trim();

            if (!oldId || !newUsername || !newPassword) return alert('Semua kolom wajib diisi.');
            if (newPassword.length < 4) return alert('Password baru minimal 4 karakter.');

            const u = users.find(x => x.username.toLowerCase() === oldId.toLowerCase() || x.id.toLowerCase() === oldId.toLowerCase());
            if (!u) return alert('ID Staff / Username lama tidak ditemukan.');

            const usernameTaken = users.some(x => x !== u && x.username.toLowerCase() === newUsername.toLowerCase());
            if (usernameTaken) return alert('Username baru sudah digunakan, silakan pilih yang lain.');

            const oldKey = getSecKey(u.username);
            u.username = newUsername;
            u.pass = newPassword;
            saveUsersToStorage();

            // Hapus seluruh riwayat banned untuk akun ini (username lama maupun baru)
            delete loginSecurity[oldKey];
            delete loginSecurity[getSecKey(newUsername)];
            saveSecurity();

            closeAccountLockedModal();
            showAlert('Akun berhasil dipulihkan! Silakan login dengan username & password baru Anda.', 'success');
        }

        // Admin: reset paksa status keamanan login user tertentu (kelonggaran untuk Admin/HRD & bantu staff terkunci)
        function resetUserSecurity(username) {
            const key = getSecKey(username);
            if (!loginSecurity[key]) { showAlert('Tidak ada riwayat blokir untuk user ini.'); return; }
            delete loginSecurity[key];
            saveSecurity();
            renderAdminUsers();
            showAlert(`Status keamanan login untuk <b>${username}</b> berhasil direset.`, 'success');
        }

        async function logout() {
            try {
                await fetch(`${API_BASE_URL}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
            } catch (err) {
                // Tetap lanjut logout di sisi client walau request ke server gagal (mis. offline),
                // supaya user tidak "terjebak" di halaman aplikasi.
            }
            currentUser = null;
            stopCamera();
            checkSession();
            showAlert('Anda telah keluar dari sistem.', 'success');
        }

        function checkSession() {
            const authWrap = document.getElementById('authWrapper');
            const appWrap = document.getElementById('appWrapper');
            const karySec = document.getElementById('karyawanSection');
            const hrdSec = document.getElementById('hrdSection');
            const admSec = document.getElementById('adminSection');
            const shiftSec = document.getElementById('shiftMasterSection');
            const lokasiSec = document.getElementById('lokasiKantorSection');

            const btnPanel = document.getElementById('btnTabPanel');
            const btnVerif = document.getElementById('btnTabVerifikasi');
            const btnShiftMaster = document.getElementById('btnTabShiftMaster');
            const btnUsers = document.getElementById('btnTabUsers');
            const btnLokasi = document.getElementById('btnTabLokasi');
            const btnKalender = document.getElementById('btnTabKalender');
            const btnPwReq = document.getElementById('btnTabPassReq');
            const masterLabel = document.getElementById('masterDataLabel');
            const kalenderSec = document.getElementById('kalenderSection');
            const pwReqSec = document.getElementById('passReqSection');

            karySec.classList.add('hidden');
            hrdSec.classList.add('hidden');
            admSec.classList.add('hidden');
            shiftSec.classList.add('hidden');
            lokasiSec.classList.add('hidden');
            if (kalenderSec) kalenderSec.classList.add('hidden');
            if (pwReqSec) pwReqSec.classList.add('hidden');
            btnPanel.classList.add('hidden');
            btnVerif.classList.add('hidden');
            btnShiftMaster.classList.add('hidden');
            btnUsers.classList.add('hidden');
            btnLokasi.classList.add('hidden');
            if (btnKalender) btnKalender.classList.add('hidden');
            if (btnPwReq) btnPwReq.classList.add('hidden');
            masterLabel.classList.add('hidden');

            if(!currentUser) {
                authWrap.classList.remove('hidden');
                appWrap.classList.add('hidden');
                return;
            }

            authWrap.classList.add('hidden');
            appWrap.classList.remove('hidden');
            document.getElementById('navUserName').innerText = currentUser.nama;
            document.getElementById('navUserRole').innerText = roleLabel(currentUser.role);

            if(currentUser.role === 'staff' || currentUser.role === 'magang') {
                switchMainTab('absen');
            } else if(currentUser.role === 'hrd') {
                btnPanel.classList.remove('hidden');
                btnVerif.classList.remove('hidden');
                if (btnKalender) btnKalender.classList.remove('hidden');
                if (btnPwReq) btnPwReq.classList.remove('hidden');
                document.getElementById('lblTabPanelIcon').className = "fa-solid fa-chart-line w-4";
                document.getElementById('lblTabPanelText').innerText = "Monitoring & Rekap HRD";
                switchMainTab('absen');
            } else if(currentUser.role === 'admin') {
                btnPanel.classList.remove('hidden');
                btnVerif.classList.remove('hidden');
                btnShiftMaster.classList.remove('hidden');
                btnUsers.classList.remove('hidden');
                btnLokasi.classList.remove('hidden');
                if (btnKalender) btnKalender.classList.remove('hidden');
                if (btnPwReq) btnPwReq.classList.remove('hidden');
                masterLabel.classList.remove('hidden');
                document.getElementById('lblTabPanelIcon').className = "fa-solid fa-users-gear w-4";
                document.getElementById('lblTabPanelText').innerText = "Kelola User & Admin";
                switchMainTab('absen');
            }
            updateSuratPendingBadge();
            updatePwReqBadge();
        }

        // Badge notifikasi jumlah surat dokter yang menunggu verifikasi (di tab HRD/Admin)
        function updateSuratPendingBadge() {
            const badge = document.getElementById('badgeSuratPending');
            if (!badge) return;
            const pendingCount = absensiLogs.filter(l => l.status === 'Sakit' && l.statusVerifikasi === 'Menunggu Verifikasi').length;
            if (pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        function setupKaryawanView() {
            document.getElementById('ovNama').innerText = "Nama: " + currentUser.nama;
            document.getElementById('ovId').innerText = "ID: " + currentUser.id;
            document.getElementById('ovJabatan').innerText = "Jabatan: " + currentUser.jabatan;
            document.getElementById('myMasaKerja').innerText = hitungMasaKerja(currentUser.tglMasuk);

            // Tampilkan jam masuk/pulang sesuai shift staff yang login
            const shiftCfg = getShiftConfig(currentUser);
            document.getElementById('myJamMasukLabel').innerText = shiftCfg.labelMasuk;
            document.getElementById('myJamPulangLabel').innerText = shiftCfg.labelPulang;
            document.getElementById('myShiftLabel').innerText = shiftCfg.label;

            renderMyStats();
            renderMyPasswordCard();
            // Pastikan field Kategori Izin & Tanggal Mulai/Selesai langsung tampil
            // sesuai pilihan default dropdown "Jenis Keterangan" (bug: sebelumnya
            // baru muncul setelah user mengubah pilihan secara manual).
            toggleUploadSurat();
        }

        function switchMainTab(tab) {
            const karySec = document.getElementById('karyawanSection');
            const hrdSec = document.getElementById('hrdSection');
            const admSec = document.getElementById('adminSection');
            const verSec = document.getElementById('verifikasiSection');
            const shiftSec = document.getElementById('shiftMasterSection');
            const lokasiSec = document.getElementById('lokasiKantorSection');
            const kalenderSec = document.getElementById('kalenderSection');
            const pwReqSec = document.getElementById('passReqSection');
            const allBtns = ['btnTabAbsen','btnTabPanel','btnTabVerifikasi','btnTabShiftMaster','btnTabUsers','btnTabLokasi','btnTabKalender','btnTabPassReq'].map(id => document.getElementById(id)).filter(Boolean);

            karySec.classList.add('hidden');
            hrdSec.classList.add('hidden');
            admSec.classList.add('hidden');
            verSec.classList.add('hidden');
            shiftSec.classList.add('hidden');
            lokasiSec.classList.add('hidden');
            if (kalenderSec) kalenderSec.classList.add('hidden');
            if (pwReqSec) pwReqSec.classList.add('hidden');
            allBtns.forEach(b => b.classList.remove('active'));

            if (tab === 'absen') {
                karySec.classList.remove('hidden');
                document.getElementById('btnTabAbsen').classList.add('active');
                setupKaryawanView();
            } else if (tab === 'verifikasi') {
                verSec.classList.remove('hidden');
                document.getElementById('btnTabVerifikasi').classList.add('active');
                renderVerifikasiSurat();
            } else if (tab === 'shiftmaster') {
                shiftSec.classList.remove('hidden');
                document.getElementById('btnTabShiftMaster').classList.add('active');
                renderShiftMasterTable();
            } else if (tab === 'users') {
                admSec.classList.remove('hidden');
                document.getElementById('btnTabUsers').classList.add('active');
                renderAdminUsers();
            } else if (tab === 'lokasikantor') {
                lokasiSec.classList.remove('hidden');
                document.getElementById('btnTabLokasi').classList.add('active');
                renderLokasiKantorForm();
            } else if (tab === 'kalender') {
                if (kalenderSec) kalenderSec.classList.remove('hidden');
                document.getElementById('btnTabKalender').classList.add('active');
                renderIzinCalendar('kalender', kalenderViewDate, true);
            } else if (tab === 'passreq') {
                if (pwReqSec) pwReqSec.classList.remove('hidden');
                document.getElementById('btnTabPassReq').classList.add('active');
                renderPasswordRequests();
            } else {
                document.getElementById('btnTabPanel').classList.add('active');
                if (currentUser.role === 'hrd') {
                    hrdSec.classList.remove('hidden');
                    renderTable();
                } else if (currentUser.role === 'admin') {
                    admSec.classList.remove('hidden');
                    renderAdminUsers();
                }
            }
        }

        // ================== FLOW REGISTRASI (LANDING PAGE ONBOARDING) ==================
        // ================== GOOGLE SIGN-IN ASLI (Google Identity Services) ==================
        // PENTING: Ganti nilai di bawah dengan Client ID milik Anda dari https://console.cloud.google.com/apis/credentials
        // Client ID hanya aktif untuk domain yang sudah didaftarkan di "Authorized JavaScript origins".
        const GOOGLE_CLIENT_ID = "GANTI_DENGAN_CLIENT_ID_ANDA.apps.googleusercontent.com";

        function handleGoogleLoginClick() {
            if (GOOGLE_CLIENT_ID.startsWith('GANTI_DENGAN')) {
                showAlert('<b>Login Google belum dikonfigurasi.</b> Admin perlu memasang Google Client ID (lihat komentar GOOGLE_CLIENT_ID di kode) agar tombol ini aktif.');
                return;
            }
            if (typeof google === 'undefined' || !google.accounts) {
                showAlert('Layanan Google sedang tidak dapat dimuat. Periksa koneksi internet Anda dan coba lagi.');
                return;
            }
            google.accounts.id.prompt(); // Munculkan One Tap / popup akun Google resmi
        }

        function initGoogleSignIn() {
            if (GOOGLE_CLIENT_ID.startsWith('GANTI_DENGAN')) return;
            if (typeof google === 'undefined' || !google.accounts) return;
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleCredentialResponse
            });
        }

        // Dipanggil Google setelah user berhasil login & memberi izin (menerima JWT ID Token asli dari Google)
        function handleGoogleCredentialResponse(response) {
            try {
                const payload = JSON.parse(atob(response.credential.split('.')[1])); // decode JWT payload (email, nama, dsb)
                const email = payload.email;
                const nama = payload.name || email;

                let found = users.find(u => u.username.toLowerCase() === email.toLowerCase());
                if (!found) {
                    // Akun Google belum terdaftar di sistem -> buat akun staff baru otomatis
                    found = {
                        id: "GGL-" + Date.now().toString().slice(-6),
                        nama: nama,
                        jabatan: "Staff Baru",
                        tglMasuk: new Date().toISOString().split('T')[0],
                        username: email,
                        pass: null, // Login via Google, tanpa password lokal
                        role: "staff",
                        shift: "pagi",
                        viaGoogle: true
                    };
                    users.push(found);
                    saveUsersToStorage();
                }

                currentUser = found;
                showAlert(`Berhasil masuk dengan Google sebagai <b>${currentUser.nama}</b>!`, 'success');
                // CATATAN: Login Google ini masih memakai akun localStorage lama, BELUM terhubung
                // ke sesi server (auth.php) atau ke sistem company_id yang baru. Jika dipakai,
                // fitur absen (yang mewajibkan sesi server) akan gagal untuk user yang masuk lewat sini.
                checkSession();
            } catch (err) {
                console.error('Gagal memproses login Google:', err);
                showAlert('Gagal memproses data akun Google. Silakan coba lagi.');
            }
        }

        let regSelectedBidang = null;
        let pendingRegistration = null; // Data akun sementara sebelum OTP diverifikasi
        let pendingOtpCode = null;
        let otpExpireAt = 0;
        let otpResendCooldownTimer = null;

        function showRegisterFlow() {
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('registerSection').classList.remove('hidden');
            goRegStep(1);
        }
        function backToLoginFromRegister() {
            document.getElementById('registerSection').classList.add('hidden');
            document.getElementById('loginSection').classList.remove('hidden');
            regSelectedBidang = null;
            pendingRegistration = null;
            pendingOtpCode = null;
            ['regStep1','regStep2','regStep3','regStep4'].forEach(id => document.getElementById(id).classList.add('hidden'));
            document.getElementById('regStep5').classList.add('hidden');
            document.getElementById('regStep1').classList.remove('hidden');
            document.getElementById('btnBidangNext').disabled = true;
            document.getElementById('btnBidangNext').className = "mt-6 w-full bg-slate-300 text-white font-semibold py-2.5 rounded-lg text-sm transition cursor-not-allowed";
            document.querySelectorAll('.bidang-opt').forEach(el => el.classList.remove('border-blue-500','bg-blue-50'));
            document.querySelectorAll('.otp-digit').forEach(el => el.value = '');
            if (otpResendCooldownTimer) clearInterval(otpResendCooldownTimer);
        }
        function selectBidang(nama, iconClass) {
            regSelectedBidang = nama;
            document.querySelectorAll('.bidang-opt').forEach(el => el.classList.remove('border-blue-500','bg-blue-50'));
            event.currentTarget.classList.add('border-blue-500','bg-blue-50');
            const btn = document.getElementById('btnBidangNext');
            btn.disabled = false;
            btn.className = "mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition";
        }
        function goRegStep(step) {
            [1,2,3,4,5].forEach(n => {
                document.getElementById('regStep'+n).classList.toggle('hidden', n !== step);
                const dot = document.getElementById('stepDot'+n).firstElementChild;
                if (n < step) { dot.className = "w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 text-white"; dot.innerHTML = '<i class="fa-solid fa-check text-xs"></i>'; }
                else if (n === step) { dot.className = "w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 text-white"; dot.innerText = n; }
                else { dot.className = "w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 text-slate-500"; dot.innerText = n; }
            });
            if (step === 2) {
                document.querySelectorAll('input[name="paket"]').forEach(r => {
                    r.onchange = () => document.getElementById('paketNamaLabel').innerText = r.value;
                });
            }
            if (step === 4) {
                const firstDigit = document.querySelector('#otpInputGroup .otp-digit');
                if (firstDigit) setTimeout(() => firstDigit.focus(), 100);
            }
        }
        function handleRegisterSubmit(e) {
            e.preventDefault();
            const company = document.getElementById('regCompany').value.trim();
            const companyCode = document.getElementById('regCompanyCode').value.trim().toUpperCase();
            const email = document.getElementById('regEmail').value.trim();
            const pass = document.getElementById('regPassword').value;
            const passConfirm = document.getElementById('regPasswordConfirm').value;
            const wa = document.getElementById('regWhatsapp').value.trim();

            if (!/^[A-Z0-9\-]{3,30}$/.test(companyCode)) { alert('Kode perusahaan harus 3-30 karakter, huruf/angka/strip saja.'); return; }
            if (pass !== passConfirm) { alert('Konfirmasi password tidak cocok.'); return; }
            if (pass.length < 8) { alert('Password minimal 8 karakter.'); return; }

            // Data akun disimpan sementara di memori -> baru benar-benar dibuat DI SERVER
            // setelah OTP email terverifikasi (lihat handleVerifyOtp).
            pendingRegistration = {
                nama_perusahaan: company,
                kode_perusahaan: companyCode,
                nama: company + " Admin",
                username: email,
                email: email,
                password: pass,
                bidang: regSelectedBidang,
                whatsapp: wa
            };

            document.getElementById('otpTargetEmail').innerText = email;
            goRegStep(4);
            sendOtpToEmail(email);
        }

        // ================== VERIFIKASI OTP EMAIL (STEP 4 REGISTRASI) — VIA RESEND (backend PHP) ==================
        // Pengiriman TIDAK lagi dilakukan langsung dari browser (seperti EmailJS sebelumnya).
        // API key Resend adalah secret dan hanya boleh dipakai di server -> lihat send_otp.php.
        // app.js di sini hanya memanggil endpoint backend tersebut.

        function generateOtpCode() {
            return String(Math.floor(100000 + Math.random() * 900000));
        }

        async function sendOtpToEmail(email) {
            pendingOtpCode = generateOtpCode();
            otpExpireAt = Date.now() + (5 * 60 * 1000); // berlaku 5 menit
            document.getElementById('otpErrorMsg').classList.add('hidden');
            document.querySelectorAll('.otp-digit').forEach(el => el.value = '');

            const devNote = document.getElementById('otpDevNote');
            const devCode = document.getElementById('otpDevCode');
            const sendBtn = document.querySelector('#regStep4 button[type="submit"]');

            const waktuKedaluwarsa = new Date(otpExpireAt).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });

            devNote.classList.add('hidden');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.innerText = 'Mengirim OTP...'; }

            try {
                const res = await fetch('send_otp.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email,
                        otp: pendingOtpCode,
                        expires_at: waktuKedaluwarsa
                    })
                });
                const result = await res.json();

                if (!res.ok || !result.success) {
                    throw new Error(result.message || 'Gagal mengirim email OTP.');
                }

                showAlert(`Kode OTP telah dikirim ke <b>${email}</b>. Cek inbox (atau folder spam) email Anda. Berlaku hingga <b>${waktuKedaluwarsa}</b>.`, 'success');
                startOtpResendCooldown();
            } catch (err) {
                console.error('Gagal mengirim OTP via Resend:', err);
                // Fallback: tampilkan kode di layar supaya pendaftaran tetap bisa dilanjutkan meski pengiriman email gagal
                devNote.classList.remove('hidden');
                devCode.innerText = pendingOtpCode;
                showAlert('Gagal mengirim email OTP (periksa konfigurasi Resend di server). Kode OTP sementara ditampilkan di layar agar Anda tetap bisa lanjut.');
                startOtpResendCooldown();
            } finally {
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerText = 'Verifikasi & Selesaikan Pendaftaran'; }
            }
        }

        function resendOtp() {
            if (!pendingRegistration) return;
            sendOtpToEmail(pendingRegistration.username);
        }

        function startOtpResendCooldown() {
            let sisa = 30;
            const btn = document.getElementById('btnResendOtp');
            const timerLabel = document.getElementById('otpResendTimer');
            btn.classList.add('pointer-events-none', 'opacity-40');
            if (otpResendCooldownTimer) clearInterval(otpResendCooldownTimer);
            timerLabel.innerText = `(${sisa}s)`;
            otpResendCooldownTimer = setInterval(() => {
                sisa--;
                if (sisa <= 0) {
                    clearInterval(otpResendCooldownTimer);
                    btn.classList.remove('pointer-events-none', 'opacity-40');
                    timerLabel.innerText = '';
                } else {
                    timerLabel.innerText = `(${sisa}s)`;
                }
            }, 1000);
        }

        async function handleVerifyOtp(e) {
            e.preventDefault();
            const digits = Array.from(document.querySelectorAll('#otpInputGroup .otp-digit')).map(el => el.value.trim());
            const inputCode = digits.join('');
            const errEl = document.getElementById('otpErrorMsg');
            errEl.classList.add('hidden');

            if (inputCode.length < 6) {
                errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i>Mohon isi seluruh 6 digit kode OTP.';
                errEl.classList.remove('hidden');
                return;
            }
            if (Date.now() > otpExpireAt) {
                errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i>Kode OTP sudah kedaluwarsa. Silakan kirim ulang.';
                errEl.classList.remove('hidden');
                return;
            }
            if (inputCode !== pendingOtpCode) {
                errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i>Kode OTP salah. Periksa kembali email Anda.';
                errEl.classList.remove('hidden');
                return;
            }
            if (!pendingRegistration) {
                errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i>Sesi pendaftaran hilang, silakan ulangi dari awal.';
                errEl.classList.remove('hidden');
                return;
            }

            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.originalHtml = submitBtn.innerHTML; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Membuat akun...'; }

            // OTP valid di sisi client -> BARU SEKARANG perusahaan & akun admin
            // benar-benar dibuat di server (auth.php?action=register), bukan
            // sekadar push ke array localStorage seperti sebelumnya.
            let result;
            try {
                const res = await fetch(`${API_BASE_URL}/auth.php?action=register`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        kode_perusahaan: pendingRegistration.kode_perusahaan,
                        nama_perusahaan: pendingRegistration.nama_perusahaan,
                        nama: pendingRegistration.nama,
                        username: pendingRegistration.username,
                        email: pendingRegistration.email,
                        password: pendingRegistration.password,
                    })
                });
                result = await res.json();
            } catch (err) {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = submitBtn.dataset.originalHtml; }
                errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i>Gagal terhubung ke server. Periksa koneksi lalu coba lagi.';
                errEl.classList.remove('hidden');
                return;
            }

            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = submitBtn.dataset.originalHtml; }

            if (!result.success) {
                errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i>${result.message}`;
                errEl.classList.remove('hidden');
                return;
            }

            const finishCodeEl = document.getElementById('finishCompanyCode');
            if (finishCodeEl) finishCodeEl.innerText = result.data.kode_perusahaan;

            pendingRegistration = null;
            pendingOtpCode = null;
            if (otpResendCooldownTimer) clearInterval(otpResendCooldownTimer);
            goRegStep(5);
        }

        // Navigasi otomatis antar kotak OTP (ketik maju, backspace mundur)
        document.addEventListener('input', (e) => {
            if (!e.target.classList.contains('otp-digit')) return;
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
            if (e.target.value && e.target.nextElementSibling && e.target.nextElementSibling.classList.contains('otp-digit')) {
                e.target.nextElementSibling.focus();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (!e.target.classList.contains('otp-digit')) return;
            if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling && e.target.previousElementSibling.classList.contains('otp-digit')) {
                e.target.previousElementSibling.focus();
            }
        });

        // ================== AI FACE RECOGNITION (face-api.js) ==================
        // Model dimuat dari CDN: TinyFaceDetector (deteksi wajah) + FaceLandmark68Tiny (titik wajah, untuk cek oklusi)
        const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        let faceModelsLoaded = false;
        let faceModelsLoading = false;
        let faceCheckInterval = null;
        let brightnessCanvas = document.createElement('canvas');

        // Status live hasil analisa AI, dipakai untuk gating tombol Absen Masuk/Pulang
        let faceState = { faceDetected: false, occluded: true, wellLit: false, score: 0 };

        async function loadFaceModels() {
            if (faceModelsLoaded || faceModelsLoading) return;
            faceModelsLoading = true;
            try {
                if (typeof faceapi === 'undefined') {
                    // Script CDN belum siap (defer), coba lagi sesaat lagi
                    faceModelsLoading = false;
                    setTimeout(loadFaceModels, 500);
                    return;
                }
                await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
                await faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL);
                faceModelsLoaded = true;
                const badge = document.getElementById('badgeModel');
                if (badge) badge.innerHTML = '<i class="fa-solid fa-microchip mr-1"></i>Model AI: Siap';
            } catch (err) {
                const badge = document.getElementById('badgeModel');
                if (badge) badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i>Model AI Gagal Dimuat';
                console.error('Gagal memuat model face-api:', err);
            } finally {
                faceModelsLoading = false;
            }
        }

        let mediaStream = null;
        function startCamera() {
            const video = document.getElementById('webcam');
            const placeholder = document.getElementById('cameraPlaceholder');
            const overlay = document.getElementById('cameraOverlayInfo');
            const aiBar = document.getElementById('aiStatusBar');
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    mediaStream = stream;
                    video.srcObject = stream;
                    placeholder.classList.add('hidden');
                    overlay.classList.remove('hidden');
                    aiBar.classList.remove('hidden');
                    document.getElementById('btnOpenCamera').classList.add('hidden');
                    document.getElementById('btnCloseCamera').classList.remove('hidden');
                    loadFaceModels();
                    if (faceCheckInterval) clearInterval(faceCheckInterval);
                    faceCheckInterval = setInterval(runFaceAnalysis, 700);
                })
                .catch(err => showAlert('Gagal mengakses kamera: ' + err.message));
        }

        // Matikan kamera sepenuhnya (stop track fisik) + kembalikan tampilan seperti semula, tanpa perlu refresh halaman
        function stopCamera() {
            const video = document.getElementById('webcam');
            const placeholder = document.getElementById('cameraPlaceholder');
            const overlay = document.getElementById('cameraOverlayInfo');
            const aiBar = document.getElementById('aiStatusBar');
            const btnOpen = document.getElementById('btnOpenCamera');
            const btnClose = document.getElementById('btnCloseCamera');

            if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
            if (video) video.srcObject = null; // lepaskan referensi stream dari elemen video
            if (faceCheckInterval) { clearInterval(faceCheckInterval); faceCheckInterval = null; }
            faceState = { faceDetected: false, occluded: true, wellLit: false, score: 0 };

            if (placeholder) placeholder.classList.remove('hidden');
            if (overlay) overlay.classList.add('hidden');
            if (aiBar) aiBar.classList.add('hidden');
            if (btnOpen) btnOpen.classList.remove('hidden');
            if (btnClose) btnClose.classList.add('hidden');
        }

        // Dipanggil dari tombol "Matikan Kamera" (aksi manual oleh staff)
        function stopCameraManual() {
            stopCamera();
            showAlert('Kamera berhasil dimatikan. Klik "Buka Kamera" lagi saat ingin absen.', 'success');
        }

        // Hitung tingkat kecerahan rata-rata frame kamera (0-255) untuk deteksi Light Detection
        function measureBrightness(video) {
            const w = 48, h = 36;
            brightnessCanvas.width = w; brightnessCanvas.height = h;
            const ctx = brightnessCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);
            let data;
            try { data = ctx.getImageData(0, 0, w, h).data; } catch(e) { return 128; }
            let total = 0;
            for (let i = 0; i < data.length; i += 4) {
                // Luminance perceptual
                total += (0.299 * data[i]) + (0.587 * data[i+1]) + (0.114 * data[i+2]);
            }
            return total / (data.length / 4);
        }

        function setAiBadge(id, text, colorClass) {
            const el = document.getElementById(id);
            if (!el) return;
            el.className = `text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm ${colorClass}`;
            el.innerHTML = text;
        }

        async function runFaceAnalysis() {
            const video = document.getElementById('webcam');
            if (!mediaStream || !video || video.readyState < 2) return;

            // 1. LIGHT DETECTION
            const brightness = measureBrightness(video);
            if (brightness < 55) {
                faceState.wellLit = false;
                setAiBadge('badgeLight', '<i class="fa-solid fa-moon mr-1"></i>Cahaya: Terlalu Gelap', 'bg-red-600/85 text-white');
            } else if (brightness > 210) {
                faceState.wellLit = false;
                setAiBadge('badgeLight', '<i class="fa-solid fa-sun mr-1"></i>Cahaya: Terlalu Terang', 'bg-red-600/85 text-white');
            } else {
                faceState.wellLit = true;
                setAiBadge('badgeLight', '<i class="fa-solid fa-sun mr-1"></i>Cahaya: Baik', 'bg-emerald-600/85 text-white');
            }

            // 2. MODEL BELUM SIAP
            if (!faceModelsLoaded) {
                setAiBadge('badgeModel', '<i class="fa-solid fa-microchip mr-1"></i>Memuat Model AI...', 'bg-slate-700/85 text-slate-200');
                setAiBadge('badgeFace', '<i class="fa-solid fa-face-viewfinder mr-1"></i>Wajah: Menunggu Model', 'bg-slate-700/85 text-slate-200');
                setAiBadge('badgeOcclusion', '<i class="fa-solid fa-mask mr-1"></i>Oklusi: -', 'bg-slate-700/85 text-slate-200');
                faceState.faceDetected = false;
                faceState.occluded = true;
                return;
            }
            setAiBadge('badgeModel', '<i class="fa-solid fa-microchip mr-1"></i>Model AI: Aktif', 'bg-slate-700/85 text-slate-200');

            // 3. FACE DETECTION + LANDMARK (untuk estimasi OKLUSI)
            try {
                const detection = await faceapi
                    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
                    .withFaceLandmarks(true);

                if (!detection) {
                    faceState.faceDetected = false;
                    faceState.occluded = true;
                    faceState.score = 0;
                    setAiBadge('badgeFace', '<i class="fa-solid fa-face-viewfinder mr-1"></i>Wajah: Tidak Terdeteksi', 'bg-red-600/85 text-white');
                    setAiBadge('badgeOcclusion', '<i class="fa-solid fa-mask mr-1"></i>Oklusi: -', 'bg-slate-700/85 text-slate-200');
                    return;
                }

                faceState.faceDetected = true;
                faceState.score = detection.detection.score;
                setAiBadge('badgeFace', `<i class="fa-solid fa-face-viewfinder mr-1"></i>Wajah: Terdeteksi (${Math.round(faceState.score*100)}%)`, 'bg-emerald-600/85 text-white');

                // Estimasi oklusi: skor confidence rendah / bbox terlalu kecil biasanya karena wajah tertutup (masker, tangan, topi, dsb)
                const box = detection.detection.box;
                const relativeArea = (box.width * box.height) / (video.videoWidth * video.videoHeight || 1);
                const lowConfidence = faceState.score < 0.6;
                const tooSmall = relativeArea < 0.03;

                if (lowConfidence || tooSmall) {
                    faceState.occluded = true;
                    setAiBadge('badgeOcclusion', '<i class="fa-solid fa-mask mr-1"></i>Oklusi: Wajah Tertutup/Kurang Jelas', 'bg-red-600/85 text-white');
                } else {
                    faceState.occluded = false;
                    setAiBadge('badgeOcclusion', '<i class="fa-solid fa-mask mr-1"></i>Oklusi: Wajah Terlihat Jelas', 'bg-emerald-600/85 text-white');
                }
            } catch (err) {
                console.error('Face analysis error:', err);
            }
        }

        function updateOverlayTime() {
            const el = document.getElementById('ovTime');
            if(el) { el.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>${new Date().toLocaleTimeString(appLocale())}`; }
        }

        // Menerapkan hasil koordinat (baik dari GPS otomatis maupun input manual) ke state
        // absen & tampilan, termasuk perhitungan jarak/validasi radius kantor (geofencing).
        // Dipusatkan di satu fungsi supaya perilaku GPS otomatis dan manual selalu konsisten.
        function applyGPSResult(lat, lng, isManual, accuracy) {
            const addrEl = document.getElementById('gpsAddress');
            currentLat = lat;
            currentLng = lng;
            currentGPSAccuracy = (typeof accuracy === 'number' && !isNaN(accuracy)) ? Math.round(accuracy) : null;

            // Heuristik deteksi Fake GPS / Mock Location: GPS asli hampir tidak pernah
            // melaporkan akurasi persis 0 (atau negatif). Ini BUKAN deteksi 100% pasti —
            // sekadar sinyal tambahan, karena Web Geolocation API tidak punya flag resmi "is mocked".
            currentGPSSuspicious = (!isManual && currentGPSAccuracy !== null && currentGPSAccuracy <= 0);

            let coordText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}` +
                (isManual ? ' (input manual)' : (currentGPSAccuracy !== null ? ` (akurasi ±${currentGPSAccuracy}m)` : ''));

            const nearest = findNearestOffice(lat, lng);
            currentNearestOffice = nearest;

            if (nearest) {
                currentGPSDistance = nearest.distance;
                currentGPSValid = nearest.valid;
                currentGPS = `${coordText} — ${currentGPSDistance}m dari ${nearest.office.nama}`;
                if (addrEl) {
                    addrEl.innerHTML = currentGPS + (currentGPSValid
                        ? ' <span class="text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check mr-0.5"></i>Dalam radius kantor</span>'
                        : ' <span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>Di luar radius kantor</span>');
                }
            } else {
                currentGPSValid = null;
                currentGPSDistance = null;
                currentGPS = coordText;
                if (addrEl) addrEl.innerHTML = currentGPS + ' <span class="text-slate-400">(lokasi kantor belum diatur Admin)</span>';
            }

            if (!isManual && addrEl) {
                if (currentGPSSuspicious) {
                    addrEl.innerHTML += ' <span class="text-red-600 font-bold block mt-1"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>Terindikasi Fake GPS/Mock Location (akurasi tidak wajar). Absen akan ditolak.</span>';
                } else if (currentGPSAccuracy !== null && currentGPSAccuracy > GPS_ACCURACY_THRESHOLD_METER) {
                    addrEl.innerHTML += ` <span class="text-amber-600 font-semibold block mt-1"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>Akurasi GPS rendah (±${currentGPSAccuracy}m). Pindah ke area terbuka / aktifkan GPS akurasi tinggi lalu coba lagi.</span>`;
                }
            }
        }

        function getGPSLocation() {
            const addrEl = document.getElementById('gpsAddress');
            if(!navigator.geolocation) return addrEl.innerText = "Geolocation tidak didukung perangkat/browser ini.";
            addrEl.innerText = "Mendeteksi lokasi GPS...";
            navigator.geolocation.getCurrentPosition(
                pos => {
                    applyGPSResult(pos.coords.latitude, pos.coords.longitude, false, pos.coords.accuracy);
                },
                err => {
                    currentLat = null;
                    currentLng = null;
                    currentGPSValid = null;
                    currentGPSDistance = null;
                    currentNearestOffice = null;
                    currentGPSAccuracy = null;
                    currentGPSSuspicious = false;

                    // Tangani tiap kode error secara spesifik (PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT)
                    let pesan;
                    if (err.code === err.PERMISSION_DENIED) {
                        pesan = 'Izin akses lokasi ditolak. Aktifkan izin lokasi untuk browser/aplikasi ini di pengaturan perangkat, lalu coba lagi.';
                    } else if (err.code === err.POSITION_UNAVAILABLE) {
                        pesan = 'Sinyal GPS tidak tersedia/lemah. Pastikan GPS perangkat aktif dan Anda berada di area terbuka.';
                    } else if (err.code === err.TIMEOUT) {
                        pesan = 'Waktu pencarian lokasi GPS habis (timeout). Coba lagi di area dengan sinyal lebih baik.';
                    } else {
                        pesan = 'Lokasi GPS tidak tersedia (error tidak dikenal).';
                    }
                    currentGPS = "Lokasi GPS tidak tersedia";
                    addrEl.innerHTML = `<span class="text-red-600 font-semibold"><i class="fa-solid fa-circle-xmark mr-1"></i>${pesan}</span> Anda tetap bisa memakai tombol "Input Manual" untuk memasukkan koordinat secara manual.`;
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        }

        // ================== INPUT KOORDINAT GPS MANUAL ==================
        // Fallback untuk staff jika GPS otomatis gagal/lemah sinyal. Koordinat yang
        // dimasukkan tetap divalidasi memakai rumus jarak (Haversine) yang sama seperti
        // GPS otomatis, sehingga koordinat yang jauh dari kantor tetap akan terdeteksi
        // dan ditolak oleh gating di submitAbsen().
        function toggleManualGPS(forceState) {
            const form = document.getElementById('manualGPSForm');
            if (!form) return;
            const shouldShow = typeof forceState === 'boolean' ? forceState : form.classList.contains('hidden');
            form.classList.toggle('hidden', !shouldShow);
        }

        function submitManualGPS() {
            const latInput = document.getElementById('manualLat');
            const lngInput = document.getElementById('manualLng');
            if (!latInput || !lngInput) return;

            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);

            if (isNaN(lat) || lat < -90 || lat > 90) return showAlert('Latitude tidak valid (harus berupa angka antara -90 sampai 90).');
            if (isNaN(lng) || lng < -180 || lng > 180) return showAlert('Longitude tidak valid (harus berupa angka antara -180 sampai 180).');

            applyGPSResult(lat, lng, true);
            toggleManualGPS(false);

            if (currentNearestOffice && currentGPSValid === false) {
                showAlert(`Koordinat manual diterapkan, tapi jaraknya sekitar <b>${currentGPSDistance} meter</b> dari ${currentNearestOffice.office.nama} (di luar radius ${currentNearestOffice.office.radius} meter). Absen akan ditolak sampai koordinat berada dalam radius kantor.`);
            } else {
                showAlert('Koordinat GPS manual berhasil diterapkan.', 'success');
            }
        }

        // LOGIKA ABSEN MASUK & PULANG (LENGKAP DENGAN ANTI-CHEAT)
        async function submitAbsen(tipe) {
            if(!currentUser) return;

            // ================== GATING VERIFIKASI AI FACE RECOGNITION ==================
            if (!mediaStream) {
                return showAlert('<b>Kamera belum dibuka!</b> Klik "Buka Kamera" terlebih dahulu untuk verifikasi wajah.');
            }
            if (!faceModelsLoaded) {
                return showAlert('<b>Model AI masih dimuat.</b> Mohon tunggu beberapa detik lalu coba lagi.');
            }
            if (!faceState.faceDetected) {
                return showAlert('<b>Wajah tidak terdeteksi!</b> Posisikan wajah Anda tepat di depan kamera.');
            }
            if (faceState.occluded) {
                return showAlert('<b>Wajah terhalang!</b> Pastikan wajah tidak tertutup masker/tangan/topi dan terlihat jelas oleh kamera.');
            }
            if (!faceState.wellLit) {
                return showAlert('<b>Pencahayaan kurang mendukung!</b> Sesuaikan pencahayaan ruangan (jangan terlalu gelap/terlalu terang) lalu coba lagi.');
            }

            // ================== GATING LOKASI GPS (VALIDASI GEOFENCING DI SERVER PHP) ==================
            // Koordinat GPS WAJIB sudah terdeteksi, lalu dikirim ke backend PHP. Rumus
            // Haversine dan keputusan akhir tolak/terima dihitung DI SERVER (absen_submit.php),
            // BUKAN di JavaScript ini, supaya tidak bisa dimanipulasi dari sisi client/browser.
            if (currentLat === null || currentLng === null) {
                return showAlert('<b>Lokasi GPS belum terdeteksi!</b> Klik tombol ambil lokasi / izinkan akses lokasi terlebih dahulu.');
            }
            if (currentGPSSuspicious) {
                return showAlert('<b>Terindikasi Fake GPS/Mock Location!</b> Akurasi lokasi tidak wajar. Nonaktifkan aplikasi fake GPS lalu coba lagi memakai GPS asli perangkat.');
            }

            const btnAbsenEl = document.getElementById(tipe === 'Masuk' ? 'btnAbsenMasuk' : 'btnAbsenPulang');
            if (btnAbsenEl) { btnAbsenEl.disabled = true; btnAbsenEl.dataset.originalHtml = btnAbsenEl.innerHTML; btnAbsenEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memvalidasi lokasi...'; }

            let serverResult;
            try {
                const res = await fetch(`${API_BASE_URL}/absen_submit.php`, {
                    method: 'POST',
                    credentials: 'include', // wajib: identitas & perusahaan diambil dari sesi login di server, bukan dari body ini
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tipe: tipe,
                        lat: currentLat,
                        lng: currentLng,
                        accuracy: currentGPSAccuracy
                    })
                });
                if (res.status === 401) {
                    // Sesi habis/tidak valid di server -> paksa balik ke layar login supaya user tidak bingung kenapa absen selalu gagal.
                    logout();
                    return showAlert('<b>Sesi Anda berakhir.</b> Silakan login kembali untuk absen.', 'error');
                }
                serverResult = await res.json();
            } catch (err) {
                if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
                return showAlert('<b>Gagal terhubung ke server validasi lokasi.</b> Periksa koneksi internet Anda lalu coba lagi.', 'error');
            }

            if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }

            if (!serverResult.success) {
                return showAlert(`<b>${serverResult.message}</b>`, 'error');
            }
            // serverResult.data berisi jarak & nama kantor versi resmi (dari server) —
            // dipakai untuk pencatatan lokal di bawah supaya konsisten dengan audit di database.
            currentGPSDistance = serverResult.data && serverResult.data.jarak !== undefined ? serverResult.data.jarak : currentGPSDistance;
            const kantorTervalidasi = serverResult.data ? serverResult.data.kantor : (currentNearestOffice ? currentNearestOffice.office.nama : null);

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const jamNow = now.getHours();
            const menitNow = now.getMinutes();
            const waktuStr = now.toLocaleTimeString(appLocale());
            const shiftCfg = getShiftConfig(currentUser); // Jam masuk/pulang mengikuti shift staff (Pagi/Siang), total tetap 8 jam

            // Cari apakah user sudah pernah absen hari ini
            let existingRecord = absensiLogs.find(l => l.userId === currentUser.id && l.tanggal === todayStr);

            if (tipe === 'Masuk') {
                if (existingRecord) {
                    return showAlert('Anda sudah melakukan Absen Masuk hari ini!', 'error');
                }

                // Terlambat dihitung relatif terhadap jam masuk shift staff (bukan hardcode 08:00)
                const totalMenitNow = (jamNow * 60) + menitNow;
                const batasMenitMasuk = (shiftCfg.jamMasuk * 60) + shiftCfg.menitMasuk + (shiftCfg.toleransi || 0);
                let isLate = totalMenitNow > batasMenitMasuk;
                let status = isLate ? 'Terlambat' : 'Hadir';

                const newLog = {
                    id: Date.now(),
                    userId: currentUser.id,
                    nama: currentUser.nama,
                    jabatan: currentUser.jabatan,
                    tglMasuk: currentUser.tglMasuk,
                    shift: currentUser.shift || 'pagi',
                    status: status,
                    waktuMasuk: waktuStr,
                    waktuPulang: '-',
                    tanggal: todayStr,
                    lokasi: currentGPS,
                    gpsLat: currentLat,
                    gpsLng: currentLng,
                    gpsAccuracy: currentGPSAccuracy,
                    jarakMeter: currentGPSDistance,
                    kantorNama: kantorTervalidasi,
                    kantorId: currentNearestOffice ? currentNearestOffice.office.id : null
                };

                absensiLogs.unshift(newLog);
                saveLogsToStorage();
                showAlert(isLate ? `Terlambat! (Batas masuk Shift ${shiftCfg.label}: ${shiftCfg.labelMasuk}). Tercatat Masuk pukul ${waktuStr}` : `Berhasil Absen Masuk pukul ${waktuStr} (Shift ${shiftCfg.label})`, isLate ? 'error' : 'success');
            
            } else if (tipe === 'Pulang') {
                // VALIDASI LICIK 1: Harus sudah Absen Masuk
                if (!existingRecord) {
                    return showAlert('<b>Gagal Pulang!</b> Anda belum melakukan Absen Masuk hari ini.', 'error');
                }

                // VALIDASI LICIK 2: Sudah Absen Pulang sebelumnya
                if (existingRecord.waktuPulang !== '-') {
                    return showAlert('Anda sudah Absen Pulang untuk hari ini!', 'error');
                }

                // VALIDASI LICIK 3: Jam Pulang Minimal sesuai shift staff (Pagi 16:00 / Siang 21:00), memastikan 8 jam kerja terpenuhi
                const totalMenitNow2 = (jamNow * 60) + menitNow;
                const batasMenitPulang = (shiftCfg.jamPulang * 60) + shiftCfg.menitPulang;
                if (totalMenitNow2 < batasMenitPulang) {
                    return showAlert(`<b>Belum Waktunya Pulang!</b> Absen Pulang Shift ${shiftCfg.label} hanya bisa dilakukan mulai pukul ${shiftCfg.labelPulang}.`, 'error');
                }

                // Update jam pulang record hari ini
                existingRecord.waktuPulang = waktuStr;
                saveLogsToStorage();
                
                const jamKerja = hitungDurasiKerja(existingRecord.waktuMasuk, waktuStr);
                showAlert(`Berhasil Absen Pulang pukul ${waktuStr}. Total Jam Kerja: <b>${jamKerja}</b>`, 'success');
            }

            renderMyStats();
        }

        // Kategori izin tidak masuk (dipakai untuk kalender & rekap HRD/Admin)
        const KATEGORI_IZIN_LABEL = {
            cuti: 'Cuti Tahunan',
            menikah: 'Menikah',
            melahirkan: 'Melahirkan',
            duka: 'Duka / Keluarga',
            libur: 'Libur / Lainnya'
        };

        function toggleUploadSurat() {
            const jenis = document.getElementById('jenisIzin').value;
            const container = document.getElementById('containerUploadSurat');
            const kategoriContainer = document.getElementById('containerKategoriIzin');
            const rangeContainer = document.getElementById('containerTanggalIzin');
            if (jenis === 'Sakit') container.classList.remove('hidden');
            else container.classList.add('hidden');

            if (jenis === 'Izin') {
                kategoriContainer.classList.remove('hidden');
                rangeContainer.classList.remove('hidden');
                const todayStr = new Date().toISOString().split('T')[0];
                if (!document.getElementById('tglMulaiIzin').value) document.getElementById('tglMulaiIzin').value = todayStr;
                if (!document.getElementById('tglSelesaiIzin').value) document.getElementById('tglSelesaiIzin').value = todayStr;
            } else {
                kategoriContainer.classList.add('hidden');
                rangeContainer.classList.add('hidden');
            }
            updateCutiInfoForm();
        }

        // Hitung selisih hari (inklusif) antara 2 tanggal string YYYY-MM-DD
        function hitungJumlahHari(tglMulai, tglSelesai) {
            const d1 = new Date(tglMulai + 'T00:00:00');
            const d2 = new Date(tglSelesai + 'T00:00:00');
            const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            return diff >= 0 ? diff + 1 : 1;
        }

        async function submitIzin(e) {
            e.preventDefault();
            const jenis = document.getElementById('jenisIzin').value;
            const alasan = document.getElementById('alasanIzin').value;
            const fileInput = document.getElementById('fileSuratDokter');
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            let suratDokter = null;
            if (jenis === 'Sakit') {
                const file = fileInput.files[0];
                if (!file) { showAlert('Surat dokter wajib diupload untuk pengajuan Sakit!'); return; }
                if (file.size > 4 * 1024 * 1024) { showAlert('Ukuran file surat dokter maksimal 4MB.'); return; }
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    suratDokter = { name: file.name, type: file.type, dataUrl: dataUrl };
                } catch (err) {
                    showAlert('Gagal membaca file surat dokter.'); return;
                }
            }

            let tglMulai = todayStr, tglSelesai = todayStr, jumlahHari = 1, kategoriIzin = null;
            if (jenis === 'Izin') {
                kategoriIzin = document.getElementById('kategoriIzin').value;
                tglMulai = document.getElementById('tglMulaiIzin').value || todayStr;
                tglSelesai = document.getElementById('tglSelesaiIzin').value || todayStr;
                if (tglSelesai < tglMulai) { showAlert('Tanggal selesai tidak boleh sebelum tanggal mulai.'); return; }
                jumlahHari = hitungJumlahHari(tglMulai, tglSelesai);
            }

            const newLog = {
                id: Date.now(),
                userId: currentUser.id,
                nama: currentUser.nama,
                jabatan: currentUser.jabatan,
                tglMasuk: currentUser.tglMasuk,
                status: jenis,
                waktuMasuk: now.toLocaleTimeString(appLocale()),
                waktuPulang: '-',
                tanggal: jenis === 'Izin' ? tglMulai : todayStr,
                tanggalSelesai: jenis === 'Izin' ? tglSelesai : null,
                jumlahHari: jenis === 'Izin' ? jumlahHari : 1,
                kategoriIzin: kategoriIzin,
                lokasi: 'Keterangan: ' + alasan,
                suratDokter: suratDokter,
                statusVerifikasi: jenis === 'Sakit' ? 'Menunggu Verifikasi' : null,
                catatanVerifikasi: '',
                verifikatorNama: ''
            };

            absensiLogs.unshift(newLog);
            saveLogsToStorage();
            const kategoriMsg = kategoriIzin ? ` (${t(KATEGORI_IZIN_LABEL[kategoriIzin] || kategoriIzin)}, ${jumlahHari} ${t('hari')})` : '';
            const jenisLabel = { Izin: t('Izin'), Sakit: t('Sakit'), Hadir: t('Hadir') }[jenis] || jenis;
            showAlert(`${t('Pengajuan')} ${jenisLabel}${kategoriMsg} ${t('berhasil dikirim!')}` + (suratDokter ? ' ' + t('Surat dokter akan diverifikasi HRD/Admin.') : ''), 'success');
            fileInput.value = '';
            document.getElementById('alasanIzin').value = '';
            renderMyStats();
        }

        function renderMyStats() {
            if(!currentUser) return;
            const myLogs = absensiLogs.filter(l => l.userId === currentUser.id);
            document.getElementById('statMyHadir').innerText = myLogs.filter(l => l.status === 'Hadir').length;
            document.getElementById('statMyTelat').innerText = myLogs.filter(l => l.status === 'Terlambat').length;
            document.getElementById('statMyIzin').innerText = myLogs.filter(l => l.status === 'Izin').length;
            document.getElementById('statMySakit').innerText = myLogs.filter(l => l.status === 'Sakit').length;

            const cutiInfo = getSisaCuti(currentUser);
            const elSisaCuti = document.getElementById('statMySisaCuti');
            if (elSisaCuti) elSisaCuti.innerText = `${cutiInfo.sisa} / ${cutiInfo.jatah} hari`;

            // Status verifikasi surat dokter milik staff yang sedang login
            const mySuratList = document.getElementById('mySuratStatusList');
            const mySakitLogs = myLogs.filter(l => l.status === 'Sakit' && l.suratDokter);
            if (mySakitLogs.length === 0) {
                mySuratList.innerHTML = '<p class="text-slate-400 italic">Belum ada pengajuan sakit dengan surat dokter.</p>';
            } else {
                mySuratList.innerHTML = mySakitLogs.map(l => {
                    let badge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Menunggu Verifikasi</span>';
                    if (l.statusVerifikasi === 'Disetujui') badge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Disetujui</span>';
                    if (l.statusVerifikasi === 'Ditolak') badge = '<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">Ditolak</span>';
                    const catatan = l.catatanVerifikasi ? `<p class="text-[10px] text-slate-500 mt-0.5">Catatan: ${l.catatanVerifikasi}</p>` : '';
                    return `<div class="p-2 border border-slate-200 rounded-lg flex justify-between items-start">
                        <div><p class="font-semibold text-slate-700">${l.tanggal}</p>${catatan}</div>
                        ${badge}
                    </div>`;
                }).join('');
            }
        }

        // Hitung rekap total Hadir/Terlambat/Izin/Sakit untuk satu staff (all-time)
        function getEmployeeRecap(userId) {
            const logs = absensiLogs.filter(l => l.userId === userId);
            return {
                hadir: logs.filter(l => l.status === 'Hadir').length,
                telat: logs.filter(l => l.status === 'Terlambat').length,
                izin: logs.filter(l => l.status === 'Izin').length,
                sakit: logs.filter(l => l.status === 'Sakit').length
            };
        }

        // RENDER TABEL MONITORING TERBARU (DENGAN JAM KERJA, SHIFT & REKAP PER-KARYAWAN)
        function renderTable() {
            const tbody = document.getElementById('hrdTableBody');
            tbody.innerHTML = '';
            renderTodayStats();

            const filterVal = document.getElementById('filterDate').value; // format YYYY-MM-DD
            const displayedLogs = filterVal ? absensiLogs.filter(l => l.tanggal === filterVal) : absensiLogs;
            const recapCache = {};

            if (displayedLogs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-400 italic">Tidak ada data absensi untuk tanggal yang dipilih.</td></tr>`;
                return;
            }

            displayedLogs.forEach(log => {
                let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">HADIR</span>`;
                if(log.status === 'Terlambat') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 animate-pulse">TERLAMBAT</span>`;
                if(log.status === 'Izin') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">IZIN</span>`;
                if(log.status === 'Sakit') {
                    statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">SAKIT</span>`;
                    if (log.statusVerifikasi === 'Menunggu Verifikasi') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">SURAT PENDING</span>`;
                    else if (log.statusVerifikasi === 'Disetujui') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">SURAT OK</span>`;
                    else if (log.statusVerifikasi === 'Ditolak') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">SURAT DITOLAK</span>`;
                }

                const masaKerja = hitungMasaKerja(log.tglMasuk);
                const durasi = hitungDurasiKerja(log.waktuMasuk, log.waktuPulang);
                const shiftLabel = SHIFT_CONFIG[log.shift || 'pagi'] ? SHIFT_CONFIG[log.shift || 'pagi'].label : 'Pagi';

                // Rekap total per-staff (di-cache supaya tidak dihitung ulang untuk staff yang sama)
                if (!recapCache[log.userId]) recapCache[log.userId] = getEmployeeRecap(log.userId);
                const r = recapCache[log.userId];
                const rekapHtml = `
                    <div class="flex flex-wrap gap-1 max-w-[170px]">
                        <span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title="Hadir">H:${r.hadir}</span>
                        <span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200" title="Terlambat">T:${r.telat}</span>
                        <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title="Izin">I:${r.izin}</span>
                        <span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" title="Sakit">S:${r.sakit}</span>
                    </div>
                `;

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3"><b>${log.tanggal}</b></td>
                        <td class="p-3"><b>${log.nama}</b><br><span class="text-[10px] text-slate-400">${log.userId}</span></td>
                        <td class="p-3">${log.jabatan}<br><span class="text-[10px] text-indigo-600 font-medium">Shift ${shiftLabel}</span> · <span class="text-[10px] text-blue-600 font-medium">${masaKerja}</span></td>
                        <td class="p-3 font-semibold text-emerald-600"><i class="fa-solid fa-right-to-bracket mr-1"></i>${log.waktuMasuk}</td>
                        <td class="p-3 font-semibold text-rose-600"><i class="fa-solid fa-right-from-bracket mr-1"></i>${log.waktuPulang}</td>
                        <td class="p-3 font-bold text-slate-700">${durasi}</td>
                        <td class="p-3">${statusBadge}</td>
                        <td class="p-3">${rekapHtml}</td>
                    </tr>
                `;
            });
        }

        // ================== VERIFIKASI SURAT DOKTER (HRD & ADMIN) ==================
        let activeSuratLogId = null;

        function renderVerifikasiSurat() {
            const tbody = document.getElementById('suratTableBody');
            tbody.innerHTML = '';
            const suratLogs = absensiLogs.filter(l => l.status === 'Sakit' && l.suratDokter);

            let pending = 0, approved = 0, rejected = 0;
            suratLogs.forEach(l => {
                if (l.statusVerifikasi === 'Menunggu Verifikasi') pending++;
                else if (l.statusVerifikasi === 'Disetujui') approved++;
                else if (l.statusVerifikasi === 'Ditolak') rejected++;
            });
            document.getElementById('suratStatPending').innerText = pending;
            document.getElementById('suratStatApproved').innerText = approved;
            document.getElementById('suratStatRejected').innerText = rejected;

            if (suratLogs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Belum ada surat dokter yang dikirimkan staff.</td></tr>`;
            } else {
                suratLogs.forEach(l => {
                    let badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">MENUNGGU</span>';
                    if (l.statusVerifikasi === 'Disetujui') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">DISETUJUI</span>';
                    if (l.statusVerifikasi === 'Ditolak') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">DITOLAK</span>';

                    tbody.innerHTML += `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3">${l.tanggal}</td>
                            <td class="p-3"><b>${l.nama}</b><br><span class="text-[10px] text-slate-400">${l.userId}</span></td>
                            <td class="p-3 max-w-[180px] truncate" title="${l.lokasi}">${l.lokasi.replace('Keterangan: ', '')}</td>
                            <td class="p-3"><i class="fa-solid fa-paperclip mr-1 text-slate-400"></i>${l.suratDokter.name}</td>
                            <td class="p-3">${badge}</td>
                            <td class="p-3 text-center">
                                <button onclick="openSuratPreview(${l.id})" class="bg-slate-800 hover:bg-slate-900 text-white text-[10px] px-3 py-1.5 rounded-lg font-medium transition">
                                    <i class="fa-solid fa-eye mr-1"></i>Periksa
                                </button>
                            </td>
                        </tr>
                    `;
                });
            }

            updateSuratPendingBadge();
        }

        function openSuratPreview(logId) {
            const log = absensiLogs.find(l => l.id === logId);
            if (!log || !log.suratDokter) return;
            activeSuratLogId = logId;

            document.getElementById('suratPreviewInfo').innerHTML = `
                <p><b>Staff:</b> ${log.nama} (${log.userId})</p>
                <p><b>Tanggal Pengajuan:</b> ${log.tanggal}</p>
                <p><b>Keterangan:</b> ${log.lokasi.replace('Keterangan: ', '')}</p>
                <p><b>Status Saat Ini:</b> ${log.statusVerifikasi}</p>
            `;

            const contentEl = document.getElementById('suratPreviewContent');
            if (log.suratDokter.type && log.suratDokter.type.startsWith('image/')) {
                contentEl.innerHTML = `<img src="${log.suratDokter.dataUrl}" class="max-w-full max-h-[50vh] object-contain">`;
            } else if (log.suratDokter.type === 'application/pdf') {
                contentEl.innerHTML = `<embed src="${log.suratDokter.dataUrl}" type="application/pdf" class="w-full h-[50vh]">`;
            } else {
                contentEl.innerHTML = `<p class="text-xs text-slate-500 p-4">Format file tidak dapat ditampilkan. Nama file: ${log.suratDokter.name}</p>`;
            }

            document.getElementById('catatanVerifikasi').value = log.catatanVerifikasi || '';

            // Jika sudah diverifikasi sebelumnya, tetap izinkan ubah keputusan
            document.getElementById('suratPreviewModal').classList.remove('hidden');
        }

        function closeSuratPreview() {
            document.getElementById('suratPreviewModal').classList.add('hidden');
            activeSuratLogId = null;
        }

        function verifikasiSurat(keputusan) {
            const log = absensiLogs.find(l => l.id === activeSuratLogId);
            if (!log) return;
            log.statusVerifikasi = keputusan;
            log.catatanVerifikasi = document.getElementById('catatanVerifikasi').value.trim();
            log.verifikatorNama = currentUser ? currentUser.nama : '-';
            saveLogsToStorage();
            closeSuratPreview();
            renderVerifikasiSurat();
            showAlert(`Surat dokter dari <b>${log.nama}</b> telah <b>${keputusan}</b>.`, keputusan === 'Disetujui' ? 'success' : 'error');
        }

        // ================== PENGATURAN LOKASI KANTOR/CABANG (ADMIN, GEOFENCING MULTI-LOKASI) ==================
        let editingOfficeId = null; // null = mode tambah baru, isi id = mode edit kantor tsb

        async function renderLokasiKantorForm() {
            await loadOfficeLocationsFromServer(); // selalu ambil data terbaru dari database
            renderLokasiKantorList();
            resetFormKantor();
        }

        function renderLokasiKantorList() {
            const listEl = document.getElementById('kantorListBody');
            const statusEl = document.getElementById('kantorStatusInfo');
            if (!listEl || !statusEl) return;

            if (officeLocations.length === 0) {
                statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i>Belum ada kantor/cabang yang diatur. Selama belum ada, validasi jarak GPS saat absen tidak aktif (staff bisa absen dari mana saja).`;
            } else {
                statusEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i><b>${officeLocations.length}</b> kantor/cabang terdaftar. Staff otomatis divalidasi terhadap kantor terdekat dari daftar ini.`;
            }

            listEl.innerHTML = officeLocations.map(o => `
                <tr class="border-b border-slate-100">
                    <td class="py-2 px-3">
                        <div class="font-semibold text-slate-700">${o.nama}</div>
                        <div class="text-slate-400">${o.alamat || '-'}</div>
                    </td>
                    <td class="py-2 px-3 whitespace-nowrap">${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}</td>
                    <td class="py-2 px-3 whitespace-nowrap">${o.radius} m</td>
                    <td class="py-2 px-3 text-right whitespace-nowrap">
                        <button type="button" onclick="editKantor('${o.id}')" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" onclick="hapusLokasiKantor('${o.id}')" class="text-red-600 hover:text-red-800" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="py-4 text-center text-slate-400">Belum ada data kantor.</td></tr>`;
        }

        function resetFormKantor() {
            editingOfficeId = null;
            const namaEl = document.getElementById('kantorNama');
            const alamatEl = document.getElementById('kantorAlamat');
            const latEl = document.getElementById('kantorLat');
            const lngEl = document.getElementById('kantorLng');
            const radiusEl = document.getElementById('kantorRadius');
            if (!namaEl) return;
            namaEl.value = '';
            alamatEl.value = '';
            latEl.value = '';
            lngEl.value = '';
            radiusEl.value = 100;
            const btnSubmit = document.getElementById('btnSubmitKantor');
            if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i>Tambah Kantor';
            const btnBatal = document.getElementById('btnBatalEditKantor');
            if (btnBatal) btnBatal.classList.add('hidden');
        }

        function editKantor(id) {
            const office = officeLocations.find(o => String(o.id) === String(id));
            if (!office) return;
            editingOfficeId = id;
            document.getElementById('kantorNama').value = office.nama;
            document.getElementById('kantorAlamat').value = office.alamat || '';
            document.getElementById('kantorLat').value = office.lat;
            document.getElementById('kantorLng').value = office.lng;
            document.getElementById('kantorRadius').value = office.radius;
            const btnSubmit = document.getElementById('btnSubmitKantor');
            if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i>Update Kantor';
            const btnBatal = document.getElementById('btnBatalEditKantor');
            if (btnBatal) btnBatal.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Bantu Admin mengisi form: ambil koordinat GPS Admin saat ini (dipakai saat Admin sedang berada di kantor)
        function ambilLokasiSaatIniUntukKantor() {
            if (!navigator.geolocation) return showAlert('Geolocation tidak didukung browser ini.');
            const btn = document.getElementById('btnAmbilLokasiKantor');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Mendeteksi...'; }
            navigator.geolocation.getCurrentPosition(
                pos => {
                    document.getElementById('kantorLat').value = pos.coords.latitude.toFixed(6);
                    document.getElementById('kantorLng').value = pos.coords.longitude.toFixed(6);
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-location-crosshairs mr-1"></i>Ambil Lokasi Saat Ini'; }
                    showAlert('Koordinat lokasi Anda saat ini berhasil diambil. Pastikan Anda sedang benar-benar berada di lokasi kantor, lalu klik "Simpan".', 'success');
                },
                err => {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-location-crosshairs mr-1"></i>Ambil Lokasi Saat Ini'; }
                    showAlert('Gagal mengambil lokasi GPS. Pastikan izin lokasi browser sudah diizinkan.', 'error');
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        }

        async function saveLokasiKantor(e) {
            e.preventDefault();
            const nama = document.getElementById('kantorNama').value.trim();
            const alamat = document.getElementById('kantorAlamat').value.trim();
            const lat = parseFloat(document.getElementById('kantorLat').value);
            const lng = parseFloat(document.getElementById('kantorLng').value);
            const radius = parseInt(document.getElementById('kantorRadius').value, 10);

            if (!nama) return showAlert('Nama kantor/cabang wajib diisi.');
            if (isNaN(lat) || lat < -90 || lat > 90) return showAlert('Latitude tidak valid (harus di antara -90 sampai 90).');
            if (isNaN(lng) || lng < -180 || lng > 180) return showAlert('Longitude tidak valid (harus di antara -180 sampai 180).');
            if (isNaN(radius) || radius < 10) return showAlert('Radius maksimal absen minimal 10 meter.');

            const btnSubmit = document.getElementById('btnSubmitKantor');
            if (btnSubmit) { btnSubmit.disabled = true; }

            try {
                const isEdit = !!editingOfficeId;
                const res = await fetch(`${API_BASE_URL}/office_locations.php`, {
                    method: isEdit ? 'PUT' : 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(isEdit
                        ? { id: editingOfficeId, nama, alamat, lat, lng, radius }
                        : { nama, alamat, lat, lng, radius })
                });
                const json = await res.json();
                if (!json.success) {
                    if (btnSubmit) btnSubmit.disabled = false;
                    return showAlert(json.message || 'Gagal menyimpan data kantor.', 'error');
                }
                showAlert(json.message, 'success');
                await loadOfficeLocationsFromServer();
                resetFormKantor();
                renderLokasiKantorList();
            } catch (err) {
                showAlert('<b>Gagal terhubung ke server.</b> Pastikan backend PHP aktif dan API_BASE_URL sudah benar.', 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        }

        async function hapusLokasiKantor(id) {
            const office = officeLocations.find(o => String(o.id) === String(id));
            if (!office) return;
            if (!confirm(`Hapus kantor "${office.nama}"?`)) return;

            try {
                const res = await fetch(`${API_BASE_URL}/office_locations.php`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const json = await res.json();
                if (!json.success) {
                    return showAlert(json.message || 'Gagal menghapus kantor.', 'error');
                }
                await loadOfficeLocationsFromServer();
                if (String(editingOfficeId) === String(id)) resetFormKantor();
                renderLokasiKantorList();
                showAlert(json.message, 'success');
            } catch (err) {
                showAlert('<b>Gagal terhubung ke server.</b> Pastikan backend PHP aktif dan API_BASE_URL sudah benar.', 'error');
            }
        }

        // ================== MASTER DATA: TABEL JAM KERJA / SHIFT ==================
        function renderShiftMasterTable() {
            const tbody = document.getElementById('shiftMasterTableBody');
            const searchEl = document.getElementById('cariShiftInput');
            const keyword = searchEl ? searchEl.value.trim().toLowerCase() : '';
            tbody.innerHTML = '';

            const rows = Object.keys(SHIFT_CONFIG).filter(key => {
                const cfg = SHIFT_CONFIG[key];
                return !keyword || cfg.label.toLowerCase().includes(keyword) || ('shift ' + cfg.label.toLowerCase()).includes(keyword);
            });

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-400 italic">Jam kerja tidak ditemukan.</td></tr>`;
                return;
            }

            rows.forEach((key, idx) => {
                const cfg = SHIFT_CONFIG[key];
                const jumlahKaryawan = users.filter(u => (u.shift || 'pagi') === key).length;
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3">${idx + 1}</td>
                        <td class="p-3 font-semibold text-slate-700">Shift ${cfg.label}</td>
                        <td class="p-3">Senin - Sabtu</td>
                        <td class="p-3">${cfg.labelMasuk} - ${cfg.labelPulang}</td>
                        <td class="p-3">${cfg.toleransi} menit</td>
                        <td class="p-3"><span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">${jumlahKaryawan} Staff</span></td>
                        <td class="p-3"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">AKTIF</span></td>
                        <td class="p-3 text-center"><button onclick="openShiftTimeModal('${key}')" class="text-indigo-600 hover:underline text-[11px]"><i class="fa-solid fa-pen mr-1"></i>Ubah Jam</button></td>
                    </tr>
                `;
            });
        }

        function renderAdminUsers() {
            const tbody = document.getElementById('adminUserTable');
            tbody.innerHTML = '';
            users.forEach(u => {
                const mk = hitungMasaKerja(u.tglMasuk);
                const sec = loginSecurity[getSecKey(u.username)];
                let secBadge = '<span class="text-emerald-600 text-[10px]"><i class="fa-solid fa-shield-check mr-1"></i>Aman</span>';
                let resetBtn = '';
                if (sec) {
                    if (sec.permaBanned) {
                        secBadge = '<span class="text-red-600 font-bold text-[10px]"><i class="fa-solid fa-lock mr-1"></i>Terkunci Permanen</span>';
                        resetBtn = `<button onclick="resetUserSecurity('${u.username}')" class="text-blue-600 hover:underline text-[11px]">Reset</button>`;
                    } else if (sec.banUntil && sec.banUntil > Date.now()) {
                        secBadge = '<span class="text-amber-600 font-bold text-[10px]"><i class="fa-solid fa-hourglass-half mr-1"></i>Diblokir Sementara</span>';
                        resetBtn = `<button onclick="resetUserSecurity('${u.username}')" class="text-blue-600 hover:underline text-[11px]">Reset</button>`;
                    }
                }
                tbody.innerHTML += `
                    <tr>
                        <td class="p-2 font-bold">${u.id}</td>
                        <td class="p-2">${u.nama}</td>
                        <td class="p-2">${u.jabatan}</td>
                        <td class="p-2 text-blue-600 font-semibold">${mk}</td>
                        <td class="p-2">
                            <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">${getShiftConfig(u).label}</span>
                            <br><span class="text-[10px] text-slate-400">${getShiftConfig(u).labelMasuk} - ${getShiftConfig(u).labelPulang}</span>
                        </td>
                        <td class="p-2 capitalize"><span class="bg-slate-100 px-2 py-0.5 rounded">${roleLabel(u.role)}</span></td>
                        <td class="p-2">${secBadge}</td>
                        <td class="p-2">
                            <button onclick="toggleAllowChangePassword('${u.id}')" class="text-[10px] font-bold px-2 py-0.5 rounded ${u.allowChangePassword ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                ${u.allowChangePassword ? '<i class="fa-solid fa-lock-open mr-1"></i>Diizinkan' : '<i class="fa-solid fa-lock mr-1"></i>Belum Diizinkan'}
                            </button>
                        </td>
                        <td class="p-2">
                            ${(() => { const info = getSisaCuti(u); return `<span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">${info.sisa}/${info.jatah} hari</span>`; })()}
                        </td>
                        <td class="p-2 text-center space-x-2">
                            <button onclick="openShiftModal('${u.id}')" class="text-indigo-600 hover:underline text-[11px]">Atur Shift</button>
                            <button onclick="openCutiModal('${u.id}')" class="text-emerald-600 hover:underline text-[11px]">Atur Cuti</button>
                            <button onclick="openPasswordModal('${u.id}')" class="text-blue-600 hover:underline text-[11px]">Password</button>
                            ${resetBtn}
                            <button onclick="deleteUser('${u.id}')" class="text-red-600 hover:underline text-[11px]">Hapus</button>
                        </td>
                    </tr>
                `;
            });
            renderTodayStats();
        }

        function roleLabel(role) {
            if (role === 'admin') return 'Admin';
            if (role === 'hrd') return 'HRD';
            if (role === 'magang') return t('Magang / PKL');
            return t('Staff');
        }

        // ================== STATISTIK HARIAN (MONITORING DAFTAR KARYAWAN) ==================
        function renderTodayStats() {
            const todayStr = new Date().toISOString().split('T')[0];
            const todayLogs = absensiLogs.filter(l => l.tanggal === todayStr);
            const totalKaryawan = users.length;
            const hadirCount = todayLogs.filter(l => l.status === 'Hadir' || l.status === 'Terlambat').length;
            const izinCount = todayLogs.filter(l => l.status === 'Izin').length;
            const sakitCount = todayLogs.filter(l => l.status === 'Sakit').length;
            const sudahCatat = new Set(todayLogs.map(l => l.userId)).size;
            const belumAbsen = Math.max(totalKaryawan - sudahCatat, 0);

            const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
            setText('statTodayTotal', totalKaryawan);
            setText('statTodayHadir', hadirCount);
            setText('statTodayIzin', izinCount);
            setText('statTodaySakit', sakitCount);
            setText('statTodayBelum', belumAbsen);
        }

        function addUser(e) {
            e.preventDefault();
            const newUser = {
                id: document.getElementById('addId').value.trim(),
                nama: document.getElementById('addNama').value.trim(),
                jabatan: document.getElementById('addJabatan').value.trim(),
                tglMasuk: document.getElementById('addTglMasuk').value,
                username: document.getElementById('addUsername').value.trim(),
                pass: "123456",
                role: document.getElementById('addRole').value,
                shift: document.getElementById('addShift').value,
                allowChangePassword: false,
                jatahCuti: parseInt(document.getElementById('addJatahCuti').value, 10) || 12
            };
            users.push(newUser);
            saveUsersToStorage();
            renderAdminUsers();
            showAlert(`User <b>${newUser.nama}</b> berhasil ditambahkan (Shift ${getShiftConfig(newUser).label})!`, 'success');
        }

        // ================== MANAJEMEN SHIFT KERJA (ADMIN) ==================
        let activeShiftUserId = null;
        function openShiftModal(userId) {
            const u = users.find(x => x.id === userId);
            if (!u) return;
            activeShiftUserId = userId;
            document.getElementById('shiftModalNama').innerText = `${u.nama} (${u.id}) - ${u.jabatan}`;
            document.getElementById('shiftModalSelect').value = u.shift || 'pagi';
            document.getElementById('shiftModal').classList.remove('hidden');
        }
        function closeShiftModal() {
            document.getElementById('shiftModal').classList.add('hidden');
            activeShiftUserId = null;
        }
        function saveShiftChange() {
            const u = users.find(x => x.id === activeShiftUserId);
            if (!u) return;
            u.shift = document.getElementById('shiftModalSelect').value;
            saveUsersToStorage();
            closeShiftModal();
            renderAdminUsers();
            showAlert(`Shift <b>${u.nama}</b> berhasil diubah menjadi Shift <b>${getShiftConfig(u).label}</b> (${getShiftConfig(u).labelMasuk} - ${getShiftConfig(u).labelPulang}).`, 'success');
            // Jika staff yang shift-nya diubah sedang login di tab ini, sinkronkan tampilannya
            if (currentUser && currentUser.id === u.id) {
                currentUser.shift = u.shift;
                setupKaryawanView();
            }
        }

        function deleteUser(id) {
            users = users.filter(u => u.id !== id);
            saveUsersToStorage();
            renderAdminUsers();
            showAlert('User berhasil dihapus.');
        }

        // ================== MANAJEMEN PASSWORD OLEH ADMIN (LANGSUNG, TANPA APPROVAL) ==================
        let activePasswordUserId = null;
        function openPasswordModal(userId) {
            const u = users.find(x => x.id === userId);
            if (!u) return;
            activePasswordUserId = userId;
            document.getElementById('passwordModalNama').innerText = `${u.nama} (${u.id}) - ${u.jabatan}`;
            document.getElementById('passwordModalInput').value = '';
            document.getElementById('passwordModalAllow').checked = !!u.allowChangePassword;
            document.getElementById('passwordModal').classList.remove('hidden');
        }
        function closePasswordModal() {
            document.getElementById('passwordModal').classList.add('hidden');
            activePasswordUserId = null;
        }
        function savePasswordChangeByAdmin() {
            const u = users.find(x => x.id === activePasswordUserId);
            if (!u) return;
            const newPass = document.getElementById('passwordModalInput').value.trim();
            const allow = document.getElementById('passwordModalAllow').checked;
            u.allowChangePassword = allow;
            if (newPass) {
                if (newPass.length < 4) { showAlert('Password baru minimal 4 karakter.'); return; }
                u.pass = newPass;
            }
            saveUsersToStorage();
            closePasswordModal();
            renderAdminUsers();
            showAlert(`Pengaturan password <b>${u.nama}</b> berhasil disimpan${newPass ? ' (password baru diterapkan)' : ''}.`, 'success');
        }

        // ================== PERMINTAAN GANTI PASSWORD OLEH KARYAWAN (BUTUH PERSETUJUAN) ==================
        function renderMyPasswordCard() {
            const container = document.getElementById('myPasswordFormContainer');
            const locked = document.getElementById('myPasswordLockedInfo');
            if (!container || !locked || !currentUser) return;
            if (currentUser.allowChangePassword) {
                container.classList.remove('hidden');
                locked.classList.add('hidden');
            } else {
                container.classList.add('hidden');
                locked.classList.remove('hidden');
            }
            const myPending = passwordRequests.filter(r => r.userId === currentUser.id && r.status === 'pending');
            const infoEl = document.getElementById('myPasswordPendingInfo');
            if (infoEl) {
                infoEl.innerHTML = myPending.length
                    ? `<p class="text-amber-600"><i class="fa-solid fa-hourglass-half mr-1"></i>Pengajuan ganti password Anda sedang menunggu persetujuan Admin/HRD.</p>`
                    : '';
            }
        }

        function submitPasswordRequest(e) {
            e.preventDefault();
            if (!currentUser || !currentUser.allowChangePassword) {
                showAlert('Anda belum diizinkan Admin untuk mengubah password sendiri.');
                return;
            }
            const newPass = document.getElementById('myNewPassword').value.trim();
            const confirmPass = document.getElementById('myConfirmPassword').value.trim();
            if (newPass.length < 4) { showAlert('Password baru minimal 4 karakter.'); return; }
            if (newPass !== confirmPass) { showAlert('Konfirmasi password tidak sama.'); return; }

            // Hapus request lama yang masih pending dari user ini (supaya tidak dobel)
            passwordRequests = passwordRequests.filter(r => !(r.userId === currentUser.id && r.status === 'pending'));

            passwordRequests.unshift({
                id: Date.now(),
                userId: currentUser.id,
                nama: currentUser.nama,
                jabatan: currentUser.jabatan,
                newPass: newPass,
                status: 'pending',
                requestedAt: new Date().toLocaleString('id-ID')
            });
            savePwReqToStorage();
            document.getElementById('myNewPassword').value = '';
            document.getElementById('myConfirmPassword').value = '';
            showAlert('Pengajuan ganti password terkirim! Menunggu persetujuan Admin/HRD.', 'success');
            renderMyPasswordCard();
            updatePwReqBadge();
        }

        // Tampilkan password baru yang diajukan dalam bentuk tersamar (masking), bukan teks asli,
        // supaya tetap tidak terekspos gamblang di layar Admin/HRD.
        function maskPassword(pass) {
            if (!pass) return '';
            if (pass.length <= 2) return '*'.repeat(pass.length);
            return pass[0] + '*'.repeat(Math.max(pass.length - 2, 1)) + pass[pass.length - 1];
        }

        function updatePwReqBadge() {
            const badge = document.getElementById('badgePwReqPending');
            if (!badge) return;
            const pendingCount = passwordRequests.filter(r => r.status === 'pending').length;
            if (pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        function renderPasswordRequests() {
            const tbody = document.getElementById('pwReqTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            const pending = passwordRequests.filter(r => r.status === 'pending');
            if (pending.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">Tidak ada permintaan ganti password yang menunggu.</td></tr>`;
                updatePwReqBadge();
                return;
            }
            pending.forEach(r => {
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-semibold text-slate-700">${r.nama}<br><span class="text-[10px] text-slate-400">${r.jabatan}</span></td>
                        <td class="p-3 text-[11px] text-slate-500">${r.requestedAt}</td>
                        <td class="p-3 font-mono tracking-widest">${maskPassword(r.newPass)}</td>
                        <td class="p-3"><span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">MENUNGGU</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="approvePasswordRequest(${r.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] px-2.5 py-1 rounded-lg"><i class="fa-solid fa-check mr-1"></i>Setujui</button>
                            <button onclick="rejectPasswordRequest(${r.id})" class="bg-red-600 hover:bg-red-700 text-white text-[11px] px-2.5 py-1 rounded-lg"><i class="fa-solid fa-xmark mr-1"></i>Tolak</button>
                        </td>
                    </tr>
                `;
            });
            updatePwReqBadge();
        }

        function approvePasswordRequest(id) {
            const req = passwordRequests.find(r => r.id === id);
            if (!req) return;
            const u = users.find(x => x.id === req.userId);
            if (u) { u.pass = req.newPass; saveUsersToStorage(); }
            req.status = 'approved';
            savePwReqToStorage();
            renderPasswordRequests();
            showAlert(`Password <b>${req.nama}</b> berhasil diperbarui.`, 'success');
        }

        function rejectPasswordRequest(id) {
            const req = passwordRequests.find(r => r.id === id);
            if (!req) return;
            req.status = 'rejected';
            savePwReqToStorage();
            renderPasswordRequests();
            showAlert(`Pengajuan ganti password <b>${req.nama}</b> ditolak.`);
        }

        function toggleAllowChangePassword(userId) {
            const u = users.find(x => x.id === userId);
            if (!u) return;
            u.allowChangePassword = !u.allowChangePassword;
            saveUsersToStorage();
            renderAdminUsers();
            showAlert(`Izin ubah password mandiri untuk <b>${u.nama}</b> kini <b>${u.allowChangePassword ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}</b>.`, 'success');
        }

        // ================== EDIT JAM SHIFT (ADMIN/HRD BISA UBAH JAM MASUK & PULANG) ==================
        let activeShiftEditKey = null;
        function openShiftTimeModal(key) {
            const cfg = SHIFT_CONFIG[key];
            if (!cfg) return;
            activeShiftEditKey = key;
            document.getElementById('shiftTimeModalNama').innerText = `Shift ${cfg.label}`;
            document.getElementById('shiftTimeMasuk').value = `${pad2(cfg.jamMasuk)}:${pad2(cfg.menitMasuk)}`;
            document.getElementById('shiftTimePulang').value = `${pad2(cfg.jamPulang)}:${pad2(cfg.menitPulang)}`;
            document.getElementById('shiftTimeToleransi').value = cfg.toleransi;
            document.getElementById('shiftTimeEditModal').classList.remove('hidden');
        }
        function closeShiftTimeModal() {
            document.getElementById('shiftTimeEditModal').classList.add('hidden');
            activeShiftEditKey = null;
        }
        function saveShiftTimeChange() {
            const cfg = SHIFT_CONFIG[activeShiftEditKey];
            if (!cfg) return;
            const masukVal = document.getElementById('shiftTimeMasuk').value;
            const pulangVal = document.getElementById('shiftTimePulang').value;
            const toleransi = parseInt(document.getElementById('shiftTimeToleransi').value, 10) || 0;
            if (!masukVal || !pulangVal) { showAlert('Jam masuk & jam pulang wajib diisi.'); return; }
            const [jm, mm] = masukVal.split(':').map(Number);
            const [jp, mp] = pulangVal.split(':').map(Number);
            cfg.jamMasuk = jm; cfg.menitMasuk = mm;
            cfg.jamPulang = jp; cfg.menitPulang = mp;
            cfg.toleransi = toleransi;
            cfg.labelMasuk = `${pad2(jm)}:${pad2(mm)} WIB`;
            cfg.labelPulang = `${pad2(jp)}:${pad2(mp)} WIB`;
            saveShiftConfigToStorage();
            closeShiftTimeModal();
            renderShiftMasterTable();
            showAlert(`Jam kerja Shift <b>${cfg.label}</b> berhasil diubah menjadi <b>${cfg.labelMasuk} - ${cfg.labelPulang}</b>.`, 'success');
            // Sinkronkan tampilan jika user yang sedang login memakai shift ini
            if (currentUser && (currentUser.shift || 'pagi') === activeShiftEditKey) {
                setupKaryawanView();
            }
        }

        // ================== KALENDER IZIN / CUTI (ADMIN & HRD, JUGA VERSI RINGKAS UNTUK STAFF) ==================
        let kalenderViewDate = new Date();    // kalender lengkap (tab Admin/HRD)

        function izinCoversDate(log, dateStr) {
            if (log.status !== 'Izin') return false;
            const start = log.tanggal;
            const end = log.tanggalSelesai || log.tanggal;
            return dateStr >= start && dateStr <= end;
        }

        function kalenderChangeMonth(delta) {
            kalenderViewDate.setMonth(kalenderViewDate.getMonth() + delta);
            renderIzinCalendar('kalender', kalenderViewDate, true);
        }

        // prefix: 'kalender' (Admin/HRD, lengkap dgn daftar) atau 'timKalender' (semua staff, ringkas)
        // viewDate: objek Date acuan bulan yang ditampilkan
        // showList: true untuk menampilkan tabel daftar pengajuan di bawah grid
        function renderIzinCalendar(prefix, viewDate, showList) {
            prefix = prefix || 'kalender';
            viewDate = viewDate || kalenderViewDate;
            const grid = document.getElementById(prefix + 'Grid');
            const label = document.getElementById(prefix + 'BulanLabel');
            const listBody = showList ? document.getElementById(prefix + 'ListBody') : null;
            if (!grid || !label) return;

            const year = viewDate.getFullYear();
            const month = viewDate.getMonth();
            const bulanNama = viewDate.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' });
            label.innerText = bulanNama;

            const firstDay = new Date(year, month, 1);
            const startOffset = firstDay.getDay(); // 0=Minggu
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const izinLogs = absensiLogs.filter(l => l.status === 'Izin');

            let html = '';
            for (let i = 0; i < startOffset; i++) {
                html += `<div class="p-1 min-h-[64px] bg-slate-50 rounded-lg"></div>`;
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
                const todayStr = new Date().toISOString().split('T')[0];
                const isToday = dateStr === todayStr;
                const matches = izinLogs.filter(l => izinCoversDate(l, dateStr));
                const badges = matches.slice(0, 2).map(l => `<span class="block truncate text-[9px] bg-amber-100 text-amber-800 rounded px-1 py-0.5 mt-0.5" title="${l.nama} - ${t(KATEGORI_IZIN_LABEL[l.kategoriIzin] || 'Izin')}">${l.nama.split(' ')[0]}</span>`).join('');
                const more = matches.length > 2 ? `<span class="block text-[9px] text-slate-400">+${matches.length - 2} lagi</span>` : '';
                html += `
                    <div class="p-1 min-h-[64px] rounded-lg border ${isToday ? 'border-blue-400 bg-blue-50' : 'border-slate-100'}">
                        <span class="text-[10px] font-bold ${isToday ? 'text-blue-600' : 'text-slate-500'}">${d}</span>
                        ${badges}${more}
                    </div>
                `;
            }
            grid.innerHTML = html;

            if (!showList || !listBody) return;

            // Daftar pengajuan izin yang bersinggungan dengan bulan yang sedang ditampilkan
            const monthStart = `${year}-${pad2(month + 1)}-01`;
            const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;
            const relevantLogs = izinLogs.filter(l => (l.tanggal <= monthEnd) && ((l.tanggalSelesai || l.tanggal) >= monthStart))
                .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

            if (relevantLogs.length === 0) {
                listBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">${t('Tidak ada pengajuan izin/cuti pada bulan ini.')}</td></tr>`;
                return;
            }
            listBody.innerHTML = relevantLogs.map(l => `
                <tr class="hover:bg-slate-50">
                    <td class="p-3 font-semibold text-slate-700">${l.nama}<br><span class="text-[10px] text-slate-400">${l.jabatan}</span></td>
                    <td class="p-3"><span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">${t(KATEGORI_IZIN_LABEL[l.kategoriIzin] || 'Izin')}</span></td>
                    <td class="p-3">${l.tanggal}${l.tanggalSelesai && l.tanggalSelesai !== l.tanggal ? ' s/d ' + l.tanggalSelesai : ''}</td>
                    <td class="p-3 font-bold text-slate-700">${l.jumlahHari || 1} hari</td>
                    <td class="p-3 text-slate-500 italic">${(l.lokasi || '').replace('Keterangan: ', '')}</td>
                </tr>
            `).join('');
        }

        // Ekspor daftar izin/cuti bulan yang sedang ditampilkan di kalender Admin/HRD ke file CSV
        function exportIzinCalendarCSV() {
            const year = kalenderViewDate.getFullYear();
            const month = kalenderViewDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthStart = `${year}-${pad2(month + 1)}-01`;
            const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;
            const izinLogs = absensiLogs.filter(l => l.status === 'Izin');
            const relevantLogs = izinLogs.filter(l => (l.tanggal <= monthEnd) && ((l.tanggalSelesai || l.tanggal) >= monthStart))
                .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

            if (relevantLogs.length === 0) {
                showAlert('Tidak ada data izin/cuti pada bulan ini untuk diunduh.');
                return;
            }

            const escapeCsv = (val) => `"${String(val === undefined || val === null ? '' : val).replace(/"/g, '""')}"`;
            const header = ['Nama', 'ID', 'Jabatan', 'Kategori', 'Tanggal Mulai', 'Tanggal Selesai', 'Jumlah Hari', 'Keterangan'];
            const rows = relevantLogs.map(l => [
                l.nama,
                l.userId,
                l.jabatan,
                t(KATEGORI_IZIN_LABEL[l.kategoriIzin] || 'Izin'),
                l.tanggal,
                l.tanggalSelesai || l.tanggal,
                l.jumlahHari || 1,
                (l.lokasi || '').replace('Keterangan: ', '')
            ]);
            const csvContent = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const bulanFile = kalenderViewDate.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' }).replace(/\s+/g, '-');
            a.href = url;
            a.download = `Kalender-Izin-Cuti-${bulanFile}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // ================== JATAH CUTI TAHUNAN (ADMIN/HRD ATUR, STAFF LIHAT SISA) ==================
        // Hanya kategori "Cuti Tahunan" yang mengurangi jatah; menikah/melahirkan/duka/libur di luar jatah cuti tahunan.
        function getYearlyCutiUsed(userId, year) {
            const y = year || new Date().getFullYear();
            return absensiLogs
                .filter(l => l.userId === userId && l.status === 'Izin' && l.kategoriIzin === 'cuti' && (l.tanggal || '').startsWith(String(y)))
                .reduce((sum, l) => sum + (l.jumlahHari || 1), 0);
        }

        function getSisaCuti(user, year) {
            const jatah = (user && typeof user.jatahCuti === 'number') ? user.jatahCuti : 12;
            const used = user ? getYearlyCutiUsed(user.id, year) : 0;
            return { jatah, used, sisa: Math.max(jatah - used, 0) };
        }

        let activeCutiUserId = null;
        function openCutiModal(userId) {
            const u = users.find(x => x.id === userId);
            if (!u) return;
            activeCutiUserId = userId;
            const info = getSisaCuti(u);
            document.getElementById('cutiModalNama').innerText = `${u.nama} (${u.id}) - ${u.jabatan}`;
            document.getElementById('cutiModalInput').value = info.jatah;
            document.getElementById('cutiModalTerpakai').innerText = `Sudah terpakai tahun ini: ${info.used} hari.`;
            document.getElementById('cutiModal').classList.remove('hidden');
        }
        function closeCutiModal() {
            document.getElementById('cutiModal').classList.add('hidden');
            activeCutiUserId = null;
        }
        function saveCutiChange() {
            const u = users.find(x => x.id === activeCutiUserId);
            if (!u) return;
            const val = parseInt(document.getElementById('cutiModalInput').value, 10);
            if (isNaN(val) || val < 0) { showAlert('Jatah cuti harus berupa angka 0 atau lebih.'); return; }
            u.jatahCuti = val;
            saveUsersToStorage();
            closeCutiModal();
            renderAdminUsers();
            showAlert(`Jatah cuti tahunan <b>${u.nama}</b> berhasil diubah menjadi <b>${val} hari</b>.`, 'success');
            if (currentUser && currentUser.id === u.id) {
                currentUser.jatahCuti = u.jatahCuti;
                renderMyStats();
            }
        }

        // Info sisa jatah cuti tahunan ditampilkan otomatis di form pengajuan saat kategori = Cuti Tahunan
        function updateCutiInfoForm() {
            const jenis = document.getElementById('jenisIzin') ? document.getElementById('jenisIzin').value : null;
            const kategori = document.getElementById('kategoriIzin') ? document.getElementById('kategoriIzin').value : null;
            const infoEl = document.getElementById('infoSisaCutiForm');
            if (!infoEl) return;
            if (jenis === 'Izin' && kategori === 'cuti' && currentUser) {
                const info = getSisaCuti(currentUser);
                infoEl.innerText = `${t('Sisa jatah cuti tahunan Anda:')} ${info.sisa} ${t('dari')} ${info.jatah} ${t('hari')}.`;
                infoEl.classList.remove('hidden');
            } else {
                infoEl.classList.add('hidden');
            }
        }

        // Dipanggil otomatis oleh i18n.js (setLanguage) setiap kali user mengganti bahasa,
        // supaya bagian yang sudah ter-render (kalender, statistik, tabel) langsung
        // ikut berubah bahasa tanpa perlu reload halaman.
        function onLanguageChanged() {
            if (!currentUser) return;
            if (typeof renderMyStats === 'function') renderMyStats();
            if (typeof renderIzinCalendar === 'function') renderIzinCalendar('kalender', kalenderViewDate, true);
            if (typeof updateCutiInfoForm === 'function') updateCutiInfoForm();
            if (typeof renderTable === 'function') { try { renderTable(); } catch (e) {} }
            if (typeof renderTodayStats === 'function') { try { renderTodayStats(); } catch (e) {} }
        }

        function showForgotPasswordModal() { document.getElementById('forgotModal').classList.remove('hidden'); }
        function closeForgotModal() { document.getElementById('forgotModal').classList.add('hidden'); }
        function handleForgotSubmit() {
            const val = document.getElementById('forgotEmail').value.trim();
            if(!val) return alert('Isi email/username');
            closeForgotModal();
            showAlert(`Sistem mengirim link reset password ke email (${val}).`, 'success');
        }