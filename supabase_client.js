// [$] AbsensiPro - Runtime Configuration Loader v3
// [$] Encoded credentials - DO NOT MODIFY THIS SECTION MANUALLY
;(function(_w){
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var _0xu = 'MjkxNjA3MTUxZDQ5NDY3ZjA2MDczZTNmNTUxNzFiNDUxMzI4NTY0NTU1NWY1NDI5NTMzOTEzMGE0YjFkMDYxOTMxMTAwZTJjMzYxZDAwMWQ=';
var _0xk = ['NjE3MGE0NzcwNzQzOTFhNGQyNjBmNTEzZTM3MDEwOTM1MDExYjE1MWMyMDAyMw==', '29477326471f1745', '103615061c126c08', '1e4b4d2c5d4959'];
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var _xk='\x41\x62\x73\x65\x6e\x73\x69\x50\x72\x6f\x5f\x53\x33\x63\x72\x33\x74\x5f\x32\x30\x32\x34\x21\x40\x23';
function _xd(h,k){return h.match(/.{2}/g).map(function(b,i){return String.fromCharCode(parseInt(b,16)^k.charCodeAt(i%k.length));}).join('');}
function _b64d(s){try{return typeof atob!=='undefined'?atob(s):Buffer.from(s,'base64').toString();}catch(e){return '';}}
var _ru=_xd(_b64d(_0xu),_xk);
var _ra = '';
try {
    var _hex1 = _b64d(_0xk[0]).split('').reverse().join('');
    var _hex = _hex1 + _0xk[1] + _0xk[2] + _0xk[3];
    _ra = _xd(_hex, _xk);
} catch (_e) {}
// Validasi: URL harus diawali https:// dan key harus cukup panjang
var _uv=_ru&&_ru.startsWith('https://')&&_ru.length>15;
var _kv=_ra&&_ra.length>20;
// Simpan ke property window yang di-encode namanya (bukan __SB_URL yang mudah dicari)
var _un=atob('X19TQl9VUkw='); // __SB_URL
var _kn=atob('X19TQl9LRVk='); // __SB_KEY
_w[_un]=_uv?_ru:'';
_w[_kn]=_kv?_ra:'';
if(!_uv||!_kv){
    // Tampilkan error di layar aplikasi (bukan console yang sudah dineutralisasi)
    document.addEventListener('DOMContentLoaded',function(){
        var e=document.createElement('div');
        e.style.cssText='position:fixed;inset:0;background:#0f172a;color:#f87171;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;font-family:monospace;padding:20px;text-align:center;';
        e.innerHTML='<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>'
            +'<p style="font-size:1.1rem;font-weight:bold;margin:12px 0 6px">Konfigurasi Belum Siap</p>'
            +'<p style="font-size:.85rem;max-width:420px;color:#94a3b8">Jalankan <b>node obfuscate_config.js</b> lalu paste hasilnya ke <b>supabase_client.js</b>. Hubungi administrator jika Anda pengguna biasa.</p>';
        document.body.appendChild(e);
    });
}
})(typeof window!=='undefined'?window:global);

// ============================================================
// SUPABASE CLIENT - AbsensiPro Multi-Tenant
// Auth, Database (profiles, attendance_logs, office_locations, shift_configs)
// ============================================================

// Ambil URL & Key dari encoded runtime loader di atas (tidak ada fallback plaintext)
const SUPABASE_URL  = window[atob('X19TQl9VUkw=')] || '';
const SUPABASE_ANON = window[atob('X19TQl9LRVk=')] || '';

// Inisialisasi client Supabase secara aman
const { createClient } = typeof supabase !== 'undefined' ? supabase : { createClient: () => null };
const sb = (SUPABASE_URL && SUPABASE_ANON && SUPABASE_ANON.length >= 20 && typeof createClient === 'function')
    ? createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    })
    : {
        auth: {
            signUp: async () => ({ error: new Error('Konfigurasi Supabase belum diset. Jalankan node obfuscate_config.js') }),
            signInWithPassword: async () => ({ error: new Error('Konfigurasi Supabase belum diset. Jalankan node obfuscate_config.js') }),
            signOut: async () => {},
            getSession: async () => ({ data: { session: null } }),
            getUser: async () => ({ data: { user: null } }),
            resetPasswordForEmail: async () => ({ error: new Error('Konfigurasi Supabase belum diset.') }),
            updateUser: async () => ({ error: new Error('Konfigurasi Supabase belum diset.') })
        },
        from: () => ({
            select: () => ({ single: async () => ({ data: null, error: new Error('Supabase not configured') }), order: () => ({ eq: () => ({ data: [], error: null }) }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
            update: () => ({ eq: async () => ({ error: new Error('Supabase not configured') }) }),
            delete: () => ({ eq: async () => ({ error: new Error('Supabase not configured') }) })
        })
    };

// ============================================================
// AUTH FUNCTIONS
// ============================================================

/**
 * Register perusahaan baru + akun admin pertama.
 */
async function sbRegister({ kode_perusahaan, nama_perusahaan, nama, email, password }) {
    const { data: company, error: compErr } = await sb
        .from('companies')
        .insert({ code: kode_perusahaan.toUpperCase(), nama: nama_perusahaan })
        .select('id')
        .single();

    if (compErr) {
        if (compErr.code === '23505') {
            throw new Error('Kode perusahaan sudah dipakai. Pilih kode lain.');
        }
        throw new Error('Gagal membuat data perusahaan: ' + compErr.message);
    }

    const companyId = company.id;

    const { data: authData, error: authErr } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: {
                company_id: companyId,
                nama: nama || (nama_perusahaan + ' Admin'),
                jabatan: 'System Admin',
                role: 'admin',
                shift: 'pagi',
                jatah_cuti: 12,
                tgl_masuk: new Date().toISOString().split('T')[0],
                must_change_password: false
            },
            emailRedirectTo: null
        }
    });

    if (authErr) {
        await sb.from('companies').delete().eq('id', companyId);
        throw new Error('Gagal membuat akun: ' + authErr.message);
    }

    await sbInsertDefaultShifts(companyId);
    return { kode_perusahaan: kode_perusahaan.toUpperCase(), company_id: companyId };
}

/**
 * Login dengan kode perusahaan + email + password.
 */
async function sbLogin({ kode_perusahaan, email, password }) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        throw new Error('Email/password salah, atau akun belum terdaftar.');
    }

    const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('company_id, role, nama, jabatan, shift, jatah_cuti, allow_change_password, tgl_masuk, must_change_password, employee_id, is_active')
        .eq('id', data.user.id)
        .single();

    if (profErr || !profile) {
        await sb.auth.signOut();
        throw new Error('Profil akun tidak ditemukan. Hubungi administrator.');
    }

    if (!profile.is_active) {
        await sb.auth.signOut();
        throw new Error('Akun Anda tidak aktif. Hubungi administrator.');
    }

    const { data: company, error: compErr } = await sb
        .from('companies')
        .select('code, nama, is_active')
        .eq('id', profile.company_id)
        .single();

    if (compErr || !company) {
        await sb.auth.signOut();
        throw new Error('Data perusahaan tidak ditemukan.');
    }

    if (!company.is_active) {
        await sb.auth.signOut();
        throw new Error('Perusahaan Anda tidak aktif.');
    }

    if (company.code !== kode_perusahaan.toUpperCase().trim()) {
        await sb.auth.signOut();
        throw new Error('Kode perusahaan, email, atau password salah.');
    }

    return {
        id: data.user.id,
        email: data.user.email,
        nama: profile.nama,
        jabatan: profile.jabatan,
        role: profile.role,
        shift: profile.shift || 'pagi',
        jatah_cuti: profile.jatah_cuti ?? 12,
        jatahCuti: profile.jatah_cuti ?? 12,
        allow_change_password: !!profile.allow_change_password,
        allowChangePassword: !!profile.allow_change_password,
        tgl_masuk: profile.tgl_masuk,
        tglMasuk: profile.tgl_masuk,
        must_change_password: !!profile.must_change_password,
        mustChangePassword: !!profile.must_change_password,
        employee_id: profile.employee_id,
        company_id: profile.company_id,
        company_nama: company.nama,
        company_code: company.code
    };
}

/**
 * Logout dari Supabase Auth
 */
async function sbLogout() {
    await sb.auth.signOut();
}

/**
 * Ambil sesi aktif dan profil user
 */
async function sbGetCurrentUser() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;

    const { data: profile } = await sb
        .from('profiles')
        .select('company_id, role, nama, jabatan, shift, jatah_cuti, allow_change_password, tgl_masuk, must_change_password, employee_id, is_active')
        .eq('id', session.user.id)
        .single();

    if (!profile || !profile.is_active) return null;

    const { data: company } = await sb
        .from('companies')
        .select('code, nama, is_active')
        .eq('id', profile.company_id)
        .single();

    if (!company || !company.is_active) return null;

    return {
        id: session.user.id,
        email: session.user.email,
        nama: profile.nama,
        jabatan: profile.jabatan,
        role: profile.role,
        shift: profile.shift || 'pagi',
        jatah_cuti: profile.jatah_cuti ?? 12,
        jatahCuti: profile.jatah_cuti ?? 12,
        allow_change_password: !!profile.allow_change_password,
        allowChangePassword: !!profile.allow_change_password,
        tgl_masuk: profile.tgl_masuk,
        tglMasuk: profile.tgl_masuk,
        must_change_password: !!profile.must_change_password,
        mustChangePassword: !!profile.must_change_password,
        employee_id: profile.employee_id,
        company_id: profile.company_id,
        company_nama: company.nama,
        company_code: company.code
    };
}

/**
 * Kirim email reset password
 */
async function sbForgotPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw new Error('Gagal mengirim email reset: ' + error.message);
}

/**
 * Ganti password user yang sedang login
 */
async function sbChangePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error('Gagal mengubah password: ' + error.message);
}

// ============================================================
// OFFICE LOCATIONS FUNCTIONS
// ============================================================

async function sbGetOfficeLocations() {
    // Ambil company_id user aktif untuk filter eksplisit (defense-in-depth, selain RLS)
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Tidak terautentikasi.');
    const { data: profile } = await sb.from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = profile?.company_id;

    let query = sb
        .from('office_locations')
        .select('id, nama, alamat, lat, lng, radius')
        .order('nama', { ascending: true });
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;
    if (error) throw new Error('Gagal memuat lokasi kantor: ' + error.message);
    return (data || []).map(o => ({
        ...o,
        lat: parseFloat(o.lat),
        lng: parseFloat(o.lng),
        radius: parseInt(o.radius, 10)
    }));
}

async function sbAddOfficeLocation({ nama, alamat, lat, lng, radius }) {
    const { data: { user } } = await sb.auth.getUser();
    const { data: profile } = await sb.from('profiles').select('company_id').eq('id', user.id).single();

    const { data, error } = await sb
        .from('office_locations')
        .insert({ company_id: profile.company_id, nama, alamat, lat, lng, radius })
        .select('id, nama, alamat, lat, lng, radius')
        .single();

    if (error) throw new Error('Gagal menambah kantor: ' + error.message);
    return { ...data, lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
}

async function sbUpdateOfficeLocation({ id, nama, alamat, lat, lng, radius }) {
    const { error } = await sb
        .from('office_locations')
        .update({ nama, alamat, lat, lng, radius, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw new Error('Gagal memperbarui kantor: ' + error.message);
}

async function sbDeleteOfficeLocation(id) {
    const { error } = await sb.from('office_locations').delete().eq('id', id);
    if (error) throw new Error('Gagal menghapus kantor: ' + error.message);
}

// ============================================================
// ATTENDANCE LOG FUNCTIONS
// ============================================================

async function sbSubmitAbsen({ tipe, lat, lng, accuracy, companyId, userId, nama, jabatan, nearestOffice }) {
    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const waktu = now.toTimeString().split(' ')[0];

    let statusValidasi = 'Diterima';
    let alasanTolak = null;
    let kantorId = null;
    let kantorNama = null;
    let jarak = null;

    if (nearestOffice) {
        jarak = nearestOffice.distance;
        kantorId = nearestOffice.office.id;
        kantorNama = nearestOffice.office.nama;
        if (!nearestOffice.valid) {
            statusValidasi = 'Ditolak';
            alasanTolak = `Di luar radius kantor. Jarak Anda sekitar ${jarak} meter dari ${kantorNama} (maksimal ${nearestOffice.office.radius} meter).`;
        }
    }

    const logData = {
        company_id: companyId,
        user_id: userId,
        nama,
        jabatan,
        tipe,
        status: tipe === 'Masuk' ? 'Hadir' : null,
        tanggal,
        gps_lat: lat,
        gps_lng: lng,
        gps_accuracy: accuracy,
        jarak_meter: jarak,
        kantor_id: kantorId,
        kantor_nama: kantorNama,
        status_validasi: statusValidasi,
        alasan_tolak: alasanTolak
    };

    const { data, error } = await sb
        .from('attendance_logs')
        .insert(logData)
        .select('id, tanggal, status_validasi, alasan_tolak, kantor_nama, jarak_meter')
        .single();

    if (error) throw new Error('Gagal menyimpan absen: ' + error.message);

    if (statusValidasi === 'Ditolak') {
        throw new Error(alasanTolak || 'Absen ditolak oleh server.');
    }

    return { tanggal, waktu, jarak, kantor: kantorNama, log_id: data.id };
}

async function sbGetAttendanceLogs({ tanggal = null, companyId = null } = {}) {
    // companyId wajib untuk isolasi multi-tenant (defense-in-depth selain RLS)
    let query = sb.from('attendance_logs').select('*').order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (tanggal) query = query.eq('tanggal', tanggal);
    const { data, error } = await query;
    if (error) throw new Error('Gagal memuat data absensi: ' + error.message);
    return data || [];
}

async function sbGetMyTodayLog(userId) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await sb
        .from('attendance_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('tanggal', today)
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
}

async function sbUpdateAttendanceLog(id, updates) {
    const { error } = await sb.from('attendance_logs').update(updates).eq('id', id);
    if (error) throw new Error('Gagal memperbarui log absensi: ' + error.message);
}

async function sbSubmitIzin({ companyId, userId, nama, jabatan, status, tanggal, tanggalSelesai, jumlahHari, kategoriIzin, alasan, suratNama, suratUrl }) {
    const { data, error } = await sb
        .from('attendance_logs')
        .insert({
            company_id: companyId,
            user_id: userId,
            nama, jabatan, status, tanggal,
            tanggal_selesai: tanggalSelesai || tanggal,
            jumlah_hari: jumlahHari || 1,
            kategori_izin: kategoriIzin,
            lokasi_text: alasan ? 'Keterangan: ' + alasan : null,
            surat_nama: suratNama || null,
            surat_url: suratUrl || null,
            status_verifikasi: status === 'Sakit' ? 'Menunggu Verifikasi' : null,
            waktu_masuk: new Date().toTimeString().split(' ')[0]
        })
        .select('id')
        .single();
    if (error) throw new Error('Gagal menyimpan pengajuan: ' + error.message);
    return data;
}

// ============================================================
// USER MANAGEMENT (ADMIN PANEL)
// ============================================================

async function sbGetCompanyUsers() {
    // Multi-tenant defense-in-depth: filter eksplisit company_id user aktif
    // (selain RLS yang sudah berjalan di Supabase)
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Tidak terautentikasi.');
    const { data: profile } = await sb.from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error('company_id tidak ditemukan untuk user ini.');

    let query = sb
        .from('profiles')
        .select('id, employee_id, nama, jabatan, role, shift, jatah_cuti, allow_change_password, tgl_masuk, is_active, must_change_password, created_at')
        .eq('company_id', companyId)  // isolasi eksplisit per perusahaan
        .eq('is_active', true)
        .order('nama', { ascending: true });

    const { data, error } = await query;
    if (error) throw new Error('Gagal memuat data user: ' + error.message);
    return data;
}

async function sbAdminAddUser({ nama, jabatan, role, shift, jatah_cuti, tgl_masuk, employee_id, email, password, companyId }) {
    const { data: { session: adminSession } } = await sb.auth.getSession();

    const { data: authData, error: authErr } = await sb.auth.signUp({
        email,
        password: password || 'AbsensiPro@2024!',
        options: {
            data: {
                company_id: companyId,
                nama, jabatan,
                role: role || 'karyawan',
                shift: shift || 'pagi',
                jatah_cuti: jatah_cuti || 12,
                tgl_masuk: tgl_masuk || new Date().toISOString().split('T')[0],
                must_change_password: true
            },
            emailRedirectTo: null
        }
    });

    if (authErr) throw new Error('Gagal membuat akun: ' + authErr.message);

    // Restore session admin
    if (adminSession) {
        await sb.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
        });
    }

    if (employee_id && authData.user) {
        await sb.from('profiles').update({ employee_id }).eq('id', authData.user.id);
    }

    return authData.user;
}

async function sbUpdateUserProfile(userId, updates) {
    const { error } = await sb
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId);
    if (error) throw new Error('Gagal memperbarui profil: ' + error.message);
}

async function sbDeactivateUser(userId) {
    const { error } = await sb.from('profiles').update({ is_active: false }).eq('id', userId);
    if (error) throw new Error('Gagal menonaktifkan user: ' + error.message);
}

// ============================================================
// SHIFT CONFIG FUNCTIONS
// ============================================================

async function sbGetShiftConfigs(companyId) {
    // Filter eksplisit by company_id untuk isolasi multi-tenant
    let query = sb.from('shift_configs').select('*').order('shift_key', { ascending: true });
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    if (error) return null;
    return data || [];
}

async function sbUpsertShiftConfig({ companyId, shiftKey, label, jamMasuk, menitMasuk, jamPulang, menitPulang, toleransi }) {
    const { error } = await sb.from('shift_configs').upsert({
        company_id: companyId, shift_key: shiftKey, label,
        jam_masuk: jamMasuk, menit_masuk: menitMasuk,
        jam_pulang: jamPulang, menit_pulang: menitPulang, toleransi
    }, { onConflict: 'company_id,shift_key' });
    if (error) throw new Error('Gagal menyimpan konfigurasi shift: ' + error.message);
}

async function sbInsertDefaultShifts(companyId) {
    const defaults = [
        { company_id: companyId, shift_key: 'pagi',  label: 'Pagi',  jam_masuk: 8,  menit_masuk: 0, jam_pulang: 16, menit_pulang: 0, toleransi: 15 },
        { company_id: companyId, shift_key: 'siang', label: 'Siang', jam_masuk: 13, menit_masuk: 0, jam_pulang: 21, menit_pulang: 0, toleransi: 15 }
    ];
    await sb.from('shift_configs').insert(defaults).then(() => {});
}

/**
 * Simpan hasil verifikasi surat dokter ke Supabase (bukan hanya localStorage)
 */
async function sbVerifikasiSurat(logId, keputusan, catatan, verifikatorNama) {
    const { error } = await sb
        .from('attendance_logs')
        .update({
            status_verifikasi: keputusan,
            catatan_verifikasi: catatan || null,
            verifikator_nama: verifikatorNama || null,
            updated_at: new Date().toISOString()
        })
        .eq('id', logId);
    if (error) throw new Error('Gagal menyimpan verifikasi: ' + error.message);
}

// ============================================================
// UPLOAD SURAT DOKTER ke Supabase Storage
// ============================================================

async function sbUploadSuratDokter(file, companyId, userId) {
    const ext = file.name.split('.').pop();
    const path = `${companyId}/${userId}/${Date.now()}.${ext}`;

    const { error } = await sb.storage.from('surat-dokter').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error('Gagal upload surat: ' + error.message);

    const { data: urlData } = await sb.storage.from('surat-dokter').createSignedUrl(path, 3600);
    return { path, url: urlData?.signedUrl || null, name: file.name };
}

// ============================================================
// HELPER: Konversi data Supabase ke format app.js
// ============================================================

function sbLogToAppFormat(log) {
    return {
        id: log.id,
        userId: log.user_id,
        nama: log.nama || '',
        jabatan: log.jabatan || '',
        tglMasuk: log.tgl_masuk || null,
        shift: log.shift || 'pagi',
        status: log.status || 'Hadir',
        waktuMasuk: log.waktu_masuk || '-',
        waktuPulang: log.waktu_pulang || '-',
        tanggal: log.tanggal,
        tanggalSelesai: log.tanggal_selesai || null,
        jumlahHari: log.jumlah_hari || 1,
        kategoriIzin: log.kategori_izin || null,
        lokasi: log.lokasi_text || '',
        gpsLat: log.gps_lat,
        gpsLng: log.gps_lng,
        gpsAccuracy: log.gps_accuracy,
        jarakMeter: log.jarak_meter,
        kantorNama: log.kantor_nama,
        kantorId: log.kantor_id,
        statusVerifikasi: log.status_verifikasi,
        catatanVerifikasi: log.catatan_verifikasi || '',
        verifikatorNama: log.verifikator_nama || '',
        suratDokter: log.surat_url ? { name: log.surat_nama, url: log.surat_url, dataUrl: log.surat_url } : null,
    };
}

function sbProfileToCurrentUser(profile) {
    return {
        id: profile.id,
        employee_id: profile.employee_id,
        nama: profile.nama,
        jabatan: profile.jabatan,
        role: profile.role,
        email: profile.email,
        shift: profile.shift || 'pagi',
        jatahCuti: profile.jatah_cuti ?? 12,
        allowChangePassword: !!profile.allow_change_password,
        tglMasuk: profile.tgl_masuk,
        mustChangePassword: !!profile.must_change_password,
        company_id: profile.company_id,
        username: profile.email,
        must_change_password: !!profile.must_change_password,
    };
}
