<?php
// ================== ENDPOINT: MANAJEMEN LOKASI KANTOR/CABANG (MULTI-TENANT) ==================
// GET    -> daftar kantor MILIK PERUSAHAAN YANG SEDANG LOGIN saja
// POST   -> tambah kantor baru (admin)      { nama, alamat, lat, lng, radius }
// PUT    -> update kantor (admin)           { id, nama, alamat, lat, lng, radius }
// DELETE -> hapus kantor (admin)            { id }  (bisa juga ?id=..)
//
// Semua operasi wajib login (requireAuth) dan company_id SELALU diambil dari
// session (currentCompanyId()), tidak pernah dari input client -- supaya
// perusahaan A tidak bisa membaca/mengubah/menghapus data kantor milik
// perusahaan B walau tahu/tebak ID barisnya.

require_once __DIR__ . '/config.php';

requireAuth(); // wajib login untuk lihat daftar kantor
$pdo       = getDB();
$companyId = currentCompanyId();
$method    = $_SERVER['REQUEST_METHOD'];

function validateOfficePayload(array $input): array {
    $errors = [];
    $nama   = trim((string)($input['nama'] ?? ''));
    $alamat = trim((string)($input['alamat'] ?? ''));
    $lat    = filter_var($input['lat'] ?? null, FILTER_VALIDATE_FLOAT);
    $lng    = filter_var($input['lng'] ?? null, FILTER_VALIDATE_FLOAT);
    $radius = filter_var($input['radius'] ?? null, FILTER_VALIDATE_INT);

    if ($nama === '') $errors[] = 'Nama kantor/cabang wajib diisi.';
    if ($lat === false || $lat === null || $lat < -90 || $lat > 90) $errors[] = 'Latitude tidak valid (harus -90 s/d 90).';
    if ($lng === false || $lng === null || $lng < -180 || $lng > 180) $errors[] = 'Longitude tidak valid (harus -180 s/d 180).';
    if ($radius === false || $radius === null || $radius < 10) $errors[] = 'Radius maksimal absen minimal 10 meter.';

    return [$errors, $nama, $alamat, $lat, $lng, $radius];
}

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, nama, alamat, lat, lng, radius FROM office_locations WHERE company_id = ? ORDER BY nama ASC');
    $stmt->execute([$companyId]);
    jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
    requireAuth(['admin', 'hrd']); // hanya admin/hrd yang boleh tambah kantor
    $input = readJsonBody();
    [$errors, $nama, $alamat, $lat, $lng, $radius] = validateOfficePayload($input);
    if ($errors) jsonResponse(['success' => false, 'message' => implode(' ', $errors)], 422);

    $stmt = $pdo->prepare('INSERT INTO office_locations (company_id, nama, alamat, lat, lng, radius) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$companyId, $nama, $alamat, $lat, $lng, $radius]);

    jsonResponse([
        'success' => true,
        'message' => "Kantor \"$nama\" berhasil ditambahkan.",
        'data'    => ['id' => (int)$pdo->lastInsertId(), 'nama' => $nama, 'alamat' => $alamat, 'lat' => $lat, 'lng' => $lng, 'radius' => $radius],
    ], 201);
}

if ($method === 'PUT') {
    requireAuth(['admin', 'hrd']);
    $input = readJsonBody();
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID kantor tidak valid.'], 422);

    [$errors, $nama, $alamat, $lat, $lng, $radius] = validateOfficePayload($input);
    if ($errors) jsonResponse(['success' => false, 'message' => implode(' ', $errors)], 422);

    // WHERE company_id=? memastikan admin Perusahaan A tidak bisa update baris
    // kantor milik Perusahaan B walau ID-nya ditebak/dikirim manual.
    $stmt = $pdo->prepare('UPDATE office_locations SET nama=?, alamat=?, lat=?, lng=?, radius=? WHERE id=? AND company_id=?');
    $stmt->execute([$nama, $alamat, $lat, $lng, $radius, $id, $companyId]);

    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT id FROM office_locations WHERE id=? AND company_id=?');
        $check->execute([$id, $companyId]);
        if (!$check->fetch()) jsonResponse(['success' => false, 'message' => 'Kantor tidak ditemukan.'], 404);
    }

    jsonResponse(['success' => true, 'message' => "Kantor \"$nama\" berhasil diperbarui."]);
}

if ($method === 'DELETE') {
    requireAuth(['admin', 'hrd']);
    $input = readJsonBody();
    $id = filter_var($input['id'] ?? ($_GET['id'] ?? null), FILTER_VALIDATE_INT);
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID kantor tidak valid.'], 422);

    $stmt = $pdo->prepare('SELECT nama FROM office_locations WHERE id=? AND company_id=?');
    $stmt->execute([$id, $companyId]);
    $office = $stmt->fetch();
    if (!$office) jsonResponse(['success' => false, 'message' => 'Kantor tidak ditemukan.'], 404);

    $del = $pdo->prepare('DELETE FROM office_locations WHERE id=? AND company_id=?');
    $del->execute([$id, $companyId]);

    jsonResponse(['success' => true, 'message' => "Kantor \"{$office['nama']}\" berhasil dihapus."]);
}

jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);