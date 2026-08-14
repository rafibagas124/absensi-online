<?php
// ================== ENDPOINT: AUTENTIKASI SERVER-SIDE ==================
// Menggantikan login "hardcoded di frontend" dengan sesi PHP asli +
// password_hash/password_verify. Wajib jalan di atas HTTPS (production).
//
// POST /auth.php?action=login   { email/username, password }
// POST /auth.php?action=logout
// GET  /auth.php?action=me      -> data user yang sedang login (dari sesi)

require_once __DIR__ . '/config.php'; // pastikan config.php sudah include session_start() (lihat patch di bawah)

$action = $_GET['action'] ?? '';

const MAX_ATTEMPTS       = 5;   // percobaan gagal
const ATTEMPT_WINDOW_MIN = 15;  // dalam X menit terakhir

function clientIp(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function tooManyAttempts(PDO $pdo, string $identifier): bool {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS c FROM login_attempts
         WHERE (identifier = ? OR ip_address = ?)
           AND success = 0
           AND created_at >= (NOW() - INTERVAL ? MINUTE)'
    );
    $stmt->execute([$identifier, clientIp(), ATTEMPT_WINDOW_MIN]);
    return (int)$stmt->fetch()['c'] >= MAX_ATTEMPTS;
}

function recordAttempt(PDO $pdo, string $identifier, bool $success): void {
    $stmt = $pdo->prepare('INSERT INTO login_attempts (identifier, ip_address, success) VALUES (?, ?, ?)');
    $stmt->execute([$identifier, clientIp(), $success ? 1 : 0]);
}

if ($action === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);
    }

    $input      = readJsonBody();
    $identifier = trim((string)($input['email'] ?? $input['username'] ?? ''));
    $password   = (string)($input['password'] ?? '');

    if ($identifier === '' || $password === '') {
        jsonResponse(['success' => false, 'message' => 'Email/username dan password wajib diisi.'], 422);
    }

    $pdo = getDB();

    if (tooManyAttempts($pdo, $identifier)) {
        jsonResponse(['success' => false, 'message' => 'Terlalu banyak percobaan gagal. Coba lagi dalam ' . ATTEMPT_WINDOW_MIN . ' menit.'], 429);
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1 LIMIT 1');
    $stmt->execute([$identifier, $identifier]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordAttempt($pdo, $identifier, false);
        // Pesan sengaja digeneralisasi (jangan bocorkan "user tidak ada" vs "password salah")
        jsonResponse(['success' => false, 'message' => 'Email/username atau password salah.'], 401);
    }

    recordAttempt($pdo, $identifier, true);

    // Regenerasi session ID setiap login sukses -> cegah session fixation
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['role']    = $user['role'];
    $_SESSION['nama']    = $user['nama'];

    jsonResponse([
        'success' => true,
        'data' => [
            'id'    => (int)$user['id'],
            'nama'  => $user['nama'],
            'email' => $user['email'],
            'role'  => $user['role'],
            'must_change_password' => (bool)$user['must_change_password'],
        ],
    ]);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    jsonResponse(['success' => true, 'message' => 'Berhasil logout.']);
}

if ($action === 'me') {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'message' => 'Belum login.'], 401);
    }
    jsonResponse(['success' => true, 'data' => [
        'id'   => $_SESSION['user_id'],
        'nama' => $_SESSION['nama'],
        'role' => $_SESSION['role'],
    ]]);
}

jsonResponse(['success' => false, 'message' => 'Action tidak dikenali.'], 400);