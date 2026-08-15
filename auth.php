<?php
// ================== ENDPOINT: AUTENTIKASI SERVER-SIDE (MULTI-TENANT) ==================
// Menggantikan login "hardcoded di frontend/localStorage" dengan sesi PHP asli +
// password_hash/password_verify. Wajib jalan di atas HTTPS (production).
//
// Setiap akun WAJIB terikat ke 1 perusahaan (companies.id / company_id) supaya
// data antar perusahaan tidak pernah tercampur. Login butuh "kode_perusahaan"
// selain email/username, karena email/username sekarang hanya unik DI DALAM
// 1 perusahaan (lihat "Schema multi-tenant patch.sql").
//
// POST /auth.php?action=register  { kode_perusahaan, nama_perusahaan, nama, email, username, password }
// POST /auth.php?action=login     { kode_perusahaan, email/username, password }
// POST /auth.php?action=logout
// GET  /auth.php?action=me        -> data user + perusahaan yang sedang login (dari sesi)

require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

const MAX_ATTEMPTS       = 5;   // percobaan gagal
const ATTEMPT_WINDOW_MIN = 15;  // dalam X menit terakhir

function clientIp(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function tooManyAttempts(PDO $pdo, ?int $companyId, string $identifier): bool {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS c FROM login_attempts
         WHERE (identifier = ? OR ip_address = ?)
           AND (company_id = ? OR company_id IS NULL)
           AND success = 0
           AND created_at >= (NOW() - INTERVAL ? MINUTE)'
    );
    $stmt->execute([$identifier, clientIp(), $companyId, ATTEMPT_WINDOW_MIN]);
    return (int)$stmt->fetch()['c'] >= MAX_ATTEMPTS;
}

function recordAttempt(PDO $pdo, ?int $companyId, string $identifier, bool $success): void {
    $stmt = $pdo->prepare('INSERT INTO login_attempts (company_id, identifier, ip_address, success) VALUES (?, ?, ?, ?)');
    $stmt->execute([$companyId, $identifier, clientIp(), $success ? 1 : 0]);
}

function normalizeCompanyCode(string $code): string {
    // Kode perusahaan disamakan huruf besar & dirapikan supaya "acme", "Acme", "ACME" dianggap sama.
    return strtoupper(trim($code));
}

// ================== REGISTER: BUAT PERUSAHAAN BARU + AKUN ADMIN PERTAMA ==================
if ($action === 'register') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);
    }

    $input          = readJsonBody();
    $companyCode    = normalizeCompanyCode((string)($input['kode_perusahaan'] ?? ''));
    $companyName    = trim((string)($input['nama_perusahaan'] ?? ''));
    $nama           = trim((string)($input['nama'] ?? ''));
    $email          = trim((string)($input['email'] ?? ''));
    $username       = trim((string)($input['username'] ?? $email));
    $password       = (string)($input['password'] ?? '');

    $errors = [];
    if ($companyCode === '' || !preg_match('/^[A-Z0-9\-]{3,30}$/', $companyCode)) {
        $errors[] = 'Kode perusahaan wajib diisi (3-30 karakter, huruf/angka/strip saja).';
    }
    if ($companyName === '') $errors[] = 'Nama perusahaan wajib diisi.';
    if ($nama === '') $errors[] = 'Nama akun admin wajib diisi.';
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Email tidak valid.';
    if ($username === '') $errors[] = 'Username wajib diisi.';
    if (strlen($password) < 8) $errors[] = 'Password minimal 8 karakter.';
    if ($errors) jsonResponse(['success' => false, 'message' => implode(' ', $errors)], 422);

    $pdo = getDB();

    // Kode perusahaan itu sendiri WAJIB unik secara global (dia yang membedakan tenant satu vs lainnya).
    $check = $pdo->prepare('SELECT id FROM companies WHERE code = ? LIMIT 1');
    $check->execute([$companyCode]);
    if ($check->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Kode perusahaan sudah dipakai, silakan pilih kode lain.'], 409);
    }

    try {
        $pdo->beginTransaction();

        $insCompany = $pdo->prepare('INSERT INTO companies (code, nama) VALUES (?, ?)');
        $insCompany->execute([$companyCode, $companyName]);
        $companyId = (int)$pdo->lastInsertId();

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $insUser = $pdo->prepare(
            'INSERT INTO users (company_id, username, email, password_hash, nama, jabatan, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, "admin", 1, 0)'
        );
        $insUser->execute([$companyId, $username, $email, $hash, $nama, 'System Admin']);

        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        // Duplicate entry (username/email sudah dipakai DI PERUSAHAAN INI -- jarang terjadi karena baru dibuat,
        // tapi dijaga untuk kasus race condition).
        if ((int)$e->errorInfo[1] === 1062) {
            jsonResponse(['success' => false, 'message' => 'Username/email tersebut sudah terdaftar.'], 409);
        }
        error_log('Register failed: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Pendaftaran gagal. Coba lagi nanti.'], 500);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Perusahaan & akun admin berhasil dibuat. Silakan login.',
        'data'    => ['kode_perusahaan' => $companyCode],
    ], 201);
}

// ================== LOGIN ==================
if ($action === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method tidak didukung.'], 405);
    }

    $input          = readJsonBody();
    $companyCode    = normalizeCompanyCode((string)($input['kode_perusahaan'] ?? ''));
    $identifier     = trim((string)($input['email'] ?? $input['username'] ?? ''));
    $password       = (string)($input['password'] ?? '');

    if ($companyCode === '' || $identifier === '' || $password === '') {
        jsonResponse(['success' => false, 'message' => 'Kode perusahaan, email/username, dan password wajib diisi.'], 422);
    }

    $pdo = getDB();

    // Resolusi perusahaan dulu dari kode. Kalau kode salah, pesan tetap digeneralisasi
    // (jangan bocorkan apakah kode perusahaan itu ada atau tidak).
    $companyStmt = $pdo->prepare('SELECT id FROM companies WHERE code = ? AND is_active = 1 LIMIT 1');
    $companyStmt->execute([$companyCode]);
    $company = $companyStmt->fetch();
    $companyId = $company ? (int)$company['id'] : null;

    if (tooManyAttempts($pdo, $companyId, $identifier)) {
        jsonResponse(['success' => false, 'message' => 'Terlalu banyak percobaan gagal. Coba lagi dalam ' . ATTEMPT_WINDOW_MIN . ' menit.'], 429);
    }

    $user = null;
    if ($companyId !== null) {
        $stmt = $pdo->prepare(
            'SELECT * FROM users WHERE company_id = ? AND (username = ? OR email = ?) AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$companyId, $identifier, $identifier]);
        $user = $stmt->fetch();
    }

    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordAttempt($pdo, $companyId, $identifier, false);
        // Pesan sengaja digeneralisasi (jangan bocorkan "kode perusahaan salah" vs "user tidak ada" vs "password salah")
        jsonResponse(['success' => false, 'message' => 'Kode perusahaan, email/username, atau password salah.'], 401);
    }

    recordAttempt($pdo, $companyId, $identifier, true);

    // Regenerasi session ID setiap login sukses -> cegah session fixation
    session_regenerate_id(true);
    $_SESSION['user_id']    = (int)$user['id'];
    $_SESSION['company_id'] = (int)$user['company_id'];
    $_SESSION['role']       = $user['role'];
    $_SESSION['nama']       = $user['nama'];

    jsonResponse([
        'success' => true,
        'data' => [
            'id'      => (int)$user['id'],
            'nama'    => $user['nama'],
            'jabatan' => $user['jabatan'],
            'username'=> $user['username'],
            'email'   => $user['email'],
            'role'    => $user['role'],
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
    $pdo = getDB();
    $stmt = $pdo->prepare('SELECT id, username, email, nama, jabatan, role, must_change_password FROM users WHERE id = ? AND company_id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$_SESSION['user_id'], $_SESSION['company_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'Sesi tidak valid, silakan login ulang.'], 401);
    }
    jsonResponse(['success' => true, 'data' => [
        'id'         => (int)$user['id'],
        'company_id' => (int)$_SESSION['company_id'],
        'username'   => $user['username'],
        'email'      => $user['email'],
        'nama'       => $user['nama'],
        'jabatan'    => $user['jabatan'],
        'role'       => $user['role'],
        'must_change_password' => (bool)$user['must_change_password'],
    ]]);
}

jsonResponse(['success' => false, 'message' => 'Action tidak dikenali.'], 400);