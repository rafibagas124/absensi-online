<?php
// ================== ENDPOINT: MANAJEMEN LOKASI KANTOR/CABANG (ADMIN) ==================
// GET    -> daftar semua kantor
// POST   -> tambah kantor baru      { nama, alamat, lat, lng, radius }
// PUT    -> update kantor           { id, nama, alamat, lat, lng, radius }
// DELETE -> hapus kantor            { id }  (bisa juga ?id=..)
//
// CATATAN KEAMANAN: endpoint ini sebaiknya dilindungi otentikasi/session admin
// sebelum dipakai di production (lihat catatan di README backend).

require_once __DIR__ . '/config.php';

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

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
    $stmt = $pdo->query('SELECT id, nama, alamat, lat, lng, radius FROM office_locations ORDER BY nama ASC');
    jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
    $input = readJsonBody();
    [$errors, $nama, $alamat, $lat, $lng, $radius] = validateOfficePayload($input);
    if ($errors) jsonResponse(['success' => false, 'message' => implode(' ', $errors)], 422);

    $stmt = $pdo->prepare('INSERT INTO office_locations (nama, alamat, lat, lng, radius) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$nama, $alamat, $lat, $lng, $radius]);

    jsonResponse([
        'success' => true,
        'message' => "Kantor \"$nama\" berhasil ditambahkan.",
        'data'    => ['id' => (int)$pdo->lastInsertId(), 'nama' => $nama, 'alamat' => $alamat, 'lat' => $lat, 'lng' => $lng, 'radius' => $radius],
    ], 201);
}

if ($method === 'PUT') {
    $input = readJsonBody();
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID kantor tidak valid.'], 422);

    [$errors, $nama, $alamat, $lat, $lng, $radius] = validateOfficePayload($input);
    if ($errors) jsonResponse(['success' => false, 'message' => implode(' ', $errors)], 422);

    $stmt = $pdo->prepare('UPDATE office_locations SET nama=?, alamat=?, lat=?, lng=?, radius=? WHERE id=?');
    $stmt->execute([$nama, $alamat, $lat, $lng, $radius, $id]);

    if ($stmt->rowCount() === 0) {
        // Bisa jadi ID tidak ketemu, ATAU datanya memang identik dengan sebelumnya — cek dulu.
        $check = $pdo->prepare('SELECT id FROM office_locations WHERE id=?');
        $check->execute([$id]);
        if (!$check->fetch()) jsonResponse(['success' => false, 'message' => 'Kantor tidak ditemukan.'], 404);
    }

    jsonResponse(['success' => true, 'message' => "Kantor \"$nama\" berhasil diperbarui."]);
}

if ($method === 'DELETE') {
    $input = readJsonBody();
    $id = filter_var($input['id'] ?? ($_GET['id'] ?? null), FILTER_VALIDATE_INT);
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID kantor tidak valid.'], 422);

    $stmt = $pdo->prepare('SELECT nama FROM office_locations WHERE id=?');
    $stmt->execute([$id]);
    $office = $stmt->fetch();
    if (!$office) jsonResponse(['success' => false, 'message' => 'Kantor tidak ditemukan.'], 404);

    $del = $pdo->prepare('DELETE FROM office_locations WHERE id=?');
    $del->execute([$id]);

    jsonResponse(['success' => true, 'message' => "Kantor \"{$office['nama']}\" berhasil dihapus."]);
}

jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);