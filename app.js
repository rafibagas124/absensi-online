        // DATABASE LOKAL
        let users = JSON.parse(localStorage.getItem('absensi_users')) || [
            { id: "EMP-001", nama: "Budi Santoso", jabatan: "Frontend Dev", tglMasuk: "2023-01-15", username: "user", pass: "123456", role: "karyawan", shift: "pagi" },
            { id: "HRD-101", nama: "Siti Rahma", jabatan: "HR Manager", tglMasuk: "2022-05-10", username: "hrd", pass: "123456", role: "hrd", shift: "pagi" },
            { id: "ADM-999", nama: "Administrator", jabatan: "System Admin", tglMasuk: "2021-01-01", username: "admin", pass: "123456", role: "admin", shift: "pagi" }
        ];
        // Migrasi data lama: pastikan setiap user punya field shift (default pagi)
        users.forEach(u => { if (!u.shift) u.shift = 'pagi'; });

        // ================== KONFIGURASI SHIFT KERJA (8 JAM/HARI) ==================
        const SHIFT_CONFIG = {
            pagi:  { label: "Pagi",  jamMasuk: 8,  menitMasuk: 0, jamPulang: 16, menitPulang: 0, labelMasuk: "08:00 WIB", labelPulang: "16:00 WIB" },
            siang: { label: "Siang", jamMasuk: 13, menitMasuk: 0, jamPulang: 21, menitPulang: 0, labelMasuk: "13:00 WIB", labelPulang: "21:00 WIB" }
        };
        function getShiftConfig(user) {
            return SHIFT_CONFIG[(user && user.shift) || 'pagi'];
        }

        let absensiLogs = JSON.parse(localStorage.getItem('absensi_logs')) || [];
        let currentUser = JSON.parse(sessionStorage.getItem('absensi_session')) || null;
        let currentGPS = "Lokasi belum didapatkan";
        let currentLat = null;
        let currentLng = null;
        let currentGPSValid = null; // true = dalam radius, false = di luar radius, null = belum ada acuan/lokasi
        let currentGPSDistance = null;

        // ================== LOKASI KANTOR (GEOFENCING) ==================
        // Disimpan oleh Admin lewat panel "Lokasi Kantor". Selama belum diatur
        // (null), validasi jarak GPS saat absen TIDAK diaktifkan (backward
        // compatible dengan perilaku sebelumnya).
        let officeLocation = JSON.parse(localStorage.getItem('absensi_office_location')) || null;
        function saveOfficeLocationToStorage() {
            localStorage.setItem('absensi_office_location', JSON.stringify(officeLocation));
        }

        // Rumus Haversine: menghitung jarak (meter) antara dua titik koordinat GPS
        function hitungJarakMeter(lat1, lng1, lat2, lng2) {
            const R = 6371000; // radius bumi (meter)
            const toRad = (d) => d * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // ================== KEAMANAN LOGIN (ANTI BRUTE-FORCE) ==================
        // Struktur per-username: { failCount, banUntil, banStage, permaBanned }
        let loginSecurity = JSON.parse(localStorage.getItem('absensi_security')) || {};
        function saveSecurity() { localStorage.setItem('absensi_security', JSON.stringify(loginSecurity)); }

        // Karyawan biasa: lebih ketat. Admin/HRD: diberi kelonggaran (threshold lebih tinggi, tanpa banned permanen).
        const SECURITY_RULES = {
            karyawan: { maxAttempt: 3, baseBanSeconds: 30, escalate: true, permaAfterStage: 3 },
            leniency: { maxAttempt: 5, baseBanSeconds: 15, escalate: false, permaAfterStage: Infinity } // admin & hrd
        };

        function getSecKey(username) { return (username || '').trim().toLowerCase(); }

        function getRuleForUsername(uInput) {
            const u = users.find(x => x.username.toLowerCase() === uInput.toLowerCase() || x.id.toLowerCase() === uInput.toLowerCase());
            if (u && (u.role === 'admin' || u.role === 'hrd')) return SECURITY_RULES.leniency;
            return SECURITY_RULES.karyawan;
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
            checkSession();
            setInterval(updateOverlayTime, 1000);
            setTimeout(loadFaceModels, 800); // preload model AI di background
            setTimeout(initGoogleSignIn, 500); // tunggu script Google Identity Services siap
            setTimeout(() => { if (typeof emailjs !== 'undefined') emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); }, 500); // init EmailJS untuk pengiriman OTP asli
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
            el.innerHTML = msg;
            setTimeout(() => el.classList.add('hidden'), 5000);
        }

        function handleLogin(e) {
            e.preventDefault();
            const uInput = document.getElementById('loginUser').value.trim();
            const pInput = document.getElementById('loginPass').value.trim();
            if (!uInput || !pInput) return;

            const secKey = getSecKey(uInput);
            let sec = loginSecurity[secKey] || { failCount: 0, banUntil: 0, banStage: 0, permaBanned: false };

            // 1. Cek apakah akun dikunci PERMANEN
            if (sec.permaBanned) {
                openAccountLockedModal(uInput);
                return;
            }

            // 2. Cek apakah sedang dalam masa BANNED sementara
            const now = Date.now();
            if (sec.banUntil && sec.banUntil > now) {
                const sisaDetik = Math.ceil((sec.banUntil - now) / 1000);
                showAlert(`<b>Akun diblokir sementara!</b> Terlalu banyak percobaan gagal. Coba lagi dalam <b>${sisaDetik} detik</b>.`);
                return;
            }

            const found = users.find(u => (u.username === uInput || u.id === uInput) && u.pass === pInput);

            if (found) {
                // Login berhasil -> reset seluruh riwayat keamanan akun ini
                delete loginSecurity[secKey];
                saveSecurity();
                currentUser = found;
                sessionStorage.setItem('absensi_session', JSON.stringify(currentUser));
                showAlert(`Selamat datang kembali, <b>${currentUser.nama}</b>!`, 'success');
                checkSession();
                return;
            }

            // Login gagal -> proses eskalasi keamanan
            const rule = getRuleForUsername(uInput);
            sec.failCount = (sec.failCount || 0) + 1;

            if (sec.failCount >= rule.maxAttempt) {
                sec.banStage = (sec.banStage || 0) + 1;
                sec.failCount = 0;

                if (sec.banStage >= rule.permaAfterStage) {
                    // Sudah 3x kena banned (khusus role karyawan) -> kunci permanen
                    sec.permaBanned = true;
                    sec.banUntil = 0;
                    loginSecurity[secKey] = sec;
                    saveSecurity();
                    openAccountLockedModal(uInput);
                    return;
                } else {
                    // Waktu banned bertambah setiap kali kena banned lagi (eskalasi)
                    const durasi = rule.escalate
                        ? rule.baseBanSeconds * Math.pow(2, sec.banStage - 1)
                        : rule.baseBanSeconds;
                    sec.banUntil = now + (durasi * 1000);
                    loginSecurity[secKey] = sec;
                    saveSecurity();
                    showAlert(`<b>Terlalu banyak percobaan gagal (${rule.maxAttempt}x)!</b> Akun diblokir sementara selama <b>${durasi} detik</b>.`);
                    return;
                }
            }

            loginSecurity[secKey] = sec;
            saveSecurity();
            const sisaPercobaan = rule.maxAttempt - sec.failCount;
            showAlert(`Email / Username / Password salah! Sisa percobaan sebelum diblokir: <b>${sisaPercobaan}x</b>.`);
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
            if (!u) return alert('ID Karyawan / Username lama tidak ditemukan.');

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

        // Admin: reset paksa status keamanan login user tertentu (kelonggaran untuk Admin/HRD & bantu karyawan terkunci)
        function resetUserSecurity(username) {
            const key = getSecKey(username);
            if (!loginSecurity[key]) { showAlert('Tidak ada riwayat blokir untuk user ini.'); return; }
            delete loginSecurity[key];
            saveSecurity();
            renderAdminUsers();
            showAlert(`Status keamanan login untuk <b>${username}</b> berhasil direset.`, 'success');
        }

        function logout() {
            sessionStorage.removeItem('absensi_session');
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
            const masterLabel = document.getElementById('masterDataLabel');

            karySec.classList.add('hidden');
            hrdSec.classList.add('hidden');
            admSec.classList.add('hidden');
            shiftSec.classList.add('hidden');
            lokasiSec.classList.add('hidden');
            btnPanel.classList.add('hidden');
            btnVerif.classList.add('hidden');
            btnShiftMaster.classList.add('hidden');
            btnUsers.classList.add('hidden');
            btnLokasi.classList.add('hidden');
            masterLabel.classList.add('hidden');

            if(!currentUser) {
                authWrap.classList.remove('hidden');
                appWrap.classList.add('hidden');
                return;
            }

            authWrap.classList.add('hidden');
            appWrap.classList.remove('hidden');
            document.getElementById('navUserName').innerText = currentUser.nama;
            document.getElementById('navUserRole').innerText = currentUser.role;

            if(currentUser.role === 'karyawan') {
                switchMainTab('absen');
            } else if(currentUser.role === 'hrd') {
                btnPanel.classList.remove('hidden');
                btnVerif.classList.remove('hidden');
                document.getElementById('lblTabPanelIcon').className = "fa-solid fa-chart-line w-4";
                document.getElementById('lblTabPanelText').innerText = "Monitoring & Rekap HRD";
                switchMainTab('absen');
            } else if(currentUser.role === 'admin') {
                btnPanel.classList.remove('hidden');
                btnVerif.classList.remove('hidden');
                btnShiftMaster.classList.remove('hidden');
                btnUsers.classList.remove('hidden');
                btnLokasi.classList.remove('hidden');
                masterLabel.classList.remove('hidden');
                document.getElementById('lblTabPanelIcon').className = "fa-solid fa-users-gear w-4";
                document.getElementById('lblTabPanelText').innerText = "Kelola User & Admin";
                switchMainTab('absen');
            }
            updateSuratPendingBadge();
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

            // Tampilkan jam masuk/pulang sesuai shift karyawan yang login
            const shiftCfg = getShiftConfig(currentUser);
            document.getElementById('myJamMasukLabel').innerText = shiftCfg.labelMasuk;
            document.getElementById('myJamPulangLabel').innerText = shiftCfg.labelPulang;
            document.getElementById('myShiftLabel').innerText = shiftCfg.label;

            renderMyStats();
        }

        function switchMainTab(tab) {
            const karySec = document.getElementById('karyawanSection');
            const hrdSec = document.getElementById('hrdSection');
            const admSec = document.getElementById('adminSection');
            const verSec = document.getElementById('verifikasiSection');
            const shiftSec = document.getElementById('shiftMasterSection');
            const lokasiSec = document.getElementById('lokasiKantorSection');
            const allBtns = ['btnTabAbsen','btnTabPanel','btnTabVerifikasi','btnTabShiftMaster','btnTabUsers','btnTabLokasi'].map(id => document.getElementById(id));

            karySec.classList.add('hidden');
            hrdSec.classList.add('hidden');
            admSec.classList.add('hidden');
            verSec.classList.add('hidden');
            shiftSec.classList.add('hidden');
            lokasiSec.classList.add('hidden');
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
                    // Akun Google belum terdaftar di sistem -> buat akun karyawan baru otomatis
                    found = {
                        id: "GGL-" + Date.now().toString().slice(-6),
                        nama: nama,
                        jabatan: "Karyawan Baru",
                        tglMasuk: new Date().toISOString().split('T')[0],
                        username: email,
                        pass: null, // Login via Google, tanpa password lokal
                        role: "karyawan",
                        shift: "pagi",
                        viaGoogle: true
                    };
                    users.push(found);
                    saveUsersToStorage();
                }

                currentUser = found;
                sessionStorage.setItem('absensi_session', JSON.stringify(currentUser));
                showAlert(`Berhasil masuk dengan Google sebagai <b>${currentUser.nama}</b>!`, 'success');
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
            const email = document.getElementById('regEmail').value.trim();
            const pass = document.getElementById('regPassword').value;
            const passConfirm = document.getElementById('regPasswordConfirm').value;
            const wa = document.getElementById('regWhatsapp').value.trim();

            if (pass !== passConfirm) { alert('Konfirmasi password tidak cocok.'); return; }
            const usernameTaken = users.some(u => u.username.toLowerCase() === email.toLowerCase());
            if (usernameTaken) { alert('Email ini sudah terdaftar, silakan gunakan email lain atau masuk.'); return; }

            // Simpan data akun sementara -> baru dibuat permanen setelah OTP email terverifikasi
            pendingRegistration = {
                id: "ADM-" + Date.now().toString().slice(-4),
                nama: company + " Admin",
                jabatan: "System Admin",
                tglMasuk: new Date().toISOString().split('T')[0],
                username: email,
                pass: pass,
                role: "admin",
                shift: "pagi",
                bidang: regSelectedBidang,
                whatsapp: wa
            };

            document.getElementById('otpTargetEmail').innerText = email;
            goRegStep(4);
            sendOtpToEmail(email);
        }

        // ================== VERIFIKASI OTP EMAIL (STEP 4 REGISTRASI) — ASLI VIA EMAILJS ==================
        // Kredensial EmailJS disamarkan (base64, dipecah) sebagai lapisan tambahan agar tidak langsung terbaca
        // sebagai teks polos di source code. CATATAN PENTING: ini BUKAN pengaman utama — key EmailJS memang
        // publik by design. Perlindungan sesungguhnya ada di dashboard EmailJS > Account > Security > Allowed
        // Origins, dengan mendaftarkan HANYA domain resmi (mis. namamu.vercel.app) yang boleh memakai key ini.
        const _ej = {
            a: ['c2Vy', 'dmljZV93', 'cnhmeHFp'],
            b: ['dGVt', 'cGxhdGVfazQx', 'NmF6OQ=='],
            c: ['cUxN', 'd0xmZHNla2xF', 'TlhoeXI=']
        };
        function _decodeKey(parts) { return atob(parts.join('')); }
        const EMAILJS_SERVICE_ID = _decodeKey(_ej.a);
        const EMAILJS_TEMPLATE_ID = _decodeKey(_ej.b);
        const EMAILJS_PUBLIC_KEY = _decodeKey(_ej.c);

        function generateOtpCode() {
            return String(Math.floor(100000 + Math.random() * 900000));
        }

        function sendOtpToEmail(email) {
            pendingOtpCode = generateOtpCode();
            otpExpireAt = Date.now() + (5 * 60 * 1000); // berlaku 5 menit
            document.getElementById('otpErrorMsg').classList.add('hidden');
            document.querySelectorAll('.otp-digit').forEach(el => el.value = '');

            const devNote = document.getElementById('otpDevNote');
            const devCode = document.getElementById('otpDevCode');
            const sendBtn = document.querySelector('#regStep4 button[type="submit"]');

            const waktuKedaluwarsa = new Date(otpExpireAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            if (typeof emailjs === 'undefined') {
                // Fallback kalau SDK EmailJS gagal dimuat (mis. tidak ada internet) -> tampilkan mode demo agar tetap bisa diuji
                devNote.classList.remove('hidden');
                devCode.innerText = pendingOtpCode;
                showAlert('Layanan pengirim email tidak dapat dimuat. Menampilkan kode OTP sementara di layar (mode cadangan).');
                startOtpResendCooldown();
                return;
            }

            devNote.classList.add('hidden');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.innerText = 'Mengirim OTP...'; }

            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                email: email,
                passcode: pendingOtpCode,
                time: waktuKedaluwarsa
            }, EMAILJS_PUBLIC_KEY)
            .then(() => {
                showAlert(`Kode OTP telah dikirim ke <b>${email}</b>. Cek inbox (atau folder spam) email Anda. Berlaku hingga <b>${waktuKedaluwarsa}</b>.`, 'success');
                startOtpResendCooldown();
            })
            .catch((err) => {
                console.error('Gagal mengirim OTP via EmailJS:', err);
                // Fallback: tampilkan kode di layar supaya pendaftaran tetap bisa dilanjutkan meski pengiriman email gagal
                devNote.classList.remove('hidden');
                devCode.innerText = pendingOtpCode;
                showAlert('Gagal mengirim email OTP (periksa koneksi/konfigurasi EmailJS). Kode OTP sementara ditampilkan di layar agar Anda tetap bisa lanjut.');
                startOtpResendCooldown();
            })
            .finally(() => {
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerText = 'Verifikasi & Selesaikan Pendaftaran'; }
            });
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

        function handleVerifyOtp(e) {
            e.preventDefault();
            const digits = Array.from(document.querySelectorAll('#otpInputGroup .otp-digit')).map(el => el.value.trim());
            const inputCode = digits.join('');
            const errEl = document.getElementById('otpErrorMsg');

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

            // OTP valid -> akun perusahaan baru resmi dibuat
            users.push(pendingRegistration);
            saveUsersToStorage();
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

        // Dipanggil dari tombol "Matikan Kamera" (aksi manual oleh karyawan)
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
            if(el) { el.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>${new Date().toLocaleTimeString('id-ID')}`; }
        }

        function getGPSLocation() {
            const addrEl = document.getElementById('gpsAddress');
            if(!navigator.geolocation) return addrEl.innerText = "Geolocation tidak didukung.";
            addrEl.innerText = "Mendeteksi lokasi GPS...";
            navigator.geolocation.getCurrentPosition(
                pos => {
                    currentLat = pos.coords.latitude;
                    currentLng = pos.coords.longitude;
                    const coordText = `Lat: ${currentLat.toFixed(5)}, Lng: ${currentLng.toFixed(5)}`;

                    if (officeLocation) {
                        currentGPSDistance = Math.round(hitungJarakMeter(currentLat, currentLng, officeLocation.lat, officeLocation.lng));
                        currentGPSValid = currentGPSDistance <= officeLocation.radius;
                        currentGPS = `${coordText} (${currentGPSDistance}m dari kantor)`;
                        addrEl.innerHTML = currentGPS + (currentGPSValid
                            ? ' <span class="text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check mr-0.5"></i>Dalam radius kantor</span>'
                            : ' <span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>Di luar radius kantor</span>');
                    } else {
                        currentGPSValid = null;
                        currentGPSDistance = null;
                        currentGPS = coordText;
                        addrEl.innerHTML = currentGPS + ' <span class="text-slate-400">(lokasi kantor belum diatur Admin)</span>';
                    }
                },
                err => {
                    currentLat = null;
                    currentLng = null;
                    currentGPSValid = false;
                    currentGPSDistance = null;
                    currentGPS = "Lokasi GPS tidak tersedia";
                    addrEl.innerText = currentGPS + " [Izin Lokasi Ditolak]";
                }
            );
        }

        // LOGIKA ABSEN MASUK & PULANG (LENGKAP DENGAN ANTI-CHEAT)
        function submitAbsen(tipe) {
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

            // ================== GATING LOKASI GPS (GEOFENCING KANTOR) ==================
            // Hanya aktif kalau Admin sudah mengatur lokasi kantor. Kalau belum
            // diatur, perilaku lama tetap berlaku (tidak ada validasi jarak).
            if (officeLocation) {
                if (currentLat === null || currentLng === null) {
                    return showAlert('<b>Lokasi GPS belum terdeteksi!</b> Klik tombol ambil lokasi / izinkan akses lokasi terlebih dahulu.');
                }
                if (currentGPSValid === false) {
                    return showAlert(`<b>Di luar area kantor!</b> Jarak Anda saat ini sekitar <b>${currentGPSDistance} meter</b> dari kantor (maksimal ${officeLocation.radius} meter). Absen hanya bisa dilakukan di sekitar lokasi kantor.`);
                }
            }

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const jamNow = now.getHours();
            const menitNow = now.getMinutes();
            const waktuStr = now.toLocaleTimeString('id-ID');
            const shiftCfg = getShiftConfig(currentUser); // Jam masuk/pulang mengikuti shift karyawan (Pagi/Siang), total tetap 8 jam

            // Cari apakah user sudah pernah absen hari ini
            let existingRecord = absensiLogs.find(l => l.userId === currentUser.id && l.tanggal === todayStr);

            if (tipe === 'Masuk') {
                if (existingRecord) {
                    return showAlert('Anda sudah melakukan Absen Masuk hari ini!', 'error');
                }

                // Terlambat dihitung relatif terhadap jam masuk shift karyawan (bukan hardcode 08:00)
                const totalMenitNow = (jamNow * 60) + menitNow;
                const batasMenitMasuk = (shiftCfg.jamMasuk * 60) + shiftCfg.menitMasuk;
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
                    lokasi: currentGPS
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

                // VALIDASI LICIK 3: Jam Pulang Minimal sesuai shift karyawan (Pagi 16:00 / Siang 21:00), memastikan 8 jam kerja terpenuhi
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

        function toggleUploadSurat() {
            const jenis = document.getElementById('jenisIzin').value;
            const container = document.getElementById('containerUploadSurat');
            if (jenis === 'Sakit') container.classList.remove('hidden');
            else container.classList.add('hidden');
        }

        async function submitIzin(e) {
            e.preventDefault();
            const jenis = document.getElementById('jenisIzin').value;
            const alasan = document.getElementById('alasanIzin').value;
            const fileInput = document.getElementById('fileSuratDokter');
            const now = new Date();

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

            const newLog = {
                id: Date.now(),
                userId: currentUser.id,
                nama: currentUser.nama,
                jabatan: currentUser.jabatan,
                tglMasuk: currentUser.tglMasuk,
                status: jenis,
                waktuMasuk: now.toLocaleTimeString('id-ID'),
                waktuPulang: '-',
                tanggal: now.toISOString().split('T')[0],
                lokasi: 'Keterangan: ' + alasan,
                suratDokter: suratDokter,
                statusVerifikasi: jenis === 'Sakit' ? 'Menunggu Verifikasi' : null,
                catatanVerifikasi: '',
                verifikatorNama: ''
            };

            absensiLogs.unshift(newLog);
            saveLogsToStorage();
            showAlert(`Pengajuan ${jenis} berhasil dikirim!` + (suratDokter ? ' Surat dokter akan diverifikasi HRD/Admin.' : ''), 'success');
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

            // Status verifikasi surat dokter milik karyawan yang sedang login
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

        // Hitung rekap total Hadir/Terlambat/Izin/Sakit untuk satu karyawan (all-time)
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

                // Rekap total per-karyawan (di-cache supaya tidak dihitung ulang untuk karyawan yang sama)
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
                tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Belum ada surat dokter yang dikirimkan karyawan.</td></tr>`;
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
                <p><b>Karyawan:</b> ${log.nama} (${log.userId})</p>
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

        // ================== PENGATURAN LOKASI KANTOR (ADMIN, GEOFENCING) ==================
        function renderLokasiKantorForm() {
            const latEl = document.getElementById('kantorLat');
            const lngEl = document.getElementById('kantorLng');
            const radiusEl = document.getElementById('kantorRadius');
            const statusEl = document.getElementById('kantorStatusInfo');
            if (!latEl || !lngEl || !radiusEl || !statusEl) return;

            if (officeLocation) {
                latEl.value = officeLocation.lat;
                lngEl.value = officeLocation.lng;
                radiusEl.value = officeLocation.radius;
                statusEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i>Lokasi kantor aktif: <b>${officeLocation.lat.toFixed(5)}, ${officeLocation.lng.toFixed(5)}</b> &mdash; radius <b>${officeLocation.radius} meter</b>. Karyawan di luar radius ini akan ditolak saat mencoba absen.`;
            } else {
                latEl.value = '';
                lngEl.value = '';
                radiusEl.value = 100;
                statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i>Lokasi kantor <b>belum diatur</b>. Selama belum diatur, validasi jarak GPS saat absen tidak aktif (karyawan bisa absen dari mana saja).`;
            }
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
                    showAlert('Koordinat lokasi Anda saat ini berhasil diambil. Pastikan Anda sedang benar-benar berada di lokasi kantor, lalu klik "Simpan Lokasi Kantor".', 'success');
                },
                err => {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-location-crosshairs mr-1"></i>Ambil Lokasi Saat Ini'; }
                    showAlert('Gagal mengambil lokasi GPS. Pastikan izin lokasi browser sudah diizinkan.', 'error');
                }
            );
        }

        function saveLokasiKantor(e) {
            e.preventDefault();
            const lat = parseFloat(document.getElementById('kantorLat').value);
            const lng = parseFloat(document.getElementById('kantorLng').value);
            const radius = parseInt(document.getElementById('kantorRadius').value, 10);

            if (isNaN(lat) || lat < -90 || lat > 90) return showAlert('Latitude tidak valid (harus di antara -90 sampai 90).');
            if (isNaN(lng) || lng < -180 || lng > 180) return showAlert('Longitude tidak valid (harus di antara -180 sampai 180).');
            if (isNaN(radius) || radius < 10) return showAlert('Radius toleransi minimal 10 meter.');

            officeLocation = { lat, lng, radius };
            saveOfficeLocationToStorage();
            renderLokasiKantorForm();
            showAlert(`Lokasi kantor berhasil disimpan (radius ${radius} meter). Validasi jarak GPS saat absen sekarang aktif untuk seluruh karyawan.`, 'success');
        }

        function hapusLokasiKantor() {
            if (!officeLocation) return;
            officeLocation = null;
            saveOfficeLocationToStorage();
            renderLokasiKantorForm();
            showAlert('Lokasi kantor dihapus. Validasi jarak GPS saat absen dinonaktifkan sementara.', 'success');
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
                tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400 italic">Jam kerja tidak ditemukan.</td></tr>`;
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
                        <td class="p-3">15 menit</td>
                        <td class="p-3"><span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">${jumlahKaryawan} Karyawan</span></td>
                        <td class="p-3"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">AKTIF</span></td>
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
                        <td class="p-2 capitalize"><span class="bg-slate-100 px-2 py-0.5 rounded">${u.role}</span></td>
                        <td class="p-2">${secBadge}</td>
                        <td class="p-2 text-center space-x-2">
                            <button onclick="openShiftModal('${u.id}')" class="text-indigo-600 hover:underline text-[11px]">Atur Shift</button>
                            ${resetBtn}
                            <button onclick="deleteUser('${u.id}')" class="text-red-600 hover:underline text-[11px]">Hapus</button>
                        </td>
                    </tr>
                `;
            });
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
                shift: document.getElementById('addShift').value
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
            // Jika karyawan yang shift-nya diubah sedang login di tab ini, sinkronkan tampilannya
            if (currentUser && currentUser.id === u.id) {
                currentUser.shift = u.shift;
                sessionStorage.setItem('absensi_session', JSON.stringify(currentUser));
                setupKaryawanView();
            }
        }

        function deleteUser(id) {
            users = users.filter(u => u.id !== id);
            saveUsersToStorage();
            renderAdminUsers();
            showAlert('User berhasil dihapus.');
        }

        function showForgotPasswordModal() { document.getElementById('forgotModal').classList.remove('hidden'); }
        function closeForgotModal() { document.getElementById('forgotModal').classList.add('hidden'); }
        function handleForgotSubmit() {
            const val = document.getElementById('forgotEmail').value.trim();
            if(!val) return alert('Isi email/username');
            closeForgotModal();
            showAlert(`Sistem mengirim link reset password ke email (${val}).`, 'success');
        }
