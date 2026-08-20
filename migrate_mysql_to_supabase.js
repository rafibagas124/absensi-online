/**
 * SCRIPT MIGRASI DATA MYSQL → SUPABASE
 * =====================================
 * Cara pakai:
 * 1. Export data MySQL Anda ke JSON (lihat petunjuk di bawah)
 * 2. Buka file index.html di browser
 * 3. Buka DevTools → Console
 * 4. Paste isi file ini ke console
 * 5. Panggil fungsi migrasi yang sesuai
 *
 * EXPORT MYSQL ke JSON:
 * Jalankan query ini di phpMyAdmin / MySQL CLI:
 *
 * -- Export companies:
 * SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'code',code,'nama',nama,'is_active',is_active)) FROM companies;
 *
 * -- Export users (tanpa password_hash):
 * SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'company_id',company_id,'username',username,'email',email,'nama',nama,'jabatan',jabatan,'role',role,'is_active',is_active,'must_change_password',must_change_password)) FROM users;
 *
 * -- Export office_locations:
 * SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'company_id',company_id,'nama',nama,'alamat',alamat,'lat',lat,'lng',lng,'radius',radius)) FROM office_locations;
 *
 * -- Export attendance_logs:
 * SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'company_id',company_id,'user_id',user_id,'nama',nama,'jabatan',jabatan,'tipe',tipe,'tanggal',tanggal,'waktu',waktu,'gps_lat',gps_lat,'gps_lng',gps_lng,'gps_accuracy',gps_accuracy,'jarak_meter',jarak_meter,'kantor_nama',kantor_nama,'status_validasi',status_validasi,'alasan_tolak',alasan_tolak)) FROM attendance_logs;
 */

// ===== CONTOH DATA LAMA (ganti dengan data export MySQL Anda) =====

// 1. Migrasi companies (perusahaan)
// Jalankan ini PERTAMA sebelum migrasi user atau log
async function migrasiCompanies(companiesJson) {
    console.log('[Migrasi] Mulai migrasi companies...');
    const results = [];
    for (const c of companiesJson) {
        const { data, error } = await sb.from('companies')
            .upsert({
                code: c.code.toUpperCase(),
                nama: c.nama,
                is_active: !!c.is_active
            }, { onConflict: 'code' })
            .select('id, code');
        if (error) {
            console.error('[Migrasi] Error company', c.code, ':', error.message);
        } else {
            console.log('[Migrasi] Company OK:', c.code, '→ ID:', data[0]?.id);
            results.push({ old_id: c.id, new_id: data[0]?.id, code: c.code });
        }
    }
    console.log('[Migrasi] Companies selesai:', results.length, 'item');
    return results; // simpan ini untuk mapping user migrasi
}

// 2. Migrasi office_locations
// companyIdMap: { old_company_id: new_supabase_company_id }
async function migrasiOfficeLocations(officesJson, companyIdMap) {
    console.log('[Migrasi] Mulai migrasi office_locations...');
    let ok = 0, err = 0;
    for (const o of officesJson) {
        const newCompanyId = companyIdMap[o.company_id];
        if (!newCompanyId) { console.warn('[Migrasi] Company ID', o.company_id, 'tidak ditemukan di map'); err++; continue; }
        const { error } = await sb.from('office_locations').insert({
            company_id: newCompanyId,
            nama: o.nama,
            alamat: o.alamat,
            lat: parseFloat(o.lat),
            lng: parseFloat(o.lng),
            radius: parseInt(o.radius, 10)
        });
        if (error) { console.error('[Migrasi] Error office', o.nama, ':', error.message); err++; }
        else { ok++; }
    }
    console.log(`[Migrasi] Office locations selesai: ${ok} berhasil, ${err} gagal`);
}

// 3. Migrasi attendance_logs (data historis)
// CATATAN: Ini migrasi data log LAMA (sebelum Supabase).
// user_id di log lama adalah VARCHAR (bukan UUID Supabase).
// Kita simpan di kolom employee_id dan user_id menggunakan UUID dummy
// companyIdMap: { old_company_id: new_supabase_company_id }
// userIdMap: { old_user_id_string: supabase_uuid } (hasil register ulang user)
async function migrasiAttendanceLogs(logsJson, companyIdMap, userIdMap) {
    console.log('[Migrasi] Mulai migrasi attendance_logs...');
    let ok = 0, err = 0;

    // Batch insert per 50 baris untuk kecepatan
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < logsJson.length; i += batchSize) {
        batches.push(logsJson.slice(i, i + batchSize));
    }

    for (const batch of batches) {
        const rows = batch.map(l => {
            const newCompanyId = companyIdMap[l.company_id];
            const newUserId = userIdMap && userIdMap[l.user_id] ? userIdMap[l.user_id] : null;
            if (!newCompanyId) return null;
            return {
                company_id: newCompanyId,
                user_id: newUserId, // null jika tidak ada mapping (log lama tanpa UUID)
                employee_id: String(l.user_id), // simpan ID lama
                nama: l.nama || '',
                jabatan: l.jabatan || '',
                tipe: l.tipe || null,
                status: l.status_validasi === 'Diterima' ? 'Hadir' : 'Hadir', // mapping dari status lama
                tanggal: l.tanggal,
                waktu_masuk: l.tipe === 'Masuk' ? l.waktu : null,
                waktu_pulang: l.tipe === 'Pulang' ? l.waktu : null,
                gps_lat: l.gps_lat ? parseFloat(l.gps_lat) : null,
                gps_lng: l.gps_lng ? parseFloat(l.gps_lng) : null,
                gps_accuracy: l.gps_accuracy ? parseFloat(l.gps_accuracy) : null,
                jarak_meter: l.jarak_meter ? parseInt(l.jarak_meter, 10) : null,
                kantor_nama: l.kantor_nama,
                status_validasi: l.status_validasi || 'Diterima',
                alasan_tolak: l.alasan_tolak
            };
        }).filter(Boolean);

        if (rows.length === 0) continue;

        const { error } = await sb.from('attendance_logs').insert(rows);
        if (error) { console.error('[Migrasi] Error batch log:', error.message); err += rows.length; }
        else { ok += rows.length; }
    }
    console.log(`[Migrasi] Attendance logs selesai: ${ok} berhasil, ${err} gagal`);
}

// ===== CARA PAKAI =====
/*
// 1. Copy JSON dari phpMyAdmin ke sini:
const companiesData = [
    { id: 1, code: "DEFAULT", nama: "Perusahaan Saya", is_active: 1 }
];

const officesData = [
    { id: 1, company_id: 1, nama: "Kantor Pusat", alamat: "Jl. Test 1", lat: "-6.2", lng: "106.8", radius: 100 }
];

const logsData = [
    // ... data dari MySQL ...
];

// 2. Jalankan migrasi companies dulu:
const companyResults = await migrasiCompanies(companiesData);

// 3. Buat mapping ID lama → ID baru:
const companyIdMap = {};
companyResults.forEach(r => { companyIdMap[r.old_id] = r.new_id; });
console.log('Company ID Map:', companyIdMap);

// 4. Migrasi office locations:
await migrasiOfficeLocations(officesData, companyIdMap);

// 5. Migrasi attendance logs (user ID lama tidak otomatis terhubung ke UUID Supabase):
await migrasiAttendanceLogs(logsData, companyIdMap, {});

console.log('Migrasi selesai!');
*/
