<?php
// ================== KONFIGURASI DATABASE ==================
// Sesuaikan 4 baris di bawah ini dengan kredensial database MySQL Anda.
define('DB_HOST', 'localhost');
define('DB_NAME', 'absensipro');
define('DB_USER', 'root');
define('DB_PASS', '');

// ================== HEADER CORS & JSON ==================
// Kalau frontend dan backend PHP di-host di domain berbeda, sesuaikan
// 'Access-Control-Allow-Origin' dengan domain frontend Anda (bukan '*')
// supaya lebih aman.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

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
            // Jangan bocorkan detail koneksi ke response, cukup log di server.
            error_log('DB connection failed: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => 'Koneksi database gagal. Hubungi administrator.'], 500);
        }
    }
    return $pdo;
}

// Baca body JSON dari request (dipakai oleh POST/PUT/DELETE)
function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}