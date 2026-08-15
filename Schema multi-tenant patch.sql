-- ============================================================
-- PATCH MULTI-TENANT: jalankan SETELAH schema.sql + Schema security patch.sql
-- Tujuan: 1 aplikasi bisa dipakai banyak perusahaan tanpa data saling bocor.
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(30) NOT NULL UNIQUE,
    nama       VARCHAR(150) NOT NULL,
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
    ADD COLUMN company_id INT NULL AFTER id,
    ADD COLUMN jabatan VARCHAR(150) NULL AFTER nama;

-- Kalau perintah di bawah error "key tidak ada", cek dulu nama constraint
-- aslinya dengan: SHOW CREATE TABLE users;
ALTER TABLE users DROP INDEX username;
ALTER TABLE users DROP INDEX email;

ALTER TABLE users
    ADD CONSTRAINT uq_users_company_username UNIQUE (company_id, username),
    ADD CONSTRAINT uq_users_company_email UNIQUE (company_id, email),
    ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE office_locations
    ADD COLUMN company_id INT NULL AFTER id,
    ADD CONSTRAINT fk_office_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    ADD INDEX idx_office_company (company_id);

ALTER TABLE attendance_logs
    ADD COLUMN company_id INT NULL AFTER id,
    ADD CONSTRAINT fk_attendance_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    ADD INDEX idx_attendance_company (company_id);

ALTER TABLE login_attempts
    ADD COLUMN company_id INT NULL AFTER id,
    ADD INDEX idx_attempts_company (company_id);

-- ============================================================
-- CATATAN MIGRASI DATA LAMA (kalau sudah ada data 1 perusahaan dengan
-- company_id masih NULL): buat 1 baris company, isi company_id yang NULL.
--
-- INSERT INTO companies (code, nama) VALUES ('DEFAULT', 'Perusahaan Default');
-- SET @cid = LAST_INSERT_ID();
-- UPDATE users SET company_id = @cid WHERE company_id IS NULL;
-- UPDATE office_locations SET company_id = @cid WHERE company_id IS NULL;
-- UPDATE attendance_logs SET company_id = @cid WHERE company_id IS NULL;
--
-- Lalu WAJIB jalankan supaya tidak ada data "tanpa pemilik":
-- ALTER TABLE users MODIFY company_id INT NOT NULL;
-- ALTER TABLE office_locations MODIFY company_id INT NOT NULL;
-- ALTER TABLE attendance_logs MODIFY company_id INT NOT NULL;
-- ============================================================