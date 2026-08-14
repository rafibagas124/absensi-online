-- ============================================================
-- PATCH KEAMANAN: jalankan file ini SETELAH schema.sql lama.
-- Menambahkan: tabel users (password ter-hash) + login_attempts
-- (rate limiting) — mendekatkan ke ISO/IEC 27001 Annex A.9
-- (Access Control) & A.12 (Operations Security / logging).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,      -- HASIL password_hash(), JANGAN simpan plaintext
    nama          VARCHAR(150) NOT NULL,
    role          ENUM('admin','hrd','karyawan') NOT NULL DEFAULT 'karyawan',
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rate limiting percobaan login (anti brute-force) — Annex A.9.4
CREATE TABLE IF NOT EXISTS login_attempts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    identifier  VARCHAR(150) NOT NULL,   -- email/username yang dicoba
    ip_address  VARCHAR(45) NOT NULL,
    success     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier_time (identifier, created_at),
    INDEX idx_ip_time (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contoh insert akun awal — GANTI PASSWORD SEBELUM PRODUCTION.
-- Hash di bawah ini untuk password "123456" HANYA untuk contoh/testing lokal.
-- Buat hash baru di PHP dengan: password_hash('password_baru', PASSWORD_DEFAULT)
-- INSERT INTO users (username, email, password_hash, nama, role) VALUES
-- ('admin', 'admin@test.com', '$2y$10$REPLACE_WITH_REAL_HASH', 'Administrator', 'admin');