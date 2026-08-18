-- ============================================================
-- SCHEMA LENGKAP - absensipro
-- Import file ini ke database if0_42669511_absensipro via phpMyAdmin
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- Tabel lokasi kantor
CREATE TABLE IF NOT EXISTS office_locations (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NULL,
    nama       VARCHAR(150) NOT NULL,
    alamat     TEXT,
    lat        DECIMAL(10,7) NOT NULL,
    lng        DECIMAL(10,7) NOT NULL,
    radius     INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_office_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel perusahaan (multi-tenant)
CREATE TABLE IF NOT EXISTS companies (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(30) NOT NULL UNIQUE,
    nama       VARCHAR(150) NOT NULL,
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel users
CREATE TABLE IF NOT EXISTS users (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    company_id           INT NULL,
    username             VARCHAR(50) NOT NULL,
    email                VARCHAR(150) NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    nama                 VARCHAR(150) NOT NULL,
    jabatan              VARCHAR(150) NULL,
    role                 ENUM('admin','hrd','karyawan') NOT NULL DEFAULT 'karyawan',
    is_active            TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_company_username UNIQUE (company_id, username),
    CONSTRAINT uq_users_company_email    UNIQUE (company_id, email),
    CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel log absensi
CREATE TABLE IF NOT EXISTS attendance_logs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    company_id       INT NULL,
    user_id          VARCHAR(50) NOT NULL,
    nama             VARCHAR(150) NOT NULL,
    jabatan          VARCHAR(150),
    tipe             ENUM('Masuk','Pulang') NOT NULL,
    tanggal          DATE NOT NULL,
    waktu            TIME NOT NULL,
    gps_lat          DECIMAL(10,7) NOT NULL,
    gps_lng          DECIMAL(10,7) NOT NULL,
    gps_accuracy     DECIMAL(10,2) NULL,
    jarak_meter      INT NULL,
    kantor_id        INT NULL,
    kantor_nama      VARCHAR(150) NULL,
    status_validasi  ENUM('Diterima','Ditolak') NOT NULL,
    alasan_tolak     VARCHAR(255) NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_kantor  FOREIGN KEY (kantor_id)  REFERENCES office_locations(id) ON DELETE SET NULL,
    INDEX idx_user_tanggal       (user_id, tanggal),
    INDEX idx_attendance_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel rate limiting login (anti brute-force)
CREATE TABLE IF NOT EXISTS login_attempts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    company_id  INT NULL,
    identifier  VARCHAR(150) NOT NULL,
    ip_address  VARCHAR(45)  NOT NULL,
    success     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier_time (identifier, created_at),
    INDEX idx_ip_time         (ip_address, created_at),
    INDEX idx_attempts_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Data awal: 1 perusahaan default
INSERT IGNORE INTO companies (code, nama) VALUES ('DEFAULT', 'Perusahaan Saya');
