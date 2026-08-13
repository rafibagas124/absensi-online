-- Jalankan file ini di database MySQL (misal: `absensipro`) sebelum memakai backend PHP.

CREATE TABLE IF NOT EXISTS office_locations (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nama       VARCHAR(150) NOT NULL,
    alamat     TEXT,
    lat        DECIMAL(10,7) NOT NULL,
    lng        DECIMAL(10,7) NOT NULL,
    radius     INT NOT NULL DEFAULT 100,       -- meter
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_logs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          VARCHAR(50) NOT NULL,
    nama             VARCHAR(150) NOT NULL,
    jabatan          VARCHAR(150),
    tipe             ENUM('Masuk','Pulang') NOT NULL,
    tanggal          DATE NOT NULL,
    waktu            TIME NOT NULL,
    gps_lat          DECIMAL(10,7) NOT NULL,
    gps_lng          DECIMAL(10,7) NOT NULL,
    gps_accuracy     DECIMAL(10,2) NULL,        -- meter, dari pos.coords.accuracy
    jarak_meter      INT NULL,                  -- hasil Haversine ke kantor terdekat
    kantor_id        INT NULL,
    kantor_nama      VARCHAR(150) NULL,
    status_validasi  ENUM('Diterima','Ditolak') NOT NULL,
    alasan_tolak     VARCHAR(255) NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kantor_id) REFERENCES office_locations(id) ON DELETE SET NULL,
    INDEX idx_user_tanggal (user_id, tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;