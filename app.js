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

// ================== KONFIGURASI SUPABASE (menggantikan API_BASE_URL PHP) ==================
        // Semua operasi database, auth, dan storage sekarang melalui Supabase SDK
        // (lihat supabase_client.js untuk implementasi fungsinya)

        // DATABASE LOKAL (hanya untuk kompatibilitas sementara, data asli dari Supabase)
        let users = [];
        // Migrasi data lama: pastikan setiap user punya field shift (default pagi)
        users.forEach(u => {
            if (!u.shift) u.shift = 'pagi';
            if (typeof u.allowChangePassword === 'undefined') u.allowChangePassword = false;
            if (!u.role) u.role = 'staff';
            if (u.role === 'karyawan') u.role = 'staff';
            if (typeof u.jatahCuti === 'undefined') u.jatahCuti = 12;
        });

        // ================== KONFIGURASI SHIFT KERJA (SUMBER UTAMA: SUPABASE) ==================
        const DEFAULT_SHIFT_CONFIG = {
            pagi:  { label: "Pagi",  jamMasuk: 8,  menitMasuk: 0, jamPulang: 16, menitPulang: 0, toleransi: 15, labelMasuk: "08:00 WIB", labelPulang: "16:00 WIB" },
            siang: { label: "Siang", jamMasuk: 13, menitMasuk: 0, jamPulang: 21, menitPulang: 0, toleransi: 15, labelMasuk: "13:00 WIB", labelPulang: "21:00 WIB" }
        };
        let SHIFT_CONFIG = JSON.parse(JSON.stringify(DEFAULT_SHIFT_CONFIG));
        // Migrasi: pastikan field lengkap (jaga-jaga config lama tersimpan sebagian)
        Object.keys(DEFAULT_SHIFT_CONFIG).forEach(key => {
            if (!SHIFT_CONFIG[key]) SHIFT_CONFIG[key] = JSON.parse(JSON.stringify(DEFAULT_SHIFT_CONFIG[key]));
            if (typeof SHIFT_CONFIG[key].toleransi === 'undefined') SHIFT_CONFIG[key].toleransi = 15;
        });
        function applyServerShiftConfigs(configs) {
            if (!Array.isArray(configs) || configs.length === 0) return;
            SHIFT_CONFIG = Object.fromEntries(configs.map(config => [config.shift_key, {
                label: config.label,
                jamMasuk: Number(config.jam_masuk), menitMasuk: Number(config.menit_masuk),
                jamPulang: Number(config.jam_pulang), menitPulang: Number(config.menit_pulang),
                toleransi: Number(config.toleransi),
                labelMasuk: `${pad2(config.jam_masuk)}:${pad2(config.menit_masuk)} WIB`,
                labelPulang: `${pad2(config.jam_pulang)}:${pad2(config.menit_pulang)} WIB`
            }]));
        }

        async function loadShiftConfigsFromServer() {
            if (!currentUser || typeof sbGetShiftConfigs !== 'function') return;
            try { applyServerShiftConfigs(await sbGetShiftConfigs(currentUser.company_id)); }
            catch (err) { console.error('Gagal memuat konfigurasi shift:', err); }
        }
        function pad2(n) { return String(n).padStart(2, '0'); }
        function getShiftConfig(user) {
            return SHIFT_CONFIG[(user && user.shift) || 'pagi'];
        }

        const SHIFT_REMINDER_MINUTES = 30; // 30 menit sebelum jam shift masuk/pulang
        let shiftReminderTimer = null;
        let shiftReminderBusy = false;
        let lastShiftReminderConfigRefresh = 0;

        function getReminderStorageKey(action, date) {
            return `absensipro_shift_reminder:${currentUser.company_id}:${currentUser.id}:${date}:${action}`;
        }

        // ================== TOAST NOTIFIKASI SHIFT REMINDER (In-App) ==================
        // Toast ini muncul di sudut kanan bawah layar, lebih mencolok dari alert biasa.
        // Punya tombol "Absen Sekarang" yang langsung fokus ke tab absen.
        function showShiftReminderToast(action, shiftCfg) {
            // Hapus toast lama jika ada
            const old = document.getElementById('shiftReminderToast');
            if (old) old.remove();

            const timeLabel = action === 'Masuk' ? shiftCfg.labelMasuk : shiftCfg.labelPulang;
            const iconClass = action === 'Masuk' ? 'fa-right-to-bracket text-emerald-400' : 'fa-right-from-bracket text-rose-400';
            const colorClass = action === 'Masuk' ? 'border-emerald-500' : 'border-rose-500';
            const msgId   = t(`Pengingat: Shift ${shiftCfg.label} ${action} pukul ${timeLabel}`);
            const msgBody = action === 'Masuk'
                ? t(`Persiapkan diri Anda. Absen Masuk akan dibuka sebentar lagi.`)
                : t(`Jangan lupa Absen Pulang sebelum meninggalkan kantor.`);

            const toast = document.createElement('div');
            toast.id = 'shiftReminderToast';
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.className = `fixed bottom-4 right-4 z-[9999] w-[320px] max-w-[calc(100vw-2rem)] bg-slate-800 border-l-4 ${colorClass} rounded-xl shadow-2xl p-4 flex flex-col gap-2 animate-bounce-once`;
            toast.innerHTML = `
                <div class="flex items-start gap-3">
                    <i class="fa-solid ${iconClass} text-xl mt-0.5 flex-shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-white font-bold text-sm leading-tight">${t('Pengingat Shift')} — ${shiftCfg.label}</p>
                        <p class="text-slate-300 text-xs mt-0.5 leading-snug">${msgBody}</p>
                        <p class="text-slate-400 text-[10px] mt-1">${t('Jam')} ${action}: <span class="text-white font-semibold">${timeLabel}</span></p>
                    </div>
                    <button onclick="document.getElementById('shiftReminderToast')?.remove()" class="text-slate-500 hover:text-white ml-1 flex-shrink-0" title="${t('Tutup')}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <button onclick="switchMainTab('absen'); document.getElementById('shiftReminderToast')?.remove();"
                    class="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition">
                    <i class="fa-solid fa-clock-rotate-left mr-1"></i>${t('Absen Sekarang')}
                </button>
            `;

            document.body.appendChild(toast);

            // Hilangkan otomatis setelah 20 detik (tidak terlalu mengganggu)
            setTimeout(() => {
                const el = document.getElementById('shiftReminderToast');
                if (el) el.remove();
            }, 20000);

            // Vibrate (mobile) jika tersedia
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }

        function sendShiftReminder(action, shiftCfg, minutesUntil) {
            const date = new Date().toISOString().split('T')[0];
            const storageKey = getReminderStorageKey(action, date);
            if (localStorage.getItem(storageKey) === 'sent') return;

            // Tampilkan toast in-app yang mencolok
            showShiftReminderToast(action, shiftCfg);

            // Kirim juga notifikasi OS (jika izin sudah diberikan)
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const body = action === 'Masuk'
                    ? t(`Shift ${shiftCfg.label} dimulai pukul ${shiftCfg.labelMasuk}. Jangan lupa Absen Masuk!`)
                    : t(`Waktu Absen Pulang Shift ${shiftCfg.label} pukul ${shiftCfg.labelPulang} sudah mendekat.`);
                new Notification(t('Pengingat AbsensiPro 🔔'), {
                    body,
                    tag:  `shift-${action}-${date}`,
                    icon: './icons/icon-192.png',
                    badge: './icons/icon-192.png'
                });
            }

            localStorage.setItem(storageKey, 'sent');
        }

        async function checkShiftReminder() {
            if (shiftReminderBusy || !currentUser || !['karyawan', 'staff', 'magang'].includes(currentUser.role)) return;
            shiftReminderBusy = true;
            try {
                // Refresh config dari server setiap 1 menit (bukan 5) agar perubahan admin langsung terasa
                if (Date.now() - lastShiftReminderConfigRefresh > 60000) {
                    await loadShiftConfigsFromServer();
                    lastShiftReminderConfigRefresh = Date.now();
                    // Update tampilan jam shift di card staff jika ada perubahan
                    if (typeof setupKaryawanView === 'function') setupKaryawanView();
                }
                const shiftCfg = getShiftConfig(currentUser);
                if (!shiftCfg) return;
                const now = new Date();
                const minutesNow = now.getHours() * 60 + now.getMinutes();
                const masukAt   = shiftCfg.jamMasuk  * 60 + shiftCfg.menitMasuk;
                const pulangAt  = shiftCfg.jamPulang * 60 + shiftCfg.menitPulang;
                const date = now.toISOString().split('T')[0];

                // Cek log absensi hari ini
                let logs = typeof sbGetMyTodayLog === 'function' ? await sbGetMyTodayLog(currentUser.id) : [];
                if ((!logs || logs.length === 0) && !navigator.onLine) {
                    logs = absensiLogs.filter(log => log.userId === currentUser.id && log.tanggal === date);
                }
                const hasMasuk  = logs.some(log => log.tipe === 'Masuk');
                const hasPulang = logs.some(log => log.tipe === 'Pulang');

                // Kirim reminder masuk: 30 menit sebelum jam masuk dan belum absen masuk
                if (!hasMasuk && minutesNow >= masukAt - SHIFT_REMINDER_MINUTES && minutesNow <= masukAt) {
                    sendShiftReminder('Masuk', shiftCfg, masukAt - minutesNow);
                }
                // Kirim reminder pulang: 30 menit sebelum jam pulang, sudah masuk tapi belum pulang
                if (hasMasuk && !hasPulang && minutesNow >= pulangAt - SHIFT_REMINDER_MINUTES && minutesNow <= pulangAt) {
                    sendShiftReminder('Pulang', shiftCfg, pulangAt - minutesNow);
                }
            } finally {
                shiftReminderBusy = false;
            }
        }

        function startShiftReminder() {
            if (shiftReminderTimer) clearInterval(shiftReminderTimer);
            checkShiftReminder();
            shiftReminderTimer = setInterval(checkShiftReminder, 30000);
        }

        function stopShiftReminder() {
            if (shiftReminderTimer) clearInterval(shiftReminderTimer);
            shiftReminderTimer = null;
        }

        // ================== PUSH NOTIFICATIONS (WEB PUSH via VAPID) ==================
        let pushNotifEnabled = false;

        // Cek apakah push notification sudah aktif (dari localStorage flag)
        function checkPushNotifStatus() {
            pushNotifEnabled = localStorage.getItem(`absensipro_push_active:${currentUser?.id}`) === '1'
                && typeof Notification !== 'undefined'
                && Notification.permission === 'granted';
            updatePushNotifCard();
        }

        function updatePushNotifCard() {
            const card  = document.getElementById('pushNotifCard');
            const btn   = document.getElementById('btnEnablePush');
            const btnOff = document.getElementById('btnDisablePush');
            const statusEl = document.getElementById('pushNotifStatus');
            if (!card) return;

            if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
                card.innerHTML = `<div class="flex items-center gap-2 text-amber-600 text-xs"><i class="fa-solid fa-triangle-exclamation"></i><span>${t('Browser ini tidak mendukung notifikasi push.')}</span></div>`;
                return;
            }

            if (pushNotifEnabled && Notification.permission === 'granted') {
                if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-bell text-emerald-400 mr-1"></i><span class="text-emerald-400 font-semibold">${t('Notifikasi Aktif ✅')}</span>`;
                if (btn)    btn.classList.add('hidden');
                if (btnOff) btnOff.classList.remove('hidden');
            } else {
                if (statusEl) statusEl.innerHTML = `<i class="fa-regular fa-bell-slash text-slate-400 mr-1"></i><span class="text-slate-400">${t('Notifikasi belum aktif')}</span>`;
                if (btn)    btn.classList.remove('hidden');
                if (btnOff) btnOff.classList.add('hidden');
            }
        }

        async function enablePushNotifications() {
            const button = document.getElementById('btnEnablePush');
            if (!currentUser || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
                return showAlert(t('Notifikasi perangkat tidak didukung browser ini.'), 'error');
            }
            if (button) { button.disabled = true; button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>${t('Mengaktifkan...')}`; }
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    showAlert(t('Izin notifikasi ditolak. Aktifkan notifikasi dari pengaturan browser.'), 'error');
                    return;
                }
                const configResponse = await fetch('./api/push-config');
                if (!configResponse.ok) throw new Error(t('Layanan notifikasi belum dikonfigurasi di Vercel.'));
                const { publicKey } = await configResponse.json();

                const registration = await navigator.serviceWorker.ready;

                // Konversi VAPID public key dari URL-safe base64 ke Uint8Array
                const b64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
                const padding = '='.repeat((4 - b64.length % 4) % 4);
                const applicationServerKey = Uint8Array.from(atob(b64 + padding), c => c.charCodeAt(0));

                const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
                const { data: sessionData } = await sb.auth.getSession();
                const saveResponse = await fetch('./api/push-subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
                    body: JSON.stringify({ subscription: subscription.toJSON() })
                });
                if (!saveResponse.ok) throw new Error(t('Gagal mendaftarkan perangkat untuk notifikasi.'));

                localStorage.setItem(`absensipro_push_active:${currentUser.id}`, '1');
                pushNotifEnabled = true;
                updatePushNotifCard();
                showAlert(t('Notifikasi pengingat shift berhasil diaktifkan.'), 'success');
            } catch (error) {
                showAlert(error.message || t('Notifikasi tidak dapat diaktifkan.'), 'error');
            } finally {
                if (button) { button.disabled = false; button.innerHTML = `<i class="fa-solid fa-bell mr-1"></i>${t('Aktifkan Notifikasi')}`; }
            }
        }

        async function disablePushNotifications() {
            const btnOff = document.getElementById('btnDisablePush');
            if (btnOff) { btnOff.disabled = true; btnOff.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>${t('Menonaktifkan...')}`; }
            try {
                // Unsubscribe dari browser push manager
                const registration = await navigator.serviceWorker.ready;
                const sub = await registration.pushManager.getSubscription();
                if (sub) await sub.unsubscribe();

                // Hapus dari server
                const { data: sessionData } = await sb.auth.getSession();
                await fetch('./api/push-unsubscribe', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${sessionData.session?.access_token || ''}` }
                });

                localStorage.removeItem(`absensipro_push_active:${currentUser.id}`);
                pushNotifEnabled = false;
                updatePushNotifCard();
                showAlert(t('Notifikasi shift dinonaktifkan.'), 'success');
            } catch (err) {
                showAlert(err.message || t('Gagal menonaktifkan notifikasi.'), 'error');
            } finally {
                if (btnOff) { btnOff.disabled = false; btnOff.innerHTML = `<i class="fa-regular fa-bell-slash mr-1"></i>${t('Nonaktifkan Notifikasi')}`; }
            }
        }

        // ================== SUPABASE REALTIME: PERUBAHAN SHIFT CONFIG ==================
        // Ketika admin/hrd mengubah jam shift, semua client yang online langsung mendapat
        // update tanpa perlu menunggu interval 1 menit berikutnya.
        let shiftRealtimeChannel = null;

        function setupShiftConfigRealtime() {
            if (!currentUser || !sb || typeof sb.channel !== 'function') return;
            // Bersihkan channel lama jika ada
            if (shiftRealtimeChannel) {
                sb.removeChannel(shiftRealtimeChannel);
                shiftRealtimeChannel = null;
            }
            shiftRealtimeChannel = sb
                .channel(`shift-config-company-${currentUser.company_id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'shift_configs',
                    filter: `company_id=eq.${currentUser.company_id}`
                }, async () => {
                    // Shift berubah: muat ulang config dan update UI
                    await loadShiftConfigsFromServer();
                    lastShiftReminderConfigRefresh = Date.now();
                    if (typeof setupKaryawanView === 'function') setupKaryawanView();
                })
                .subscribe();
        }

        function teardownShiftConfigRealtime() {
            if (shiftRealtimeChannel && sb && typeof sb.removeChannel === 'function') {
                sb.removeChannel(shiftRealtimeChannel);
                shiftRealtimeChannel = null;
            }
        }


        // ================== PERMINTAAN UBAH PASSWORD KARYAWAN (BUTUH PERSETUJUAN ADMIN/HRD) ==================
        let passwordRequests = JSON.parse(localStorage.getItem('absensi_pwreq')) || [];
        function savePwReqToStorage() { localStorage.setItem('absensi_pwreq', JSON.stringify(passwordRequests)); }

        let absensiLogs = [];
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
                officeLocations = await sbGetOfficeLocations();
            } catch (err) {
                officeLocations = [];
                console.error('Gagal memuat lokasi kantor dari Supabase:', err);
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

        function hitungMasaKerja(tglMasukStr) {
            if (!tglMasukStr) return "-";
            const masuk = new Date(tglMasukStr);
            const sekarang = new Date();
            let tahun = sekarang.getFullYear() - masuk.getFullYear();
            let bulan = sekarang.getMonth() - masuk.getMonth();
            if (bulan < 0) { tahun--; bulan += 12; }
            let hasil = [];
            if (tahun > 0) hasil.push(`${tahun} ${t('Thn')}`);
            if (bulan > 0 || tahun === 0) hasil.push(`${bulan} ${t('Bln')}`);
            return hasil.join(' ') || t("Baru Masuk");
        }

        // HITUNG DURASI JAM KERJA
        function hitungDurasiKerja(waktuMasuk, waktuPulang) {
            if(!waktuMasuk || !waktuPulang || waktuPulang === '-') return t("Sedang Bekerja...");
            
            const [h1, m1] = waktuMasuk.split(':').map(Number);
            const [h2, m2] = waktuPulang.split(':').map(Number);
            
            let totalMenit1 = (h1 * 60) + m1;
            let totalMenit2 = (h2 * 60) + m2;
            
            let selisihMenit = totalMenit2 - totalMenit1;
            if(selisihMenit < 0) return "-";

            let jam = Math.floor(selisihMenit / 60);
            let menit = selisihMenit % 60;

            return `${jam} ${t('Jam')} ${menit} ${t('Mnt')}`;
        }

        document.addEventListener("DOMContentLoaded", () => {
            saveUsersToStorage();
            restoreSessionFromServer(); // cek sesi login ke Supabase, lalu panggil checkSession()
            loadOfficeLocationsFromServer(); // ambil daftar kantor dari Supabase
            updateOfflineUI(); // inisialisasi status koneksi & antrean offline PWA
            setInterval(updateOverlayTime, 1000);
            setTimeout(loadFaceModels, 800); // preload model AI di background
            setTimeout(initGoogleSignIn, 500); // tunggu script Google Identity Services siap
            setTimeout(() => syncOfflineQueue(false), 2500); // otomatis sinkron antrean offline jika ada saat start
        });

        function saveUsersToStorage() { localStorage.setItem('absensi_users', JSON.stringify(users)); }
        function saveLogsToStorage() { /* Log absensi disimpan di Supabase; offline memakai antrean khusus. */ }

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

        // Normalisasi data profil dari Supabase ke format yang dipakai app.js
        // Supabase sudah jadi sumber kebenaran tunggal — tidak perlu merge localStorage lagi.
        function mergeLocalProfileFields(serverUser) {
            if (!serverUser) return serverUser;
            return {
                ...serverUser,
                // Pastikan semua alias tersedia
                shift: serverUser.shift || 'pagi',
                jatahCuti: serverUser.jatahCuti ?? serverUser.jatah_cuti ?? 12,
                tglMasuk: serverUser.tglMasuk || serverUser.tgl_masuk || new Date().toISOString().split('T')[0],
                allowChangePassword: !!(serverUser.allowChangePassword || serverUser.allow_change_password),
                mustChangePassword: !!(serverUser.mustChangePassword || serverUser.must_change_password),
            };
        }

        // ================== LOGIN (SEKARANG KE SUPABASE DENGAN PROTEKSI TINGGI) ==================
        async function handleLogin(e) {
            e.preventDefault();
            let kodePerusahaan = document.getElementById('loginCompanyCode').value.trim();
            let uInput = document.getElementById('loginUser').value.trim();
            const pInput = document.getElementById('loginPass').value;
            if (!kodePerusahaan || !uInput || !pInput) return;

            // 1. Sanitasi Input
            if (window.SecuritySanitizer) {
                kodePerusahaan = window.SecuritySanitizer.sanitizeText(kodePerusahaan, 30).toUpperCase();
                uInput = window.SecuritySanitizer.sanitizeText(uInput, 150);
            }

            // 2. Cek Rate Limiter & Anti Brute-Force
            if (window.RateLimiter) {
                const limitCheck = window.RateLimiter.checkLimit('login', uInput, 5, 300, 60);
                if (!limitCheck.allowed) {
                    showAlert(`<b>${limitCheck.message}</b>`, 'error');
                    return;
                }
            }

            const btnSubmit = e.target.querySelector('button[type="submit"]');
            if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.dataset.originalHtml = btnSubmit.innerHTML; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memeriksa akun...'; }

            try {
                // uInput bisa berupa email
                const userData = await sbLogin({ kode_perusahaan: kodePerusahaan, email: uInput, password: pInput });
                currentUser = mergeLocalProfileFields(userData);
                await loadShiftConfigsFromServer();

                // Reset counter gagal jika login sukses
                if (window.RateLimiter) window.RateLimiter.recordSuccess('login', uInput);
                if (window.SecurityLogger) {
                    window.SecurityLogger.log({
                        eventType: 'SUCCESSFUL_LOGIN',
                        severity: 'INFO',
                        details: { email: uInput, companyCode: kodePerusahaan }
                    });
                }

                // Muat ulang data setelah login berhasil
                await loadOfficeLocationsFromServer();
                await loadAbsensiLogsFromSupabase();
                startShiftReminder();
                showAlert(`Selamat datang kembali, <b>${currentUser.nama}</b>!`, 'success');
                checkSession();
            } catch (err) {
                // Catat kegagalan login untuk mendeteksi brute force
                if (window.RateLimiter) window.RateLimiter.recordFailure('login', uInput, 5, 300, 60);
                if (window.SecurityLogger) {
                    window.SecurityLogger.log({
                        eventType: 'FAILED_LOGIN',
                        severity: 'WARNING',
                        details: { email: uInput, error: err.message, companyCode: kodePerusahaan }
                    });
                }
                showAlert(`<b>${err.message}</b>`, 'error');
            } finally {
                if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = btnSubmit.dataset.originalHtml; }
            }
        }

        // Dipanggil sekali saat halaman dimuat: cek ke Supabase apakah sesi login masih aktif
        async function restoreSessionFromServer() {
            try {
                const userData = await sbGetCurrentUser();
                if (userData) {
                    currentUser = mergeLocalProfileFields(userData);
                    await loadShiftConfigsFromServer();
                    await loadAbsensiLogsFromSupabase();
                    startShiftReminder();
                } else {
                    currentUser = null;
                }
            } catch (err) {
                currentUser = null;
                console.error('Restore session error:', err);
            }
            checkSession();
        }

        // Load semua log absensi dari Supabase ke variabel absensiLogs
        async function loadAbsensiLogsFromSupabase() {
            try {
                const rawLogs = await sbGetAttendanceLogs({ companyId: currentUser ? currentUser.company_id : null });
                absensiLogs = rawLogs.map(sbLogToAppFormat);
                saveLogsToStorage();
            } catch (err) {
                console.error('Gagal load logs dari Supabase:', err);
                // Jangan tampilkan data lama sebagai data terkini saat server gagal.
                absensiLogs = [];
                showAlert('Data absensi belum dapat dimuat dari server. Periksa koneksi lalu coba lagi.', 'error');
            }
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
                await sbLogout();
            } catch (err) {
                // Tetap lanjut logout di sisi client walau request ke server gagal
            }
            currentUser = null;
            absensiLogs = [];
            stopShiftReminder();
            stopCamera();
            checkSession();
            showAlert('Anda telah keluar dari sistem.', 'success');
        }

        let currentActiveTab = 'absen';

        function checkSession(shouldSwitchTab = true) {
            const authWrap = document.getElementById('authWrapper');
            const appWrap = document.getElementById('appWrapper');

            const btnPanel = document.getElementById('btnTabPanel');
            const btnVerif = document.getElementById('btnTabVerifikasi');
            const btnShiftMaster = document.getElementById('btnTabShiftMaster');
            const btnUsers = document.getElementById('btnTabUsers');
            const btnLokasi = document.getElementById('btnTabLokasi');
            const btnKalender = document.getElementById('btnTabKalender');
            const btnPwReq = document.getElementById('btnTabPassReq');
            const btnSecurityLog = document.getElementById('btnTabSecurityLog');
            const btnBackup = document.getElementById('btnTabBackup');
            const masterLabel = document.getElementById('masterDataLabel');

            if(!currentUser) {
                if (authWrap) authWrap.classList.remove('hidden');
                if (appWrap) appWrap.classList.add('hidden');
                return;
            }

            if (authWrap) authWrap.classList.add('hidden');
            if (appWrap) appWrap.classList.remove('hidden');
            const navUserEl = document.getElementById('navUserName');
            const navRoleEl = document.getElementById('navUserRole');
            if (navUserEl) navUserEl.innerText = currentUser.nama;
            if (navRoleEl) navRoleEl.innerText = roleLabel(currentUser.role);

            // Tampilkan info tenant / perusahaan aktif (Multi-Tenant SaaS)
            const tenantBadge = document.getElementById('tenantInfoBadge');
            if (tenantBadge) {
                if (currentUser.company_nama || currentUser.company_code) {
                    tenantBadge.classList.remove('hidden');
                    const navCompNama = document.getElementById('navCompanyNama');
                    const navCompCode = document.getElementById('navCompanyCode');
                    if (navCompNama) navCompNama.innerText = currentUser.company_nama || t('Perusahaan');
                    if (navCompCode) navCompCode.innerText = currentUser.company_code || '';
                } else {
                    tenantBadge.classList.add('hidden');
                }
            }

            const monTitle = document.getElementById('monitoringSectionTitle');
            const monDesc = document.getElementById('monitoringSectionDesc');

            if (btnPanel) btnPanel.classList.add('hidden');
            if (btnVerif) btnVerif.classList.add('hidden');
            if (btnShiftMaster) btnShiftMaster.classList.add('hidden');
            if (btnUsers) btnUsers.classList.add('hidden');
            if (btnLokasi) btnLokasi.classList.add('hidden');
            if (btnKalender) btnKalender.classList.add('hidden');
            if (btnPwReq) btnPwReq.classList.add('hidden');
            if (btnSecurityLog) btnSecurityLog.classList.add('hidden');
            if (btnBackup) btnBackup.classList.add('hidden');
            if (masterLabel) masterLabel.classList.add('hidden');

            // Role-based view & dashboard configuration
            if(currentUser.role === 'karyawan' || currentUser.role === 'staff' || currentUser.role === 'magang') {
                if (shouldSwitchTab) switchMainTab('absen');
                else switchMainTab(currentActiveTab === 'absen' ? 'absen' : 'absen');
            } else if(currentUser.role === 'hrd') {
                if (btnPanel) btnPanel.classList.remove('hidden');
                if (btnUsers) btnUsers.classList.remove('hidden');
                if (btnVerif) btnVerif.classList.remove('hidden');
                if (btnKalender) btnKalender.classList.remove('hidden');
                if (btnPwReq) btnPwReq.classList.remove('hidden');
                if (masterLabel) masterLabel.classList.remove('hidden');
                const lblIcon = document.getElementById('lblTabPanelIcon');
                const lblTxt = document.getElementById('lblTabPanelText');
                if (lblIcon) lblIcon.className = "fa-solid fa-chart-line w-4";
                if (lblTxt) lblTxt.innerText = t("Dashboard HRD");
                if (monTitle) monTitle.innerText = t("Dashboard HRD - Monitoring & Rekap");
                if (monDesc) monDesc.innerText = t("Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja staff.");
                if (shouldSwitchTab) switchMainTab('panel');
                else switchMainTab(currentActiveTab || 'panel');
            } else if(currentUser.role === 'admin') {
                if (btnPanel) btnPanel.classList.remove('hidden');
                if (btnUsers) btnUsers.classList.remove('hidden');
                if (btnVerif) btnVerif.classList.remove('hidden');
                if (btnShiftMaster) btnShiftMaster.classList.remove('hidden');
                if (btnLokasi) btnLokasi.classList.remove('hidden');
                if (btnKalender) btnKalender.classList.remove('hidden');
                if (btnPwReq) btnPwReq.classList.remove('hidden');
                if (btnSecurityLog) btnSecurityLog.classList.remove('hidden');
                if (btnBackup) btnBackup.classList.remove('hidden');
                if (masterLabel) masterLabel.classList.remove('hidden');
                const lblIcon = document.getElementById('lblTabPanelIcon');
                const lblTxt = document.getElementById('lblTabPanelText');
                if (lblIcon) lblIcon.className = "fa-solid fa-chart-pie w-4";
                if (lblTxt) lblTxt.innerText = t("Dashboard Admin");
                if (monTitle) monTitle.innerText = t("Dashboard Admin - Monitoring & Rekap");
                if (monDesc) monDesc.innerText = t("Pantau kehadiran, keterlambatan, jam masuk, jam pulang, dan durasi kerja seluruh staff perusahaan.");
                if (shouldSwitchTab) switchMainTab('panel');
                else switchMainTab(currentActiveTab || 'panel');
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
            const ovNama = document.getElementById('ovNama');
            const ovId = document.getElementById('ovId');
            const ovJabatan = document.getElementById('ovJabatan');
            const myMasa = document.getElementById('myMasaKerja');
            if (ovNama) ovNama.innerText = t('Nama:') + " " + currentUser.nama;
            if (ovId) ovId.innerText = t('ID:') + " " + (currentUser.employee_id || currentUser.id);
            if (ovJabatan) ovJabatan.innerText = t('Jabatan:') + " " + currentUser.jabatan;
            if (myMasa) myMasa.innerText = hitungMasaKerja(currentUser.tglMasuk);

            // Tampilkan jam masuk/pulang sesuai shift staff yang login
            const shiftCfg = getShiftConfig(currentUser);
            const masukLbl = document.getElementById('myJamMasukLabel');
            const pulangLbl = document.getElementById('myJamPulangLabel');
            const shiftLbl = document.getElementById('myShiftLabel');
            if (masukLbl) masukLbl.innerText = shiftCfg.labelMasuk;
            if (pulangLbl) pulangLbl.innerText = shiftCfg.labelPulang;
            if (shiftLbl) shiftLbl.innerText = shiftCfg.label;

            renderMyStats();
            renderMyPasswordCard();
            toggleUploadSurat();
        }

        function switchMainTab(tab) {
            currentActiveTab = tab || 'absen';
            const karySec = document.getElementById('karyawanSection');
            const hrdSec = document.getElementById('hrdSection');
            const admSec = document.getElementById('adminSection');
            const verSec = document.getElementById('verifikasiSection');
            const shiftSec = document.getElementById('shiftMasterSection');
            const lokasiSec = document.getElementById('lokasiKantorSection');
            const kalenderSec = document.getElementById('kalenderSection');
            const pwReqSec = document.getElementById('passReqSection');
            const secLogSec = document.getElementById('securityLogSection');
            const backupSec = document.getElementById('backupSection');
            const allBtns = ['btnTabAbsen','btnTabPanel','btnTabVerifikasi','btnTabShiftMaster','btnTabUsers','btnTabLokasi','btnTabKalender','btnTabPassReq','btnTabSecurityLog','btnTabBackup'].map(id => document.getElementById(id)).filter(Boolean);

            if (karySec) karySec.classList.add('hidden');
            if (hrdSec) hrdSec.classList.add('hidden');
            if (admSec) admSec.classList.add('hidden');
            if (verSec) verSec.classList.add('hidden');
            if (shiftSec) shiftSec.classList.add('hidden');
            if (lokasiSec) lokasiSec.classList.add('hidden');
            if (kalenderSec) kalenderSec.classList.add('hidden');
            if (pwReqSec) pwReqSec.classList.add('hidden');
            if (secLogSec) secLogSec.classList.add('hidden');
            if (backupSec) backupSec.classList.add('hidden');
            allBtns.forEach(b => b.classList.remove('active'));

            if (tab === 'absen') {
                if (karySec) karySec.classList.remove('hidden');
                const b = document.getElementById('btnTabAbsen');
                if (b) b.classList.add('active');
                setupKaryawanView();
            } else if (tab === 'verifikasi') {
                if (verSec) verSec.classList.remove('hidden');
                const b = document.getElementById('btnTabVerifikasi');
                if (b) b.classList.add('active');
                renderVerifikasiSurat();
            } else if (tab === 'shiftmaster') {
                if (shiftSec) shiftSec.classList.remove('hidden');
                const b = document.getElementById('btnTabShiftMaster');
                if (b) b.classList.add('active');
                renderShiftMasterTable();
            } else if (tab === 'users') {
                if (admSec) admSec.classList.remove('hidden');
                const b = document.getElementById('btnTabUsers');
                if (b) b.classList.add('active');
                renderAdminUsers();
            } else if (tab === 'lokasikantor') {
                if (lokasiSec) lokasiSec.classList.remove('hidden');
                const b = document.getElementById('btnTabLokasi');
                if (b) b.classList.add('active');
                renderLokasiKantorForm();
            } else if (tab === 'kalender') {
                if (kalenderSec) kalenderSec.classList.remove('hidden');
                const b = document.getElementById('btnTabKalender');
                if (b) b.classList.add('active');
                renderIzinCalendar('kalender', kalenderViewDate, true);
            } else if (tab === 'passreq') {
                if (pwReqSec) pwReqSec.classList.remove('hidden');
                const b = document.getElementById('btnTabPassReq');
                if (b) b.classList.add('active');
                renderPasswordRequests();
            } else if (tab === 'securitylog') {
                if (secLogSec) secLogSec.classList.remove('hidden');
                const b = document.getElementById('btnTabSecurityLog');
                if (b) b.classList.add('active');
                renderSecurityLogs();
            } else if (tab === 'backup') {
                if (backupSec) backupSec.classList.remove('hidden');
                const b = document.getElementById('btnTabBackup');
                if (b) b.classList.add('active');
            } else {
                const b = document.getElementById('btnTabPanel');
                if (b) b.classList.add('active');
                if (hrdSec) hrdSec.classList.remove('hidden');
                renderTable();
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
        let pendingRegistration = null; // Data akun sementara sebelum submit ke server

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
            ['regStep1','regStep2','regStep3','regStep4'].forEach(id => document.getElementById(id).classList.add('hidden'));
            document.getElementById('regStep1').classList.remove('hidden');
            document.getElementById('btnBidangNext').disabled = true;
            document.getElementById('btnBidangNext').className = "mt-6 w-full bg-slate-300 text-white font-semibold py-2.5 rounded-lg text-sm transition cursor-not-allowed";
            document.querySelectorAll('.bidang-opt').forEach(el => el.classList.remove('border-blue-500','bg-blue-50'));
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
            [1,2,3,4].forEach(n => {
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
        }
        async function handleRegisterSubmit(e) {
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

            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.originalHtml = submitBtn.innerHTML; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Membuat akun...'; }

            // Perusahaan & akun admin langsung dibuat di Supabase (tanpa OTP email)
            try {
                const result = await sbRegister({
                    kode_perusahaan: pendingRegistration.kode_perusahaan,
                    nama_perusahaan: pendingRegistration.nama_perusahaan,
                    nama: pendingRegistration.nama,
                    email: pendingRegistration.email,
                    password: pendingRegistration.password,
                });

                const finishCodeEl = document.getElementById('finishCompanyCode');
                if (finishCodeEl) finishCodeEl.innerText = result.kode_perusahaan;

                pendingRegistration = null;
                goRegStep(4);
            } catch (err) {
                alert(err.message || 'Gagal mendaftar. Silakan coba lagi.');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = submitBtn.dataset.originalHtml; }
            }
        }

        // ================== PWA & OFFLINE QUEUE (INDEXEDDB) ==================
        const OFFLINE_DB_NAME = 'AbsensiProDB';
        const OFFLINE_STORE_NAME = 'attendance_offline_queue';
        const OFFLINE_DB_VERSION = 1;

        function openOfflineDB() {
            return new Promise((resolve, reject) => {
                if (!('indexedDB' in window)) {
                    return reject(new Error('IndexedDB tidak didukung pada browser ini'));
                }
                const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
                        db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function saveOfflineAttendance(record) {
            try {
                const db = await openOfflineDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
                    const store = tx.objectStore(OFFLINE_STORE_NAME);
                    store.put(record);
                    tx.oncomplete = () => {
                        updateOfflineUI();
                        resolve(true);
                    };
                    tx.onerror = () => reject(tx.error);
                });
            } catch (e) {
                try {
                    const queue = JSON.parse(localStorage.getItem('absensi_offline_queue') || '[]');
                    queue.push(record);
                    localStorage.setItem('absensi_offline_queue', JSON.stringify(queue));
                    updateOfflineUI();
                    return true;
                } catch (err) {
                    return false;
                }
            }
        }

        async function getOfflineAttendanceQueue() {
            try {
                const db = await openOfflineDB();
                return new Promise((resolve) => {
                    const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
                    const store = tx.objectStore(OFFLINE_STORE_NAME);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        let list = req.result || [];
                        try {
                            const localQueue = JSON.parse(localStorage.getItem('absensi_offline_queue') || '[]');
                            if (localQueue.length > 0) {
                                list = list.concat(localQueue);
                            }
                        } catch(e) {}
                        resolve(list);
                    };
                    req.onerror = () => resolve([]);
                });
            } catch (e) {
                try {
                    return JSON.parse(localStorage.getItem('absensi_offline_queue') || '[]');
                } catch(err) {
                    return [];
                }
            }
        }

        async function deleteOfflineAttendance(id) {
            try {
                const db = await openOfflineDB();
                const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
                const store = tx.objectStore(OFFLINE_STORE_NAME);
                store.delete(id);
            } catch (e) {}
            try {
                let localQueue = JSON.parse(localStorage.getItem('absensi_offline_queue') || '[]');
                localQueue = localQueue.filter(item => item.id !== id);
                localStorage.setItem('absensi_offline_queue', JSON.stringify(localQueue));
            } catch (e) {}
            updateOfflineUI();
        }

        async function updateOfflineUI() {
            const queue = await getOfflineAttendanceQueue();
            const count = queue.length;
            const banner = document.getElementById('offlineSyncBanner');
            const badge = document.getElementById('offlineQueueBadge');
            const pill = document.getElementById('netStatusPill');

            const isOnline = navigator.onLine;

            if (pill) {
                if (isOnline) {
                    pill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300';
                    pill.innerHTML = `<i class="fa-solid fa-circle text-[7px] mr-1"></i>${t('Online (Terhubung)')}`;
                } else {
                    pill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse';
                    pill.innerHTML = `<i class="fa-solid fa-wifi-slash text-[8px] mr-1"></i>${t('Mode Offline (Internet Terputus)')}`;
                }
            }

            if (banner) {
                if (!isOnline || count > 0) {
                    banner.classList.remove('hidden');
                    if (badge) badge.innerText = `${count} ${t('antrean offline')}`;
                    const titleEl = document.getElementById('offlineBannerTitle');
                    const descEl = document.getElementById('offlineBannerDesc');
                    if (titleEl) titleEl.innerText = !isOnline ? t('Mode Offline Aktif') : t('Data Offline Tersimpan');
                    if (descEl) descEl.innerText = !isOnline 
                        ? t('Koneksi internet terputus. Absensi tetap dapat dilakukan dan tersimpan di memori perangkat.')
                        : t('Terdapat data absensi offline yang belum disinkronkan ke server.');
                } else {
                    banner.classList.add('hidden');
                }
            }
        }

        let isSyncingOffline = false;
        async function syncOfflineQueue(isManual = false) {
            if (isSyncingOffline) return;
            if (!navigator.onLine) {
                if (isManual) showAlert(t('Tidak dapat menyinkronkan: Perangkat masih dalam kondisi offline.'), 'error');
                return;
            }
            const queue = await getOfflineAttendanceQueue();
            if (!queue || queue.length === 0) {
                if (isManual) showAlert(t('Tidak ada data absensi offline yang perlu disinkronkan.'), 'info');
                return;
            }

            isSyncingOffline = true;
            const btnSync = document.getElementById('btnManualSync');
            if (btnSync) {
                btnSync.disabled = true;
                btnSync.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>${t('Menyinkronkan presensi offline...')}`;
            }

            let successCount = 0;
            let failedCount = 0;

            for (const item of queue) {
                try {
                    await sbSubmitAbsen({
                        tipe: item.tipe,
                        lat: item.lat,
                        lng: item.lng,
                        accuracy: item.accuracy,
                        companyId: item.companyId,
                        userId: item.userId,
                        nama: item.nama,
                        jabatan: item.jabatan,
                        snapshot: item.snapshot,
                        nearestOffice: item.nearestOffice
                    });
                    await deleteOfflineAttendance(item.id);
                    successCount++;
                } catch (err) {
                    console.error('Gagal sinkronisasi item offline:', item.id, err);
                    failedCount++;
                }
            }

            if (btnSync) {
                btnSync.disabled = false;
                btnSync.innerHTML = `<i class="fa-solid fa-rotate mr-1"></i>${t('Sinkronkan Data Offline')}`;
            }
            isSyncingOffline = false;
            await updateOfflineUI();

            if (successCount > 0) {
                showAlert(`<b>${t('Sinkronisasi selesai:')}</b> ${successCount} ${t('data presensi offline berhasil dikirim ke server.')}${failedCount > 0 ? ` (${failedCount} gagal, akan dicoba lagi)` : ''}`, 'success');
                if (currentUser) {
                    fetchAttendanceLogs();
                    renderMyStats();
                }
            }
        }

        function syncOfflineQueueManual() {
            syncOfflineQueue(true);
        }

        window.addEventListener('online', () => {
            updateOfflineUI();
            showAlert('Koneksi internet kembali pulih. Menyinkronkan data offline...', 'info');
            setTimeout(() => syncOfflineQueue(false), 1200);
        });

        window.addEventListener('offline', () => {
            updateOfflineUI();
        });

        // ================== AI FACE RECOGNITION (face-api.js) ==================
        // Model dimuat langsung dari hosting lokal (./models) dengan fallback CDN jika diperlukan
        const LOCAL_MODEL_URL = './models';
        const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        let faceModelsLoaded = false;
        let faceModelsLoading = false;
        let faceCheckInterval = null;
        let faceAnalysisInProgress = false;
        let brightnessCanvas = document.createElement('canvas');
        let preprocCanvas = document.createElement('canvas');
        let preprocCtx = preprocCanvas.getContext('2d', { willReadFrequently: true });

        // Status live hasil analisa AI, dipakai untuk gating tombol Absen Masuk/Pulang
        let faceState = { faceDetected: false, occluded: true, occlusionType: 'none', wellLit: false, lightStatus: 'unknown', score: 0, brightness: 128 };
        let cameraSnapshot = null;
        let stableFaceFrames = 0;
        let snapshotCaptureInProgress = false;
        let glassesCandidateFrames = 0;

        function resetCameraSnapshot() {
            cameraSnapshot = null;
            stableFaceFrames = 0;
            snapshotCaptureInProgress = false;
            glassesCandidateFrames = 0;
            const statusEl = document.getElementById('cameraSnapshotStatus');
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-camera mr-1"></i>Harap diam, sistem sedang menyiapkan pengambilan data wajah...';
        }

        function captureAutomaticSnapshot() {
            if (cameraSnapshot || snapshotCaptureInProgress) return;
            snapshotCaptureInProgress = true;
            const statusEl = document.getElementById('cameraSnapshotStatus');
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Harap diam, kamera sedang mengambil data wajah Anda...';
            setTimeout(() => {
                const snapshot = captureVideoSnapshot();
                if (snapshot) {
                    cameraSnapshot = snapshot;
                    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i>Foto bukti siap dikirim bersama absensi.';
                } else if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i>Foto belum siap, posisikan wajah di depan kamera.';
                }
                snapshotCaptureInProgress = false;
            }, 700);
        }

        async function loadFaceModels() {
            if (faceModelsLoaded) return;
            if (faceModelsLoading) return;
            faceModelsLoading = true;
            try {
                if (typeof faceapi === 'undefined') {
                    faceModelsLoading = false;
                    setTimeout(loadFaceModels, 250);
                    return;
                }
                const badge = document.getElementById('badgeModel');
                if (badge) badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memuat Model AI...';

                try {
                    await faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_URL);
                    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(LOCAL_MODEL_URL);
                } catch(localErr) {
                    console.warn('Gagal muat model lokal, mencoba CDN fallback...', localErr);
                    await faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_URL);
                    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_MODEL_URL);
                }

                faceModelsLoaded = true;
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
            resetCameraSnapshot();
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
                    runFaceAnalysis();
                    faceCheckInterval = setInterval(runFaceAnalysis, 700);
                })
                .catch(err => showAlert('Gagal mengakses kamera: ' + err.message));
        }

        function stopCamera() {
            const video = document.getElementById('webcam');
            const placeholder = document.getElementById('cameraPlaceholder');
            const overlay = document.getElementById('cameraOverlayInfo');
            const aiBar = document.getElementById('aiStatusBar');
            const btnOpen = document.getElementById('btnOpenCamera');
            const btnClose = document.getElementById('btnCloseCamera');

            if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
            if (video) video.srcObject = null;
            if (faceCheckInterval) { clearInterval(faceCheckInterval); faceCheckInterval = null; }
            faceState = { faceDetected: false, occluded: true, occlusionType: 'none', wellLit: false, lightStatus: 'unknown', score: 0, brightness: 128 };
            resetCameraSnapshot();
            hideAiWarning();

            if (placeholder) placeholder.classList.remove('hidden');
            if (overlay) overlay.classList.add('hidden');
            if (aiBar) aiBar.classList.add('hidden');
            if (btnOpen) btnOpen.classList.remove('hidden');
            if (btnClose) btnClose.classList.add('hidden');
            const badgeClahe = document.getElementById('badgeClahe');
            if (badgeClahe) badgeClahe.classList.add('hidden');
        }

        function stopCameraManual() {
            stopCamera();
            showAlert('Kamera berhasil dimatikan. Klik "Buka Kamera" lagi saat ingin absen.', 'success');
        }

        // Hitung tingkat kecerahan rata-rata frame kamera (luma: 0-255)
        function measureBrightness(video) {
            const w = 48, h = 36;
            brightnessCanvas.width = w; brightnessCanvas.height = h;
            const ctx = brightnessCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);
            let data;
            try { data = ctx.getImageData(0, 0, w, h).data; } catch(e) { return 128; }
            let total = 0;
            for (let i = 0; i < data.length; i += 4) {
                // Perceptual Luminance: Y = 0.299*R + 0.587*G + 0.114*B
                total += (0.299 * data[i]) + (0.587 * data[i+1]) + (0.114 * data[i+2]);
            }
            return total / (data.length / 4);
        }

        // Image Preprocessing: Adaptive Histogram / Gamma CLAHE filter untuk lingkungan gelap
        function applyImagePreprocessing(sourceVideo, brightness) {
            const w = 320;
            const h = Math.round(320 * (sourceVideo.videoHeight / (sourceVideo.videoWidth || 1))) || 240;
            preprocCanvas.width = w;
            preprocCanvas.height = h;
            preprocCtx.drawImage(sourceVideo, 0, 0, w, h);

            if (brightness < 50) {
                try {
                    const imgData = preprocCtx.getImageData(0, 0, w, h);
                    const d = imgData.data;
                    const gamma = 0.60;
                    const lut = new Uint8Array(256);
                    for (let i = 0; i < 256; i++) {
                        lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, gamma))));
                    }
                    for (let i = 0; i < d.length; i += 4) {
                        d[i] = lut[d[i]];
                        d[i+1] = lut[d[i+1]];
                        d[i+2] = lut[d[i+2]];
                    }
                    preprocCtx.putImageData(imgData, 0, 0);
                    const badgeClahe = document.getElementById('badgeClahe');
                    if (badgeClahe) badgeClahe.classList.remove('hidden');
                } catch(e) {}
            } else {
                const badgeClahe = document.getElementById('badgeClahe');
                if (badgeClahe) badgeClahe.classList.add('hidden');
            }
            return preprocCanvas;
        }

        function setAiBadge(id, text, colorClass) {
            const el = document.getElementById(id);
            if (!el) return;
            el.className = `text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm ${colorClass}`;
            el.innerHTML = text;
        }

        function showAiWarning(text, type) {
            const banner = document.getElementById('aiWarningBanner');
            if (!banner) return;
            banner.classList.remove('hidden');
            let colorClass = 'bg-amber-50 border-amber-300 text-amber-800';
            let icon = 'fa-triangle-exclamation text-amber-600';
            if (type === 'dark' || type === 'mask' || type === 'glasses') {
                colorClass = 'bg-rose-50 border-rose-300 text-rose-800';
                icon = type === 'mask' ? 'fa-mask text-rose-600' : (type === 'glasses' ? 'fa-glasses text-rose-600' : 'fa-moon text-rose-600');
            }
            banner.className = `mt-3 p-3 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all border ${colorClass}`;
            banner.innerHTML = `<i class="fa-solid ${icon} text-base shrink-0"></i><span>${text}</span>`;
        }

        function hideAiWarning() {
            const banner = document.getElementById('aiWarningBanner');
            if (banner) banner.classList.add('hidden');
        }

        // Hitung statistik luminance, deviasi standar (kontras/tekstur), dan rata-rata warna pada region canvas
        function getCanvasRegionStats(ctx, x, y, w, h, canvasW, canvasH) {
            const rx = Math.max(0, Math.min(canvasW - 1, Math.round(x)));
            const ry = Math.max(0, Math.min(canvasH - 1, Math.round(y)));
            const rw = Math.max(2, Math.min(canvasW - rx, Math.round(w)));
            const rh = Math.max(2, Math.min(canvasH - ry, Math.round(h)));

            try {
                const imgData = ctx.getImageData(rx, ry, rw, rh);
                const d = imgData.data;
                const len = d.length;
                if (len === 0) return { meanLuma: 128, stdDev: 0, rAvg: 128, gAvg: 128, bAvg: 128 };

                let totalLuma = 0;
                let totalR = 0, totalG = 0, totalB = 0;
                const n = len / 4;
                const lumas = new Float32Array(n);

                let pIdx = 0;
                for (let i = 0; i < len; i += 4) {
                    const r = d[i], g = d[i+1], b = d[i+2];
                    const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
                    lumas[pIdx++] = luma;
                    totalLuma += luma;
                    totalR += r;
                    totalG += g;
                    totalB += b;
                }

                const meanLuma = totalLuma / n;
                let varianceSum = 0;
                for (let i = 0; i < n; i++) {
                    const diff = lumas[i] - meanLuma;
                    varianceSum += diff * diff;
                }
                const stdDev = Math.sqrt(varianceSum / n);
                return {
                    meanLuma,
                    stdDev,
                    rAvg: totalR / n,
                    gAvg: totalG / n,
                    bAvg: totalB / n
                };
            } catch (e) {
                return { meanLuma: 128, stdDev: 0, rAvg: 128, gAvg: 128, bAvg: 128 };
            }
        }

        // Hitung metrik gradien tepi (Sobel) dan kontras pada region canvas
        function getRegionEdgeMetrics(ctx, x, y, w, h, canvasW, canvasH) {
            const rx = Math.max(0, Math.min(canvasW - 1, Math.round(x)));
            const ry = Math.max(0, Math.min(canvasH - 1, Math.round(y)));
            const rw = Math.max(3, Math.min(canvasW - rx, Math.round(w)));
            const rh = Math.max(3, Math.min(canvasH - ry, Math.round(h)));

            try {
                const imgData = ctx.getImageData(rx, ry, rw, rh);
                const d = imgData.data;
                let edgeTotal = 0;
                let count = 0;
                let maxEdge = 0;
                let minVal = 255;
                let maxVal = 0;

                for (let j = 1; j < rh - 1; j++) {
                    for (let i = 1; i < rw - 1; i++) {
                        const idx = (j * rw + i) * 4;
                        const top = ((j - 1) * rw + i) * 4;
                        const bot = ((j + 1) * rw + i) * 4;
                        const left = (j * rw + (i - 1)) * 4;
                        const right = (j * rw + (i + 1)) * 4;

                        const luma = 0.299 * d[idx] + 0.587 * d[idx+1] + 0.114 * d[idx+2];
                        const lTop = 0.299 * d[top] + 0.587 * d[top+1] + 0.114 * d[top+2];
                        const lBot = 0.299 * d[bot] + 0.587 * d[bot+1] + 0.114 * d[bot+2];
                        const lLeft = 0.299 * d[left] + 0.587 * d[left+1] + 0.114 * d[left+2];
                        const lRight = 0.299 * d[right] + 0.587 * d[right+1] + 0.114 * d[right+2];

                        if (luma < minVal) minVal = luma;
                        if (luma > maxVal) maxVal = luma;

                        const dx = Math.abs(lRight - lLeft);
                        const dy = Math.abs(lBot - lTop);
                        const g = dx + dy;
                        edgeTotal += g;
                        if (g > maxEdge) maxEdge = g;
                        count++;
                    }
                }
                return {
                    avgEdge: count > 0 ? edgeTotal / count : 0,
                    maxEdge,
                    contrast: maxVal - minVal,
                    minVal,
                    maxVal
                };
            } catch (e) {
                return { avgEdge: 0, maxEdge: 0, contrast: 0, minVal: 128, maxVal: 128 };
            }
        }

        // Inspeksi Ketat Oklusi, Masker, Tangan Menutup Wajah, & Segala Jenis Kacamata
        function inspectFaceOcclusion(detection, video, canvasCtx, canvasW, canvasH) {
            if (!detection || !detection.landmarks) {
                return { isOccluded: true, type: 'unclear', reason: t('Landmark wajah tidak terdeteksi') };
            }

            const pts = detection.landmarks.positions;
            const box = detection.detection.box;
            const score = detection.detection.score;

            // 1. Skor Deteksi Global: Wajah yang tertutup tangan/benda akan kehilangan confidence
            if (score < 0.50) {
                return { isOccluded: true, type: 'unclear', reason: t('Wajah tertutup atau kurang jelas') };
            }

            const relativeArea = (box.width * box.height) / (video.videoWidth * video.videoHeight || 1);
            if (relativeArea < 0.035) {
                return { isOccluded: true, type: 'too_small', reason: t('Wajah terlalu jauh / kecil') };
            }

            // Titik-titik penting landmark 68
            const noseTip = pts[33];
            const chin = pts[8];
            const mouthLeft = pts[48];
            const mouthRight = pts[54];
            const mouthTop = pts[51];
            const mouthBottom = pts[57];

            // Hitung Pusat Mata Kiri & Kanan (Landmark 36-41 & 42-47)
            let lx = 0, ly = 0, rx = 0, ry = 0;
            for (let i = 36; i <= 41; i++) { rx += pts[i].x; ry += pts[i].y; }
            for (let i = 42; i <= 47; i++) { lx += pts[i].x; ly += pts[i].y; }
            const rightEye = { x: rx / 6, y: ry / 6 };
            const leftEye = { x: lx / 6, y: ly / 6 };

            // Interpupillary distance (jarak antar pupil)
            const ipd = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
            if (ipd < 20) {
                return { isOccluded: true, type: 'too_small', reason: t('Wajah terlalu jauh / kecil') };
            }

            // 2. Eye Aspect Ratio (EAR) untuk mengecek bukaan mata
            const earRight = (Math.hypot(pts[37].x - pts[41].x, pts[37].y - pts[41].y) + Math.hypot(pts[38].x - pts[40].x, pts[38].y - pts[40].y)) / (2 * (Math.hypot(pts[36].x - pts[39].x, pts[36].y - pts[39].y) || 1));
            const earLeft = (Math.hypot(pts[43].x - pts[47].x, pts[43].y - pts[47].y) + Math.hypot(pts[44].x - pts[46].x, pts[44].y - pts[46].y)) / (2 * (Math.hypot(pts[42].x - pts[45].x, pts[42].y - pts[45].y) || 1));

            // 3. Analisis Proporsi Geometri Hidung & Mulut
            const mouthWidth = Math.hypot(mouthRight.x - mouthLeft.x, mouthRight.y - mouthLeft.y);
            const mouthHeight = Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y);
            const noseWidth = Math.hypot(pts[35].x - pts[31].x, pts[35].y - pts[31].y);
            const noseToMouthDist = Math.hypot(mouthTop.x - noseTip.x, mouthTop.y - noseTip.y);
            const mouthToChinDist = Math.hypot(chin.x - mouthBottom.x, chin.y - mouthBottom.y);

            const mouthIpdRatio = mouthWidth / ipd;
            const noseIpdRatio = noseWidth / ipd;
            const noseMouthRatio = noseToMouthDist / ipd;
            const mouthChinRatio = mouthToChinDist / ipd;
            const mouthCenterOffset = Math.abs(noseTip.x - (mouthLeft.x + mouthRight.x) / 2) / ipd;

            // Jika tangan menutupi hidung/mulut, koordinat landmark terdistorsi drastis
            const isGeometryAbnormal = (mouthIpdRatio < 0.52 || mouthIpdRatio > 1.55 || noseMouthRatio < 0.15 || noseIpdRatio < 0.24 || mouthChinRatio < 0.14 || mouthCenterOffset > 0.16);

            // 4. Analisis Piksel & Tekstur Canvas Nyata
            if (canvasCtx && canvasW && canvasH) {
                // Sampel dahi sebagai referensi kulit alami
                const fX = (leftEye.x + rightEye.x) / 2 - ipd * 0.2;
                const fY = Math.min(leftEye.y, rightEye.y) - ipd * 0.35;
                const fW = ipd * 0.4;
                const fH = ipd * 0.25;
                const foreheadStats = getCanvasRegionStats(canvasCtx, fX, fY, fW, fH, canvasW, canvasH);

                // Sampel area kedua mata
                const leStats = getCanvasRegionStats(canvasCtx, leftEye.x - ipd * 0.22, leftEye.y - ipd * 0.15, ipd * 0.44, ipd * 0.30, canvasW, canvasH);
                const reStats = getCanvasRegionStats(canvasCtx, rightEye.x - ipd * 0.22, rightEye.y - ipd * 0.15, ipd * 0.44, ipd * 0.30, canvasW, canvasH);
                const leEdge = getRegionEdgeMetrics(canvasCtx, leftEye.x - ipd * 0.22, leftEye.y - ipd * 0.15, ipd * 0.44, ipd * 0.30, canvasW, canvasH);
                const reEdge = getRegionEdgeMetrics(canvasCtx, rightEye.x - ipd * 0.22, rightEye.y - ipd * 0.15, ipd * 0.44, ipd * 0.30, canvasW, canvasH);

                if (foreheadStats.meanLuma > 40) {
                    const isDarkGlasses = (leStats.meanLuma < 25 && reStats.meanLuma < 25 && foreheadStats.meanLuma > 90) ||
                                          (leStats.meanLuma < foreheadStats.meanLuma * 0.22 && reStats.meanLuma < foreheadStats.meanLuma * 0.22 &&
                                           leStats.maxVal < 90 && reStats.maxVal < 90);
                    const isGlassesFrame = (bridgeEdge.avgEdge >= 16 || bridgeEdge.maxEdge > 65 || bridgeEdge.contrast > 65) &&
                                           (leEdge.maxEdge > 55 || reEdge.maxEdge > 55);
                    const isBothLensGlare = leEdge.maxVal > 238 && reEdge.maxVal > 238 && foreheadStats.meanLuma < 205;
                    const glassesSignal = isDarkGlasses || isGlassesFrame || isBothLensGlare;

                    if (glassesSignal) {
                        glassesCandidateFrames++;
                    } else {
                        glassesCandidateFrames = 0;
                    }
                    if (glassesCandidateFrames >= 2) {
                        return { isOccluded: true, type: 'glasses', reason: t('Mohon lepas kacamata Anda') };
                    }
                }

                // DETEKSI TANGAN / MASKER MENUTUP HIDUNG & MULUT
                // Sampel area lubang hidung (nostrils di bawah pts 33)
                const nostrilEdge = getRegionEdgeMetrics(canvasCtx, pts[33].x - noseWidth * 0.45, pts[33].y - ipd * 0.06, noseWidth * 0.9, ipd * 0.22, canvasW, canvasH);

                // Sampel area bibir & rongga mulut
                const mX = (mouthLeft.x + mouthRight.x) / 2 - mouthWidth * 0.45;
                const mY = (mouthTop.y + mouthBottom.y) / 2 - Math.max(mouthHeight, ipd * 0.15);
                const mW = mouthWidth * 0.9;
                const mH = Math.max(mouthHeight * 2, ipd * 0.3);
                const mouthStats = getCanvasRegionStats(canvasCtx, mX, mY, mW, mH, canvasW, canvasH);
                const mouthEdge = getRegionEdgeMetrics(canvasCtx, mX, mY, mW, mH, canvasW, canvasH);

                // Pengecekan kontras bayangan lubang hidung & garis bibir:
                // Wajah terbuka: nostril memiliki bayangan gelap (minVal < 55) dan bibir memiliki garis celah mulut tajam (mouthEdge.maxEdge >= 35).
                // Tertutup tangan/masker: nostril tertutup kulit tangan/kain (minVal tinggi) atau bibir tidak memiliki celah mulut normal.
                const isNostrilCovered = (nostrilEdge.minVal > 68 && nostrilEdge.contrast < 38);
                const isMouthCovered = (mouthEdge.maxEdge < 32) || (mouthStats.stdDev < 9.5);
                const isLowerFaceCovered = isNostrilCovered && isMouthCovered;
                const isHandOnFace = isLowerFaceCovered || (isMouthCovered && noseMouthRatio < 0.22);

                if (isGeometryAbnormal || isHandOnFace) {
                    return { isOccluded: true, type: 'mask', reason: t('Mohon lepas masker / jauhkan tangan dari wajah') };
                }
            } else {
                if (isGeometryAbnormal || (score < 0.70 && mouthIpdRatio < 0.60)) {
                    return { isOccluded: true, type: 'mask', reason: t('Mohon lepas masker / jauhkan tangan dari wajah') };
                }
            }

            if (earLeft < 0.07 && earRight < 0.07) {
                return { isOccluded: true, type: 'eyes_closed', reason: t('Mata tertutup / tidak terlihat jelas') };
            }

            return { isOccluded: false, type: 'none', reason: t('Wajah terlihat jelas') };
        }

        async function runFaceAnalysis() {
            if (faceAnalysisInProgress) return;
            faceAnalysisInProgress = true;
            try {
                await runFaceAnalysisFrame();
            } finally {
                faceAnalysisInProgress = false;
            }
        }

        async function runFaceAnalysisFrame() {
            const video = document.getElementById('webcam');
            if (!mediaStream || !video || video.readyState < 2) return;

            // 1. LIGHT DETECTION & PREPROCESSING
            const brightness = measureBrightness(video);
            faceState.brightness = brightness;

            if (brightness < 40) {
                faceState.wellLit = false;
                faceState.lightStatus = 'dark';
                setAiBadge('badgeLight', `<i class="fa-solid fa-moon mr-1"></i>${t('Cahaya: Terlalu Gelap (< 40)')}`, 'bg-red-600/85 text-white');
                showAiWarning(t('Ruangan terlalu gelap, cari tempat lebih terang'), 'dark');
            } else if (brightness > 215) {
                faceState.wellLit = false;
                faceState.lightStatus = 'bright';
                setAiBadge('badgeLight', `<i class="fa-solid fa-sun mr-1"></i>${t('Cahaya: Terlalu Terang')}`, 'bg-red-600/85 text-white');
                showAiWarning(t('Pencahayaan terlalu silau/terang, posisikan kamera menjauhi lampu langsung.'), 'bright');
            } else {
                faceState.wellLit = true;
                faceState.lightStatus = 'good';
                setAiBadge('badgeLight', `<i class="fa-solid fa-sun mr-1"></i>${t('Cahaya: Baik')}`, 'bg-emerald-600/85 text-white');
            }

            // 2. MODEL BELUM SIAP
            if (!faceModelsLoaded) {
                setAiBadge('badgeModel', `<i class="fa-solid fa-microchip mr-1"></i>${t('Memuat Model AI...')}`, 'bg-slate-700/85 text-slate-200');
                setAiBadge('badgeFace', `<i class="fa-solid fa-face-viewfinder mr-1"></i>${t('Wajah: Menunggu Model')}`, 'bg-slate-700/85 text-slate-200');
                setAiBadge('badgeOcclusion', `<i class="fa-solid fa-mask mr-1"></i>${t('Oklusi: -')}`, 'bg-slate-700/85 text-slate-200');
                faceState.faceDetected = false;
                faceState.occluded = true;
                return;
            }
            setAiBadge('badgeModel', `<i class="fa-solid fa-microchip mr-1"></i>${t('Model AI: Aktif')}`, 'bg-slate-700/85 text-slate-200');

            // 3. FACE DETECTION & 68 LANDMARKS OCCLUSION ANALYSIS
            try {
                const processSource = applyImagePreprocessing(video, brightness);
                const detection = await faceapi
                    .detectSingleFace(processSource, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.48 }))
                    .withFaceLandmarks(true);

                if (!detection) {
                    faceState.faceDetected = false;
                    faceState.occluded = true;
                    faceState.occlusionType = 'unclear';
                    faceState.score = 0;
                    stableFaceFrames = 0;
                    glassesCandidateFrames = 0;
                    setAiBadge('badgeFace', `<i class="fa-solid fa-face-viewfinder mr-1"></i>${t('Wajah: Tidak Terdeteksi')}`, 'bg-red-600/85 text-white');
                    setAiBadge('badgeOcclusion', `<i class="fa-solid fa-mask mr-1"></i>${t('Oklusi: -')}`, 'bg-slate-700/85 text-slate-200');
                    if (faceState.wellLit) {
                        showAiWarning(t('Posisikan wajah Anda tepat di depan kamera.'), 'occluded');
                    }
                    return;
                }

                faceState.faceDetected = true;
                faceState.score = detection.detection.score;

                // Analisis Landmark 68 Titik & Tekstur Piksel untuk deteksi masker, tangan menutup wajah, & kacamata hitam
                const occCheck = inspectFaceOcclusion(detection, video, preprocCtx, preprocCanvas.width, preprocCanvas.height);
                faceState.occluded = occCheck.isOccluded;
                faceState.occlusionType = occCheck.type;

                if (faceState.occluded) {
                    stableFaceFrames = 0;
                    setAiBadge('badgeFace', `<i class="fa-solid fa-face-viewfinder mr-1"></i>${t('Wajah: Tidak Valid')} (${Math.round(faceState.score*100)}%)`, 'bg-amber-600/85 text-white');
                    if (occCheck.type === 'mask') {
                        setAiBadge('badgeOcclusion', `<i class="fa-solid fa-mask mr-1"></i>${t('Oklusi: Wajah Tertutup / Masker')}`, 'bg-red-600/85 text-white');
                        showAiWarning(occCheck.reason || t('Mohon lepas masker / jauhkan tangan dari wajah'), 'mask');
                    } else if (occCheck.type === 'glasses') {
                        setAiBadge('badgeOcclusion', `<i class="fa-solid fa-glasses mr-1"></i>${t('Oklusi: Terdeteksi Kacamata')}`, 'bg-red-600/85 text-white');
                        showAiWarning(occCheck.reason || t('Mohon lepas kacamata Anda'), 'glasses');
                    } else {
                        setAiBadge('badgeOcclusion', `<i class="fa-solid fa-mask mr-1"></i>${t('Oklusi: Wajah Kurang Jelas')}`, 'bg-red-600/85 text-white');
                        showAiWarning(occCheck.reason || t('Wajah tertutup atau kurang jelas'), 'occluded');
                    }
                } else {
                    stableFaceFrames++;
                    setAiBadge('badgeFace', `<i class="fa-solid fa-face-viewfinder mr-1"></i>${t('Wajah: Terdeteksi')} (${Math.round(faceState.score*100)}%)`, 'bg-emerald-600/85 text-white');
                    setAiBadge('badgeOcclusion', `<i class="fa-solid fa-circle-check mr-1"></i>${t('Oklusi: Wajah Terlihat Jelas')}`, 'bg-emerald-600/85 text-white');
                    if (faceState.wellLit) {
                        hideAiWarning();
                        if (stableFaceFrames >= 3) captureAutomaticSnapshot();
                    }
                }
            } catch (err) {
                // error frame sementara diabaikan
            }
        }

        function captureVideoSnapshot() {
            const video = document.getElementById('webcam');
            if (!video || video.readyState < 2) return null;
            try {
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = 320;
                snapCanvas.height = Math.round(320 * (video.videoHeight / (video.videoWidth || 1))) || 240;
                const ctx = snapCanvas.getContext('2d');
                ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
                return snapCanvas.toDataURL('image/jpeg', 0.65);
            } catch (e) {
                return null;
            }
        }

        function updateOverlayTime() {
            const el = document.getElementById('ovTime');
            if(el) { el.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>${new Date().toLocaleTimeString(appLocale())}`; }
        }

        // Menerapkan hasil koordinat (baik dari GPS otomatis maupun input manual) ke state
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

        // LOGIKA ABSEN MASUK & PULANG (LENGKAP DENGAN ANTI-CHEAT & OFFLINE PWA)
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
                if (faceState.occlusionType === 'mask') {
                    return showAlert(`<b>${t('Wajah Terhalang!')}</b> ${t('Mohon lepas masker / jauhkan tangan dari wajah')}`);
                }
                if (faceState.occlusionType === 'glasses') {
                    return showAlert(`<b>${t('Area Mata Terhalang!')}</b> ${t('Mohon lepas kacamata Anda')}`);
                }
                if (faceState.occlusionType === 'eyes_closed') {
                    return showAlert(`<b>${t('Mata Tidak Terlihat!')}</b> ${t('Buka mata Anda dan pastikan area mata terlihat jelas oleh kamera.')}`);
                }
                return showAlert('<b>Wajah terhalang!</b> Pastikan seluruh wajah (mata, hidung, mulut) terlihat jelas dan tidak tertutup tangan/masker/kacamata hitam.');
            }
            if (!faceState.wellLit) {
                if (faceState.lightStatus === 'dark') {
                    return showAlert(`<b>Pencahayaan terlalu gelap!</b> ${t('Ruangan terlalu gelap, cari tempat lebih terang')}`);
                }
                return showAlert('<b>Pencahayaan kurang mendukung!</b> Sesuaikan pencahayaan ruangan (jangan terlalu gelap/terlalu terang) lalu coba lagi.');
            }
            if (!cameraSnapshot) {
                return showAlert('<b>Foto wajah belum siap!</b> Harap diam beberapa saat sampai kamera selesai mengambil foto otomatis.');
            }

            // ================== GATING LOKASI GPS ==================
            if (currentLat === null || currentLng === null) {
                return showAlert('<b>Lokasi GPS belum terdeteksi!</b> Klik tombol ambil lokasi / izinkan akses lokasi terlebih dahulu.');
            }
            if (currentGPSSuspicious) {
                return showAlert('<b>Terindikasi Fake GPS/Mock Location!</b> Akurasi lokasi tidak wajar. Nonaktifkan aplikasi fake GPS lalu coba lagi memakai GPS asli perangkat.');
            }

            const todayStr = new Date().toISOString().split('T')[0];
            const existingRecord = absensiLogs.find(l => l.userId === currentUser.id && l.tanggal === todayStr && l.tipe === 'Masuk');
            const existingCheckout = absensiLogs.find(l => l.userId === currentUser.id && l.tanggal === todayStr && l.tipe === 'Pulang');
            if (tipe === 'Masuk' && existingRecord && existingRecord.waktuMasuk && existingRecord.waktuMasuk !== '-') {
                return showAlert('Anda sudah melakukan Absen Masuk hari ini!', 'error');
            }
            if (tipe === 'Pulang' && (!existingRecord || !existingRecord.waktuMasuk || existingRecord.waktuMasuk === '-')) {
                return showAlert('<b>Gagal Pulang!</b> Anda belum melakukan Absen Masuk hari ini.', 'error');
            }
            if (tipe === 'Pulang' && existingCheckout) {
                return showAlert('Anda sudah Absen Pulang untuk hari ini!', 'error');
            }

            const btnAbsenEl = document.getElementById(tipe === 'Masuk' ? 'btnAbsenMasuk' : 'btnAbsenPulang');
            if (btnAbsenEl) { btnAbsenEl.disabled = true; btnAbsenEl.dataset.originalHtml = btnAbsenEl.innerHTML; btnAbsenEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Memvalidasi lokasi...'; }

            try {
                let isOffline = !navigator.onLine;
                let serverResult = null;

                if (!isOffline) {
                    try {
                        serverResult = await sbSubmitAbsen({
                            tipe,
                            lat: currentLat,
                            lng: currentLng,
                            accuracy: currentGPSAccuracy,
                            companyId: currentUser.company_id,
                            userId: currentUser.id,
                            nama: currentUser.nama,
                            jabatan: currentUser.jabatan,
                            snapshot: cameraSnapshot,
                            nearestOffice: currentNearestOffice
                        });
                    } catch (err) {
                        const msg = (err.message || '').toLowerCase();
                        if (msg.includes('fetch') || msg.includes('network') || msg.includes('offline') || msg.includes('failed to fetch') || !navigator.onLine) {
                            isOffline = true;
                        } else {
                            throw err;
                        }
                    }
                }

                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];
                const jamNow = now.getHours();
                const menitNow = now.getMinutes();
                const waktuStr = now.toLocaleTimeString(appLocale());
                const shiftCfg = getShiftConfig(currentUser);

                currentGPSDistance = (serverResult && serverResult.jarak !== undefined) ? serverResult.jarak : currentGPSDistance;
                const kantorTervalidasi = (serverResult && serverResult.kantor) || (currentNearestOffice ? currentNearestOffice.office.nama : null);

                // Jika OFFLINE: Simpan ke antrean IndexedDB & snapshot foto
                if (isOffline) {
                    const offlineRecord = {
                        id: 'off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                        tipe,
                        lat: currentLat,
                        lng: currentLng,
                        accuracy: currentGPSAccuracy,
                        jarakMeter: currentGPSDistance,
                        kantorNama: kantorTervalidasi,
                        companyId: currentUser.company_id,
                        userId: currentUser.id,
                        nama: currentUser.nama,
                        jabatan: currentUser.jabatan,
                        nearestOffice: currentNearestOffice,
                        timestamp: Date.now(),
                        isoDate: todayStr,
                        localTime: waktuStr,
                        snapshot: cameraSnapshot
                    };
                    await saveOfflineAttendance(offlineRecord);
                }

                // Cari apakah user sudah pernah absen hari ini (di cache lokal)
                let existingRecord = absensiLogs.find(l => l.userId === currentUser.id && l.tanggal === todayStr);

                if (tipe === 'Masuk') {
                    if (existingRecord && existingRecord.waktuMasuk && existingRecord.waktuMasuk !== '-') {
                        if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
                        return showAlert('Anda sudah melakukan Absen Masuk hari ini!', 'error');
                    }

                    const totalMenitNow = (jamNow * 60) + menitNow;
                    const batasMenitMasuk = (shiftCfg.jamMasuk * 60) + shiftCfg.menitMasuk + (shiftCfg.toleransi || 0);
                    let isLate = totalMenitNow > batasMenitMasuk;
                    let status = isLate ? 'Terlambat' : 'Hadir';

                    const newLog = {
                        id: (serverResult && serverResult.log_id) || Date.now(),
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
                        kantorId: currentNearestOffice ? currentNearestOffice.office.id : null,
                        isOffline: isOffline
                    };

                    absensiLogs.unshift(newLog);
                    saveLogsToStorage();

                    if (isOffline) {
                        showAlert(`<b>${t('Offline: Tersimpan di Memori Perangkat')}</b><br>Koneksi internet terputus. Absen Masuk pukul ${waktuStr} tersimpan dan akan otomatis disinkronkan ke server saat online.`, 'success');
                    } else {
                        showAlert(isLate ? `Terlambat! (Batas masuk Shift ${shiftCfg.label}: ${shiftCfg.labelMasuk}). Tercatat Masuk pukul ${waktuStr}` : `Berhasil Absen Masuk pukul ${waktuStr} (Shift ${shiftCfg.label})`, isLate ? 'error' : 'success');
                    }

                } else if (tipe === 'Pulang') {
                    if (!existingRecord) {
                        if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
                        return showAlert('<b>Gagal Pulang!</b> Anda belum melakukan Absen Masuk hari ini.', 'error');
                    }
                    if (existingRecord.waktuPulang && existingRecord.waktuPulang !== '-') {
                        if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
                        return showAlert('Anda sudah Absen Pulang untuk hari ini!', 'error');
                    }

                    const totalMenitNow2 = (jamNow * 60) + menitNow;
                    const batasMenitPulang = (shiftCfg.jamPulang * 60) + shiftCfg.menitPulang;
                    if (totalMenitNow2 < batasMenitPulang) {
                        if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
                        return showAlert(`<b>Belum Waktunya Pulang!</b> Absen Pulang Shift ${shiftCfg.label} hanya bisa dilakukan mulai pukul ${shiftCfg.labelPulang}.`, 'error');
                    }

                    existingRecord.waktuPulang = waktuStr;
                    saveLogsToStorage();

                    const jamKerja = hitungDurasiKerja(existingRecord.waktuMasuk, waktuStr);
                    if (isOffline) {
                        showAlert(`<b>${t('Offline: Tersimpan di Memori Perangkat')}</b><br>Absen Pulang pukul ${waktuStr} tersimpan di antrean offline. Total Jam Kerja: <b>${jamKerja}</b>`, 'success');
                    } else {
                        showAlert(`Berhasil Absen Pulang pukul ${waktuStr}. Total Jam Kerja: <b>${jamKerja}</b>`, 'success');
                    }
                }

                resetCameraSnapshot();
                renderMyStats();

            } catch (err) {
                showAlert(`<b>${err.message}</b>`, 'error');
            } finally {
                if (btnAbsenEl) { btnAbsenEl.disabled = false; btnAbsenEl.innerHTML = btnAbsenEl.dataset.originalHtml || btnAbsenEl.innerHTML; }
            }
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

            let suratDokterLocal = null;
            let suratNama = null;
            let suratUrl = null;
            if (jenis === 'Sakit') {
                const file = fileInput.files[0];
                if (!file) { showAlert('Surat dokter wajib diupload untuk pengajuan Sakit!'); return; }
                if (file.size > 4 * 1024 * 1024) { showAlert('Ukuran file surat dokter maksimal 4MB.'); return; }
                // Upload ke Supabase Storage
                try {
                    const uploadResult = await sbUploadSuratDokter(file, currentUser.company_id, currentUser.id);
                    suratNama = uploadResult.name;
                    suratUrl = uploadResult.url;
                    // Juga simpan sebagai dataURL untuk preview lokal
                    const dataUrl = await readFileAsDataURL(file);
                    suratDokterLocal = { name: file.name, type: file.type, dataUrl: dataUrl, url: suratUrl };
                } catch (err) {
                    // Fallback: simpan sebagai dataURL lokal saja
                    try {
                        const dataUrl = await readFileAsDataURL(file);
                        suratDokterLocal = { name: file.name, type: file.type, dataUrl: dataUrl };
                        suratNama = file.name;
                    } catch (e) {
                        showAlert('Gagal membaca file surat dokter.'); return;
                    }
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

            // Simpan ke Supabase
            try {
                await sbSubmitIzin({
                    companyId: currentUser.company_id,
                    userId: currentUser.id,
                    nama: currentUser.nama,
                    jabatan: currentUser.jabatan,
                    status: jenis,
                    tanggal: tglMulai,
                    tanggalSelesai: tglSelesai,
                    jumlahHari,
                    kategoriIzin,
                    alasan,
                    suratNama,
                    suratUrl
                });
            } catch (err) {
                console.error('Gagal simpan izin ke Supabase:', err);
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
                suratDokter: suratDokterLocal,
                statusVerifikasi: jenis === 'Sakit' ? 'Menunggu Verifikasi' : null,
                catatanVerifikasi: '',
                verifikatorNama: ''
            };

            absensiLogs.unshift(newLog);
            saveLogsToStorage();
            const kategoriMsg = kategoriIzin ? ` (${t(KATEGORI_IZIN_LABEL[kategoriIzin] || kategoriIzin)}, ${jumlahHari} ${t('hari')})` : '';
            const jenisLabel = { Izin: t('Izin'), Sakit: t('Sakit'), Hadir: t('Hadir') }[jenis] || jenis;
            showAlert(`${t('Pengajuan')} ${jenisLabel}${kategoriMsg} ${t('berhasil dikirim!')}` + (suratDokterLocal ? ' ' + t('Surat dokter akan diverifikasi HRD/Admin.') : ''), 'success');
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
                tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400 italic">Tidak ada data absensi untuk tanggal yang dipilih.</td></tr>`;
                return;
            }

            displayedLogs.forEach(log => {
                let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${t('HADIR')}</span>`;
                if(log.status === 'Terlambat') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 animate-pulse">${t('TERLAMBAT')}</span>`;
                if(log.status === 'Izin') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">${t('IZIN')}</span>`;
                if(log.status === 'Sakit') {
                    statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">${t('SAKIT')}</span>`;
                    if (log.statusVerifikasi === 'Menunggu Verifikasi') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">${t('SURAT PENDING')}</span>`;
                    else if (log.statusVerifikasi === 'Disetujui') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${t('SURAT OK')}</span>`;
                    else if (log.statusVerifikasi === 'Ditolak') statusBadge += ` <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">${t('SURAT DITOLAK')}</span>`;
                }
                if (log.isOffline) {
                    statusBadge += ` <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300"><i class="fa-solid fa-cloud-arrow-up mr-0.5"></i>OFFLINE</span>`;
                }

                const masaKerja = hitungMasaKerja(log.tglMasuk);
                const durasi = hitungDurasiKerja(log.waktuMasuk, log.waktuPulang);
                const shiftLabel = SHIFT_CONFIG[log.shift || 'pagi'] ? SHIFT_CONFIG[log.shift || 'pagi'].label : 'Pagi';
                const fotoHtml = log.fotoAbsenPath
                    ? `<button onclick="openAttendancePhoto('${encodeURIComponent(log.fotoAbsenPath)}')" class="text-blue-600 hover:text-blue-800 font-semibold" title="Lihat foto bukti"><i class="fa-solid fa-image mr-1"></i>Lihat</button>`
                    : '<span class="text-slate-400">-</span>';

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
                        <td class="p-3">${fotoHtml}</td>
                    </tr>
                `;
            });
        }

        function exportAttendanceExcel() {
            if (!currentUser || !['admin', 'hrd'].includes(currentUser.role)) {
                return showAlert('Hanya Admin/HRD yang dapat mengunduh laporan absensi.', 'error');
            }
            const filterVal = document.getElementById('filterDate')?.value || '';
            const logs = (filterVal ? absensiLogs.filter(log => log.tanggal === filterVal) : absensiLogs).filter(log => log.userId);
            if (logs.length === 0) return showAlert('Tidak ada data absensi untuk diunduh.', 'error');

            const escapeExcelCell = value => {
                const text = String(value === null || value === undefined ? '' : value);
                const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
                return `"${protectedText.replace(/"/g, '""')}"`;
            };
            const rows = [
                ['Tanggal', 'Nama', 'ID Staff', 'Jabatan', 'Tipe', 'Status', 'Jam Masuk', 'Jam Pulang', 'Durasi Kerja', 'Kantor', 'Jarak (meter)', 'Akurasi GPS (meter)', 'Status Validasi', 'Status Verifikasi Foto', 'Waktu Foto'],
                ...logs.map(log => [
                    log.tanggal, log.nama, log.userId, log.jabatan, log.tipe || '', log.status,
                    log.waktuMasuk, log.waktuPulang, hitungDurasiKerja(log.waktuMasuk, log.waktuPulang),
                    log.kantorNama || '', log.jarakMeter ?? '', log.gpsAccuracy ?? '',
                    log.statusValidasi || '', log.statusVerifikasiFoto || '', log.fotoDiambilAt || ''
                ])
            ];
            const csv = rows.map(row => row.map(escapeExcelCell).join(';')).join('\r\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Laporan-Absensi-${filterVal || 'Semua-Tanggal'}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        }

        async function openAttendancePhoto(encodedPath) {
            try {
                const url = await sbGetAttendancePhotoUrl(decodeURIComponent(encodedPath));
                if (!url) throw new Error('URL foto tidak tersedia.');
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch (err) {
                showAlert(err.message || 'Foto absensi tidak dapat dibuka.', 'error');
            }
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
            await loadOfficeLocationsFromServer(); // selalu ambil data terbaru dari Supabase
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
                if (isEdit) {
                    await sbUpdateOfficeLocation({ id: editingOfficeId, nama, alamat, lat, lng, radius });
                    showAlert(`Kantor "${nama}" berhasil diperbarui.`, 'success');
                } else {
                    await sbAddOfficeLocation({ nama, alamat, lat, lng, radius });
                    showAlert(`Kantor "${nama}" berhasil ditambahkan.`, 'success');
                }
                await loadOfficeLocationsFromServer();
                resetFormKantor();
                renderLokasiKantorList();
            } catch (err) {
                showAlert(err.message || 'Gagal menyimpan data kantor.', 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        }

        async function hapusLokasiKantor(id) {
            const office = officeLocations.find(o => String(o.id) === String(id));
            if (!office) return;
            if (!confirm(`Hapus kantor "${office.nama}"?`)) return;

            try {
                await sbDeleteOfficeLocation(id);
                await loadOfficeLocationsFromServer();
                if (String(editingOfficeId) === String(id)) resetFormKantor();
                renderLokasiKantorList();
                showAlert(`Kantor "${office.nama}" berhasil dihapus.`, 'success');
            } catch (err) {
                showAlert(err.message || 'Gagal menghapus kantor.', 'error');
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
            tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data karyawan...</td></tr>';
            // Load dari Supabase
            sbGetCompanyUsers().then(sbUsers => {
                // Sinkronkan array users lokal dengan data Supabase
                users = sbUsers.map(u => ({
                    id: u.employee_id || u.id,
                    supabaseId: u.id,
                    nama: u.nama,
                    jabatan: u.jabatan,
                    role: u.role,
                    shift: u.shift || 'pagi',
                    jatahCuti: u.jatah_cuti ?? 12,
                    allowChangePassword: !!u.allow_change_password,
                    tglMasuk: u.tgl_masuk,
                    is_active: u.is_active
                }));
                saveUsersToStorage();
                _renderAdminUsersTable();
            }).catch(err => {
                console.error('Gagal load users dari Supabase:', err);
                _renderAdminUsersTable(); // fallback ke data lokal
            });
            renderTodayStats();
        }

        function _renderAdminUsersTable() {
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
            if (role === 'admin') return t('Admin Perusahaan');
            if (role === 'hrd') return 'HRD';
            if (role === 'magang') return t('Magang / PKL');
            return t('Staff');
        }

        // ================== STATISTIK HARIAN (MONITORING & DASHBOARD) ==================
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
            // Panel Admin (Staff Section)
            setText('statTodayTotal', totalKaryawan);
            setText('statTodayHadir', hadirCount);
            setText('statTodayIzin', izinCount);
            setText('statTodaySakit', sakitCount);
            setText('statTodayBelum', belumAbsen);

            // Dashboard Monitoring
            setText('statHrdTotal', totalKaryawan);
            setText('statHrdHadir', hadirCount);
            setText('statHrdIzin', izinCount);
            setText('statHrdSakit', sakitCount);
            setText('statHrdBelum', belumAbsen);
        }

        async function addUser(e) {
            e.preventDefault();
            if (!currentUser) return;
            let emailInput = document.getElementById('addUsername').value.trim();
            let nama       = document.getElementById('addNama').value.trim();
            let jabatan    = document.getElementById('addJabatan').value.trim();
            const role       = document.getElementById('addRole').value;
            const shift      = document.getElementById('addShift').value;
            const tglMasuk   = document.getElementById('addTglMasuk').value;
            const jatahCuti  = parseInt(document.getElementById('addJatahCuti').value, 10) || 12;
            let employeeId = document.getElementById('addId').value.trim();
            const passInput  = document.getElementById('addPassword') ? document.getElementById('addPassword').value.trim() : '';
            const finalPassword = passInput || 'AbsensiPro@2024!';

            // Sanitasi Input Form
            if (window.SecuritySanitizer) {
                nama = window.SecuritySanitizer.sanitizeText(nama, 100);
                jabatan = window.SecuritySanitizer.sanitizeText(jabatan, 100);
                employeeId = window.SecuritySanitizer.sanitizeText(employeeId, 50);
                emailInput = window.SecuritySanitizer.sanitizeText(emailInput, 150);
            }

            if (passInput && passInput.length < 6) {
                return showAlert('Password awal minimal 6 karakter.', 'error');
            }

            if (!emailInput || !nama) { showAlert('Nama dan email wajib diisi.', 'error'); return; }

            // Validasi format email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput)) {
                return showAlert('<b>Format Email Tidak Valid!</b><br>Masukkan alamat email lengkap (contoh: <code>karyawan@gmail.com</code> atau <code>nama@perusahaan.com</code>).', 'error');
            }

            const btnSubmit = e.target.querySelector('button[type="submit"]');
            if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menyimpan...'; }

            try {
                await sbAdminAddUser({
                    nama, jabatan, role, shift,
                    jatah_cuti: jatahCuti,
                    tgl_masuk: tglMasuk || new Date().toISOString().split('T')[0],
                    employee_id: employeeId,
                    email: emailInput,
                    password: finalPassword,
                    companyId: currentUser.company_id
                });
                e.target.reset();
                renderAdminUsers();
                showAlert(`Karyawan <b>${nama}</b> (Role: <b>${roleLabel(role)}</b>) berhasil ditambahkan!<br>Email Login: <b>${emailInput}</b><br>Password Awal: <b>${finalPassword}</b><br><span class="text-[11px] text-slate-500">Berikan email dan password awal ini kepada karyawan untuk login pertama kali.</span>`, 'success');
            } catch (err) {
                let msg = err.message || 'Gagal menambahkan karyawan.';
                if (msg.includes('invalid format') || msg.includes('Unable to validate email address')) {
                    msg = 'Format email tidak valid. Masukkan email lengkap seperti <b>nama@gmail.com</b>.';
                } else if (msg.includes('already registered') || msg.includes('already been registered')) {
                    msg = 'Email ini sudah terdaftar di sistem. Gunakan email lain.';
                }
                showAlert('<b>Gagal:</b> ' + msg, 'error');
            } finally {
                if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i>Tambah Karyawan'; }
            }
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
        async function saveShiftChange() {
            const u = users.find(x => x.id === activeShiftUserId);
            if (!u) return;
            const newShift = document.getElementById('shiftModalSelect').value;
            const supabaseId = u.supabaseId || u.id;
            try {
                await sbUpdateUserProfile(supabaseId, { shift: newShift });
                u.shift = newShift;
                saveUsersToStorage();
                closeShiftModal();
                renderAdminUsers();
                showAlert(`Shift <b>${u.nama}</b> berhasil diubah menjadi Shift <b>${getShiftConfig(u).label}</b> (${getShiftConfig(u).labelMasuk} - ${getShiftConfig(u).labelPulang}).`, 'success');
                if (currentUser && currentUser.id === u.id) {
                    currentUser.shift = u.shift;
                    setupKaryawanView();
                }
            } catch (err) {
                showAlert('Gagal ubah shift: ' + err.message, 'error');
            }
        }

        async function deleteUser(id) {
            if (!confirm('Nonaktifkan karyawan ini? Mereka tidak akan bisa login lagi.')) return;
            // Cari supabaseId (UUID) dari user berdasarkan id lokal
            const u = users.find(x => x.id === id);
            const supabaseId = u ? (u.supabaseId || u.id) : id;
            try {
                await sbDeactivateUser(supabaseId);
                users = users.filter(u => u.id !== id);
                saveUsersToStorage();
                renderAdminUsers();
                showAlert('Karyawan berhasil dinonaktifkan.', 'success');
            } catch (err) {
                showAlert('Gagal menonaktifkan karyawan: ' + err.message, 'error');
            }
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
        async function savePasswordChangeByAdmin() {
            const u = users.find(x => x.id === activePasswordUserId);
            if (!u) return;
            const newPass = document.getElementById('passwordModalInput').value.trim();
            const allow = document.getElementById('passwordModalAllow').checked;
            const supabaseId = u.supabaseId || u.id;

            try {
                // Update allow_change_password di Supabase profiles
                await sbUpdateUserProfile(supabaseId, { allow_change_password: allow });
                u.allowChangePassword = allow;

                if (newPass) {
                    if (newPass.length < 6) { showAlert('Password baru minimal 6 karakter.'); return; }
                    // Catatan: Supabase admin password reset hanya bisa via service_role.
                    // Simpan flag must_change_password agar karyawan diminta ganti saat login.
                    await sbUpdateUserProfile(supabaseId, { must_change_password: true });
                    showAlert(`Flag "wajib ganti password" diaktifkan untuk <b>${u.nama}</b>. Hubungi karyawan untuk reset via email.`, 'success');
                }

                saveUsersToStorage();
                closePasswordModal();
                renderAdminUsers();
                if (!newPass) showAlert(`Pengaturan izin password <b>${u.nama}</b> berhasil disimpan.`, 'success');
            } catch (err) {
                showAlert('Gagal: ' + err.message, 'error');
            }
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
        async function saveShiftTimeChange() {
            const shiftKey = activeShiftEditKey;
            const cfg = SHIFT_CONFIG[shiftKey];
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
            try {
                await sbUpsertShiftConfig({
                    companyId: currentUser.company_id,
                    shiftKey,
                    label: cfg.label,
                    jamMasuk: jm,
                    menitMasuk: mm,
                    jamPulang: jp,
                    menitPulang: mp,
                    toleransi
                });
            } catch (err) {
                showAlert(err.message || 'Gagal menyimpan konfigurasi shift.', 'error');
                return;
            }
            closeShiftTimeModal();
            renderShiftMasterTable();
            showAlert(`Jam kerja Shift <b>${cfg.label}</b> berhasil diubah menjadi <b>${cfg.labelMasuk} - ${cfg.labelPulang}</b>.`, 'success');
            // Sinkronkan tampilan jika user yang sedang login memakai shift ini
            if (currentUser && (currentUser.shift || 'pagi') === shiftKey) {
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
        async function saveCutiChange() {
            const u = users.find(x => x.id === activeCutiUserId);
            if (!u) return;
            const val = parseInt(document.getElementById('cutiModalInput').value, 10);
            if (isNaN(val) || val < 0) { showAlert('Jatah cuti harus berupa angka 0 atau lebih.'); return; }
            const supabaseId = u.supabaseId || u.id;
            try {
                await sbUpdateUserProfile(supabaseId, { jatah_cuti: val });
                u.jatahCuti = val;
                saveUsersToStorage();
                closeCutiModal();
                renderAdminUsers();
                showAlert(`Jatah cuti tahunan <b>${u.nama}</b> berhasil diubah menjadi <b>${val} hari</b>.`, 'success');
                if (currentUser && currentUser.id === u.id) {
                    currentUser.jatahCuti = val;
                    renderMyStats();
                }
            } catch (err) {
                showAlert('Gagal ubah jatah cuti: ' + err.message, 'error');
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
        // supaya bagian yang sudah ter-render (kalender, statistik, tabel, log keamanan, dsb) langsung
        // ikut berubah bahasa tanpa perlu reload halaman dan tanpa merusak tampilan.
        function onLanguageChanged() {
            if (!currentUser) return;
            if (typeof checkSession === 'function') checkSession(false);
            if (typeof renderMyStats === 'function') renderMyStats();
            if (typeof renderIzinCalendar === 'function') renderIzinCalendar('kalender', kalenderViewDate, true);
            if (typeof updateCutiInfoForm === 'function') updateCutiInfoForm();
            if (typeof renderTable === 'function') { try { renderTable(); } catch (e) {} }
            if (typeof renderTodayStats === 'function') { try { renderTodayStats(); } catch (e) {} }
            if (typeof renderSecurityLogs === 'function' && currentActiveTab === 'securitylog') { try { renderSecurityLogs(); } catch (e) {} }
            if (typeof renderShiftMasterTable === 'function' && currentActiveTab === 'shiftmaster') { try { renderShiftMasterTable(); } catch (e) {} }
            if (typeof renderAdminUsers === 'function' && currentActiveTab === 'users') { try { renderAdminUsers(); } catch (e) {} }
            if (typeof renderLokasiKantorForm === 'function' && currentActiveTab === 'lokasikantor') { try { renderLokasiKantorForm(); } catch (e) {} }
        }
        window.onLanguageChanged = onLanguageChanged;

        function showForgotPasswordModal() { document.getElementById('forgotModal').classList.remove('hidden'); }
        function closeForgotModal() { document.getElementById('forgotModal').classList.add('hidden'); }
        async function handleForgotSubmit() {
            const val = document.getElementById('forgotEmail').value.trim();
            if (!val) return showAlert('Isi email terlebih dahulu.');
            const btn = document.getElementById('forgotSubmitBtn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Mengirim...'; }
            try {
                await sbForgotPassword(val);
                closeForgotModal();
                showAlert(`Link reset password telah dikirim ke <b>${val}</b>. Periksa kotak masuk email Anda.`, 'success');
            } catch (err) {
                showAlert('Gagal: ' + err.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = 'Kirim Link Reset'; }
            }
        }

        // ============================================================
        // LOG KEAMANAN & AUDIT REAL-TIME (ADMIN VIEW)
        // ============================================================
        async function renderSecurityLogs() {
            const tbody = document.getElementById('securityLogTableBody');
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic"><i class="fa-solid fa-spinner fa-spin mr-2"></i>${t('Memuat log keamanan...')}</td></tr>`;

            // Populate input konfigurasi Webhook & Sentry
            const whInput = document.getElementById('inputWebhookUrl');
            if (whInput && window.SecurityLogger) whInput.value = window.SecurityLogger.getWebhookUrl();
            const sentryInput = document.getElementById('inputSentryDsn');
            if (sentryInput && window.SecurityLogger) sentryInput.value = window.SecurityLogger.getSentryDsn();

            let logs = [];
            if (typeof sbGetSecurityLogs === 'function' && currentUser) {
                logs = await sbGetSecurityLogs({ companyId: currentUser.company_id, limit: 100 });
            } else if (window.SecurityLogger) {
                logs = window.SecurityLogger.getLocalLogs();
            }

            const totalEventsEl = document.getElementById('statTotalSecurityEvents');
            const totalWarningsEl = document.getElementById('statTotalSecurityWarnings');
            if (totalEventsEl) totalEventsEl.innerText = logs.length;
            if (totalWarningsEl) totalWarningsEl.innerText = logs.filter(l => l.severity === 'WARNING' || l.severity === 'CRITICAL').length;

            if (!logs || logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">${t('Belum ada aktivitas keamanan yang mencurigakan tercatat.')}</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            logs.forEach(log => {
                let badgeClass = 'bg-slate-100 text-slate-700';
                if (log.severity === 'WARNING') badgeClass = 'bg-amber-100 text-amber-800 font-bold';
                if (log.severity === 'CRITICAL') badgeClass = 'bg-red-100 text-red-800 font-bold animate-pulse';
                if (log.severity === 'INFO') badgeClass = 'bg-blue-50 text-blue-700 font-semibold';

                const timeFormatted = log.timestamp ? new Date(log.timestamp).toLocaleString(typeof appLocale === 'function' ? appLocale() : 'id-ID') : '-';
                const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '-');

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono text-[11px] text-slate-600">${timeFormatted}</td>
                        <td class="p-3 font-semibold text-slate-800">${log.eventType || '-'}</td>
                        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] ${badgeClass}">${log.severity || 'INFO'}</span></td>
                        <td class="p-3 text-slate-600">${log.userEmail || log.userId || '-'}</td>
                        <td class="p-3 text-[11px] text-slate-500 font-mono max-w-xs truncate" title="${detailsStr}">${detailsStr}</td>
                    </tr>
                `;
            });
        }

        function saveWebhookConfig() {
            const input = document.getElementById('inputWebhookUrl');
            if (!input) return;
            const url = input.value.trim();
            if (window.SecurityLogger) {
                window.SecurityLogger.setWebhookUrl(url);
                showAlert(url ? 'Webhook alert berhasil disimpan!' : 'Webhook alert dinonaktifkan.', 'success');
            }
        }
        window.saveWebhookConfig = saveWebhookConfig;

        async function testWebhookAlert() {
            if (!window.SecurityLogger) return;
            const url = window.SecurityLogger.getWebhookUrl();
            if (!url) {
                return showAlert('Silakan masukkan Webhook URL terlebih dahulu sebelum melakukan test alert.', 'error');
            }
            window.SecurityLogger.log({
                eventType: 'TEST_SECURITY_ALERT',
                severity: 'WARNING',
                details: { message: 'Uji coba notifikasi keamanan real-time dari AbsensiPro Enterprise Security Engine.' }
            });
            showAlert('Sinyal uji coba alert telah dikirim ke Webhook!', 'success');
        }
        window.testWebhookAlert = testWebhookAlert;

        function saveSentryConfig() {
            const input = document.getElementById('inputSentryDsn');
            if (!input) return;
            const dsn = input.value.trim();
            if (window.SecurityLogger) {
                window.SecurityLogger.setSentryDsn(dsn);
                showAlert(dsn ? 'Sentry DSN berhasil disimpan & diinisialisasi!' : 'Sentry DSN dinonaktifkan.', 'success');
            }
        }
        window.saveSentryConfig = saveSentryConfig;

        function clearLocalAuditLogs() {
            if (!confirm('Apakah Anda yakin ingin membersihkan riwayat log keamanan lokal?')) return;
            try {
                localStorage.removeItem('__absensi_audit_logs');
                renderSecurityLogs();
                showAlert('Log keamanan lokal berhasil dibersihkan.', 'success');
            } catch (e) {
                showAlert('Gagal membersihkan log: ' + e.message, 'error');
            }
        }

        function showSecurityAlertBadge(logEntry) {
            const badge = document.getElementById('badgeSecurityAlerts');
            if (badge) {
                badge.classList.remove('hidden');
                badge.title = `Peringatan: ${logEntry.eventType} (${logEntry.severity})`;
            }
        }
        window.showSecurityAlertBadge = showSecurityAlertBadge;

        // ============================================================
        // BACKUP OTOMATIS & PEMULIHAN DATA PERUSAHAAN (ADMIN VIEW)
        // ============================================================
        async function handleDownloadBackupClick() {
            if (!currentUser || currentUser.role !== 'admin') {
                showAlert('Hanya Admin yang dapat mengunduh backup data.');
                return;
            }

            const btn = document.getElementById('btnDownloadBackup');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${t('Menyiapkan Snapshot Data...')}`;
            }

            try {
                const backup = await sbExportTenantBackup(currentUser.company_id, currentUser.company_nama || t('Perusahaan'));
                if (window.BackupEngine) {
                    window.BackupEngine.downloadBackup(backup.fileName, backup.jsonString);
                }
                showAlert(`${t('Snapshot database')} <b>${backup.fileName}</b> ${t('berhasil diunduh! Simpan file ini di lokasi aman.')}`, 'success');
            } catch (err) {
                showAlert('Gagal membuat backup: ' + err.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-download mr-2"></i>${t('Buat & Unduh Snapshot Backup')}`;
                }
            }
        }

        function handleInspectBackupFile(e) {
            const file = e.target.files[0];
            const resultBox = document.getElementById('backupInspectResult');
            if (!file || !resultBox) return;

            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (!json.metadata || !json.tables) {
                        resultBox.className = 'p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1';
                        resultBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${t('File JSON bukan format snapshot AbsensiPro yang valid.')}`;
                        resultBox.classList.remove('hidden');
                        return;
                    }

                    const formattedDate = json.metadata.backupDate ? new Date(json.metadata.backupDate).toLocaleString(typeof appLocale === 'function' ? appLocale() : 'id-ID') : '-';
                    resultBox.className = 'p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1';
                    resultBox.innerHTML = `
                        <p class="font-bold"><i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> ${t('File Backup Terverifikasi Valid')}</p>
                        <p>${t('Perusahaan')}: <b>${json.metadata.companyName || '-'}</b> (ID: ${json.metadata.companyId || '-'})</p>
                        <p>${t('Tanggal Dibuat:')} <b>${formattedDate}</b></p>
                        <p class="text-[11px] text-emerald-700 pt-1">
                            • ${t('Staff')}: ${(json.tables.profiles || []).length} ${t('entri')} |
                            • ${t('Log Absen')}: ${(json.tables.attendance_logs || []).length} ${t('entri')} |
                            • ${t('Lokasi Kantor')}: ${(json.tables.office_locations || []).length} ${t('entri')}
                        </p>
                    `;
                    resultBox.classList.remove('hidden');
                } catch (err) {
                    resultBox.className = 'p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1';
                    resultBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${t('Gagal membaca file JSON: format rusak.')}`;
                    resultBox.classList.remove('hidden');
                }
            };
            reader.readAsText(file);
        }