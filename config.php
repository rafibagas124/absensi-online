<?php
// ================== LOAD .env FILE (jika tidak ada dotenv library) ==================
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (strpos($line, '=') !== false) {
            [$key, $value] = explode('=', $line, 2);
            $key   = trim($key);
            $value = trim($value);
            // Hapus tanda kutip jika ada
            $value = trim($value, '"\'');
            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
}

// ================== KONFIGURASI DATABASE ==================
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'absensipro');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');

// ================== KONFIGURASI RESEND (PENGIRIM EMAIL OTP) ==================
// PENTING: key ini SECRET — jangan pernah taruh di app.js/frontend.
// Kelola/rotate API Key di https://resend.com/api-keys
//
// ⚠️  BATASAN MODE TESTING RESEND:
//     Selama memakai "onboarding@resend.dev" sebagai pengirim (RESEND_FROM),
//     email OTP HANYA bisa dikirim ke alamat email pemilik akun Resend itu sendiri.
//     Untuk bisa kirim ke email siapapun, daftarkan & verifikasi domain kamu di:
//     https://resend.com/domains  → lalu ganti RESEND_FROM ke email domainmu.
define('RESEND_API_KEY', getenv('RESEND_API_KEY') ?: '');
define('RESEND_FROM',    getenv('RESEND_FROM')    ?: 'Absensi App <onboarding@resend.dev>');

// ================== KONFIGURASI DOMAIN FRONTEND (WAJIB DIISI) ==================
// Ganti dengan domain frontend production kamu. Untuk dev lokal boleh lebih dari satu.
$ALLOWED_ORIGINS = [
    'https://your-frontend-domain.com',
    'http://localhost:3000',
];

// ================== SESSION AMAN (dipakai auth.php) ==================
ini_set('session.cookie_httponly', '1');   // JS tidak bisa baca cookie sesi (anti XSS token theft)
ini_set('session.cookie_samesite', 'Lax'); // mitigasi CSRF dasar
ini_set('session.use_strict_mode', '1');
if (!empty($_SERVER['HTTPS'])) {
    ini_set('session.cookie_secure', '1'); // cookie hanya lewat HTTPS di production
}
session_start();

// ================== HEADER CORS (DIBATASI, BUKAN '*') ==================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true'); // wajib true agar cookie sesi ikut terkirim
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// ================== SECURITY HEADERS DASAR (Annex A.13/A.14) ==================
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(self), camera=(self)');
if (!empty($_SERVER['HTTPS'])) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function jsonResponse($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        } catch (PDOException $e) {
            error_log('DB connection failed: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Koneksi database gagal. Hubungi administrator.'], 500);
        }
    }
    return $pdo;
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ================== GERBANG OTORISASI (Annex A.9) ==================
// Panggil di baris paling atas endpoint yang butuh login, contoh:
//   requireAuth();          -> wajib login (role apa saja)
//   requireAuth(['admin']); -> wajib login DAN role-nya admin
function requireAuth(array $allowedRoles = []): void {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'message' => 'Anda belum login.'], 401);
    }
    if ($allowedRoles && !in_array($_SESSION['role'], $allowedRoles, true)) {
        jsonResponse(['success' => false, 'message' => 'Anda tidak punya akses untuk aksi ini.'], 403);
    }
}