<?php
// ================== ENDPOINT: SUBMIT ABSEN (VALIDASI GEOFENCING DI SERVER) ==================
// POST { user_id, nama, jabatan, tipe: "Masuk"|"Pulang", lat, lng, accuracy }
//
// Semua perhitungan jarak (Haversine) dan keputusan tolak/terima dilakukan DI SINI,
// di server -- bukan di JavaScript browser -- sehingga tidak bisa dimanipulasi dari
// sisi client. Setiap percobaan absen (diterima maupun ditolak) dicatat ke tabel
// attendance_logs sebagai jejak audit anti-kecurangan.

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/haversine.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);
}

$pdo   = getDB();
$input = readJsonBody();

$userId   = trim((string)($input['user_id'] ?? ''));
$nama     = trim((string)($input['nama'] ?? ''));
$jabatan  = trim((string)($input['jabatan'] ?? ''));
$tipe     = (string)($input['tipe'] ?? '');
$lat      = filter_var($input['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lng      = filter_var($input['lng'] ?? null, FILTER_VALIDATE_FLOAT);
$accuracy = array_key_exists('accuracy', $input) && $input['accuracy'] !== null
    ? filter_var($input['accuracy'], FILTER_VALIDATE_FLOAT)
    : null;

// ================== 1. VALIDASI INPUT DASAR ==================
if ($userId === '' || $nama === '') {
    jsonResponse(['success' => false, 'message' => 'Data user tidak lengkap.'], 422);
}
if (!in_array($tipe, ['Masuk', 'Pulang'], true)) {
    jsonResponse(['success' => false, 'message' => 'Tipe absen tidak valid.'], 422);
}
if ($lat === false || $lat === null || $lat < -90 || $lat > 90) {
    jsonResponse(['success' => false, 'message' => 'Koordinat latitude tidak valid.'], 422);
}
if ($lng === false || $lng === null || $lng < -180 || $lng > 180) {
    jsonResponse(['success' => false, 'message' => 'Koordinat longitude tidak valid.'], 422);
}
if ($accuracy === false) {
    jsonResponse(['success' => false, 'message' => 'Nilai akurasi GPS tidak valid.'], 422);
}

// ================== 2. EDGE CASE: AKURASI LEMAH / FAKE GPS ==================
// Catatan jujur: Web Geolocation API tidak punya flag resmi "ini lokasi palsu".
// Ini heuristik (sinyal tambahan), bukan deteksi 100% pasti.
$GPS_ACCURACY_THRESHOLD_METER = 75;

if ($accuracy !== null && $accuracy <= 0) {
    catatPercobaanDitolak($pdo, $userId, $nama, $jabatan, $tipe, $lat, $lng, $accuracy, null, null, null,
        'Terindikasi Fake GPS/Mock Location (akurasi tidak wajar).');
    jsonResponse(['success' => false, 'message' => 'Terindikasi Fake GPS/Mock Location (akurasi tidak wajar). Absen ditolak.'], 403);
}

if ($accuracy !== null && $accuracy > $GPS_ACCURACY_THRESHOLD_METER) {
    catatPercobaanDitolak($pdo, $userId, $nama, $jabatan, $tipe, $lat, $lng, $accuracy, null, null, null,
        "Akurasi GPS terlalu rendah (±{$accuracy}m).");
    jsonResponse([
        'success' => false,
        'message' => "Akurasi GPS terlalu rendah (±{$accuracy}m, maksimal ±{$GPS_ACCURACY_THRESHOLD_METER}m). Pindah ke area terbuka / aktifkan mode akurasi tinggi lalu coba lagi.",
    ], 403);
}

// ================== 3. GEOFENCING: HAVERSINE DI SERVER ==================
$nearest        = findNearestOffice($pdo, $lat, $lng);
$statusValidasi = 'Diterima';
$alasanTolak    = null;
$kantorId       = null;
$kantorNama     = null;
$jarak          = null;

if ($nearest !== null) {
    $jarak      = $nearest['distance'];
    $kantorId   = $nearest['office']['id'];
    $kantorNama = $nearest['office']['nama'];
    if (!$nearest['valid']) {
        $statusValidasi = 'Ditolak';
        $alasanTolak = "Di luar radius kantor. Jarak Anda sekitar {$jarak} meter dari {$kantorNama} (maksimal {$nearest['office']['radius']} meter).";
    }
}
// Kalau belum ada satupun kantor terdaftar di database -> tidak ada validasi jarak
// (backward compatible, sama seperti sebelum fitur multi-kantor ditambahkan).

// ================== 4. SIMPAN JEJAK AUDIT (DITERIMA MAUPUN DITOLAK) ==================
$now     = new DateTime();
$tanggal = $now->format('Y-m-d');
$waktu   = $now->format('H:i:s');

$stmt = $pdo->prepare('INSERT INTO attendance_logs
    (user_id, nama, jabatan, tipe, tanggal, waktu, gps_lat, gps_lng, gps_accuracy, jarak_meter, kantor_id, kantor_nama, status_validasi, alasan_tolak)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$stmt->execute([
    $userId, $nama, $jabatan, $tipe, $tanggal, $waktu,
    $lat, $lng, $accuracy, $jarak, $kantorId, $kantorNama,
    $statusValidasi, $alasanTolak,
]);

// ================== 5. RESPON ==================
if ($statusValidasi === 'Ditolak') {
    jsonResponse([
        'success' => false,
        'message' => $alasanTolak,
        'jarak'   => $jarak,
        'kantor'  => $kantorNama,
    ], 403);
}

jsonResponse([
    'success' => true,
    'message' => "Absen {$tipe} berhasil divalidasi pukul {$waktu}.",
    'data'    => [
        'tanggal' => $tanggal,
        'waktu'   => $waktu,
        'jarak'   => $jarak,
        'kantor'  => $kantorNama,
    ],
]);

// ================== HELPER: catat percobaan yang ditolak di tahap awal (akurasi/fake gps) ==================
function catatPercobaanDitolak(PDO $pdo, string $userId, string $nama, string $jabatan, string $tipe,
    float $lat, float $lng, ?float $accuracy, ?int $jarak, ?int $kantorId, ?string $kantorNama, string $alasan): void {
    $now = new DateTime();
    $stmt = $pdo->prepare('INSERT INTO attendance_logs
        (user_id, nama, jabatan, tipe, tanggal, waktu, gps_lat, gps_lng, gps_accuracy, jarak_meter, kantor_id, kantor_nama, status_validasi, alasan_tolak)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $userId, $nama, $jabatan, $tipe, $now->format('Y-m-d'), $now->format('H:i:s'),
        $lat, $lng, $accuracy, $jarak, $kantorId, $kantorNama, 'Ditolak', $alasan,
    ]);
}