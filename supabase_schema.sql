-- ============================================================
-- SUPABASE SCHEMA - AbsensiPro Multi-Tenant
-- Jalankan file ini di Supabase Dashboard → SQL Editor
-- Project: thalftivgwdugkuipxqy (rafibagas124's Project)
-- ============================================================

-- ===== 0. RESET TABEL LAMA (Mencegah bentrok tipe data UUID vs BIGINT) =====
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.office_locations CASCADE;
DROP TABLE IF EXISTS public.shift_configs CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;

-- ===== 1. TABEL COMPANIES (TENANT) =====
CREATE TABLE public.companies (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(30)  NOT NULL UNIQUE,
    nama       VARCHAR(150) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ===== 2. TABEL PROFILES (extends auth.users Supabase) =====
-- Dibuat otomatis via trigger saat user register Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
    id                   UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id           BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id          VARCHAR(50)  NULL,           -- ID karyawan (EMP-001 dsb, opsional)
    nama                 VARCHAR(150) NOT NULL,
    jabatan              VARCHAR(150) NULL,
    role                 VARCHAR(20)  NOT NULL DEFAULT 'karyawan' CHECK (role IN ('admin','hrd','karyawan','magang')),
    shift                VARCHAR(20)  NOT NULL DEFAULT 'pagi',
    jatah_cuti           INT          NOT NULL DEFAULT 12,
    allow_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
    tgl_masuk            DATE         NULL,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ===== 3. TABEL OFFICE LOCATIONS =====
CREATE TABLE IF NOT EXISTS public.office_locations (
    id         BIGSERIAL    PRIMARY KEY,
    company_id BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nama       VARCHAR(150) NOT NULL,
    alamat     TEXT         NULL,
    lat        DECIMAL(10,7) NOT NULL,
    lng        DECIMAL(10,7) NOT NULL,
    radius     INT          NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ===== 4. TABEL ATTENDANCE LOGS =====
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id               BIGSERIAL    PRIMARY KEY,
    company_id       BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id      VARCHAR(50)  NULL,
    nama             VARCHAR(150) NOT NULL,
    jabatan          VARCHAR(150) NULL,
    tipe             VARCHAR(10)  NULL,   -- 'Masuk' | 'Pulang' | NULL (untuk Izin/Sakit)
    status           VARCHAR(20)  NOT NULL DEFAULT 'Hadir'
                        CHECK (status IN ('Hadir','Terlambat','Izin','Sakit')),
    tanggal          DATE         NOT NULL,
    tanggal_selesai  DATE         NULL,   -- untuk Izin multi-hari
    jumlah_hari      INT          NULL,
    kategori_izin    VARCHAR(30)  NULL,
    waktu_masuk      TIME         NULL,
    waktu_pulang     TIME         NULL,
    gps_lat          DECIMAL(10,7) NULL,
    gps_lng          DECIMAL(10,7) NULL,
    gps_accuracy     DECIMAL(10,2) NULL,
    jarak_meter      INT          NULL,
    kantor_id        BIGINT       NULL REFERENCES public.office_locations(id) ON DELETE SET NULL,
    kantor_nama      VARCHAR(150) NULL,
    status_validasi  VARCHAR(20)  NULL CHECK (status_validasi IN ('Diterima','Ditolak')),
    alasan_tolak     VARCHAR(255) NULL,
    lokasi_text      TEXT         NULL,   -- keterangan izin/sakit (teks)
    -- Surat dokter (disimpan via Supabase Storage, ini hanya metadata)
    surat_nama       VARCHAR(255) NULL,
    surat_url        TEXT         NULL,
    status_verifikasi VARCHAR(30) NULL CHECK (status_verifikasi IN ('Menunggu Verifikasi','Disetujui','Ditolak')),
    catatan_verifikasi TEXT       NULL,
    verifikator_nama VARCHAR(150) NULL,
    foto_absen_path TEXT NULL,
    foto_diambil_at TIMESTAMPTZ NULL,
    status_verifikasi_foto VARCHAR(30) NULL CHECK (status_verifikasi_foto IN ('Menunggu Verifikasi','Disetujui','Diragukan','Ditolak')),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ===== 5. TABEL SHIFT CONFIG (per perusahaan) =====
CREATE TABLE IF NOT EXISTS public.shift_configs (
    id             BIGSERIAL    PRIMARY KEY,
    company_id     BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shift_key      VARCHAR(20)  NOT NULL,   -- 'pagi', 'siang', dll
    label          VARCHAR(50)  NOT NULL,
    jam_masuk      INT          NOT NULL DEFAULT 8,
    menit_masuk    INT          NOT NULL DEFAULT 0,
    jam_pulang     INT          NOT NULL DEFAULT 16,
    menit_pulang   INT          NOT NULL DEFAULT 0,
    toleransi      INT          NOT NULL DEFAULT 15,
    UNIQUE (company_id, shift_key)
);

-- ===== 6. INDEKS UNTUK PERFORMA =====
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_office_company   ON public.office_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_company ON public.attendance_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user  ON public.attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tanggal ON public.attendance_logs(tanggal);
CREATE INDEX IF NOT EXISTS idx_attendance_foto_status ON public.attendance_logs(status_verifikasi_foto);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date_type ON public.attendance_logs(user_id, tanggal, tipe);
CREATE INDEX IF NOT EXISTS idx_shift_company    ON public.shift_configs(company_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - ISOLASI ANTAR PERUSAHAAN
-- Kunci utama multi-tenant: setiap query otomatis difilter
-- berdasarkan company_id user yang sedang login.
-- ============================================================

ALTER TABLE public.companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_configs    ENABLE ROW LEVEL SECURITY;

-- ===== HELPER FUNCTION: ambil company_id user yang sedang login =====
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ===== HELPER FUNCTION: ambil role user yang sedang login =====
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ===== POLICIES: companies =====
-- Siapapun (publik/user) bisa melihat info perusahaan (id, code, nama untuk validasi login/register)
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
DROP POLICY IF EXISTS "companies_select_all" ON public.companies;
CREATE POLICY "companies_select_all"
    ON public.companies FOR SELECT
    USING (true);

-- Siapapun boleh mendaftarkan perusahaan baru
DROP POLICY IF EXISTS "companies_insert_anon" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_all" ON public.companies;
CREATE POLICY "companies_insert_all"
    ON public.companies FOR INSERT
    WITH CHECK (true);

-- Hanya admin perusahaan sendiri yang boleh update data perusahaannya
DROP POLICY IF EXISTS "companies_update_admin" ON public.companies;
CREATE POLICY "companies_update_admin"
    ON public.companies FOR UPDATE
    USING (id = public.my_company_id() AND public.my_role() = 'admin');

-- ===== POLICIES: profiles =====
-- User bisa lihat semua profil dalam perusahaan yang sama
CREATE POLICY "profiles_select_same_company"
    ON public.profiles FOR SELECT
    USING (company_id = public.my_company_id());

-- User bisa insert profil sendiri (saat register)
CREATE POLICY "profiles_insert_own"
    ON public.profiles FOR INSERT
    WITH CHECK (id = auth.uid());

-- User bisa update profil sendiri; admin bisa update profil dalam perusahaannya
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
    ON public.profiles FOR UPDATE
    USING (
        id = auth.uid()
        OR (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'))
    )
    WITH CHECK (
        company_id = public.my_company_id()
        AND (
            id = auth.uid()
            OR public.my_role() IN ('admin','hrd')
        )
    );

-- Hanya admin yang bisa hapus profil dalam perusahaannya
CREATE POLICY "profiles_delete_admin"
    ON public.profiles FOR DELETE
    USING (company_id = public.my_company_id() AND public.my_role() = 'admin');

-- ===== POLICIES: office_locations =====
-- Semua user dalam perusahaan bisa lihat kantor
CREATE POLICY "office_select_same_company"
    ON public.office_locations FOR SELECT
    USING (company_id = public.my_company_id());

-- Admin/HRD bisa tambah kantor
CREATE POLICY "office_insert_admin"
    ON public.office_locations FOR INSERT
    WITH CHECK (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- Admin/HRD bisa update kantor milik perusahaan sendiri
CREATE POLICY "office_update_admin"
    ON public.office_locations FOR UPDATE
    USING (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- Admin/HRD bisa hapus kantor milik perusahaan sendiri
CREATE POLICY "office_delete_admin"
    ON public.office_locations FOR DELETE
    USING (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- ===== POLICIES: attendance_logs =====
-- Karyawan hanya lihat log milik sendiri; HRD/Admin lihat semua log perusahaan
CREATE POLICY "attendance_select"
    ON public.attendance_logs FOR SELECT
    USING (
        company_id = public.my_company_id()
        AND (
            user_id = auth.uid()
            OR public.my_role() IN ('admin', 'hrd')
        )
    );

-- User hanya bisa insert log milik sendiri, company_id harus cocok
CREATE POLICY "attendance_insert"
    ON public.attendance_logs FOR INSERT
    WITH CHECK (
        company_id = public.my_company_id()
        AND user_id = auth.uid()
    );

-- HRD/Admin bisa update log (untuk verifikasi surat dokter)
CREATE POLICY "attendance_update_admin"
    ON public.attendance_logs FOR UPDATE
    USING (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- HRD/Admin bisa hapus log dalam perusahaan sendiri
CREATE POLICY "attendance_delete_admin"
    ON public.attendance_logs FOR DELETE
    USING (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- ===== POLICIES: shift_configs =====
DROP POLICY IF EXISTS "shift_select_same_company" ON public.shift_configs;
CREATE POLICY "shift_select_same_company"
    ON public.shift_configs FOR SELECT
    USING (company_id = public.my_company_id());

DROP POLICY IF EXISTS "shift_insert_admin" ON public.shift_configs;
DROP POLICY IF EXISTS "shift_insert_all" ON public.shift_configs;
CREATE POLICY "shift_insert_admin"
    ON public.shift_configs FOR INSERT
    WITH CHECK (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

DROP POLICY IF EXISTS "shift_update_admin" ON public.shift_configs;
CREATE POLICY "shift_update_admin"
    ON public.shift_configs FOR UPDATE
    USING (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

-- ============================================================
-- TRIGGER: Otomatis update kolom updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER office_updated_at
    BEFORE UPDATE ON public.office_locations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGER: Saat user baru register via Supabase Auth,
-- otomatis buat profil di tabel profiles.
-- company_id, nama, role diambil dari raw_user_meta_data
-- yang dikirim saat signUp() dari frontend.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        company_id,
        nama,
        jabatan,
        role,
        shift,
        jatah_cuti,
        tgl_masuk,
        must_change_password
    ) VALUES (
        NEW.id,
        (NEW.raw_user_meta_data->>'company_id')::BIGINT,
        COALESCE(NEW.raw_user_meta_data->>'nama', NEW.email),
        NEW.raw_user_meta_data->>'jabatan',
        COALESCE(NEW.raw_user_meta_data->>'role', 'karyawan'),
        COALESCE(NEW.raw_user_meta_data->>'shift', 'pagi'),
        COALESCE((NEW.raw_user_meta_data->>'jatah_cuti')::INT, 12),
        COALESCE((NEW.raw_user_meta_data->>'tgl_masuk')::DATE, CURRENT_DATE),
        COALESCE((NEW.raw_user_meta_data->>'must_change_password')::BOOLEAN, FALSE)
    );
    RETURN NEW;
END;
$$;

-- Pasang trigger ke auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- DATA AWAL: Default shift configs (akan dibuat per perusahaan
-- saat pertama kali admin register, via fungsi JS)
-- ============================================================
-- (Tidak ada data awal global karena semua data terikat company_id)

-- ============================================================
-- STORAGE BUCKET untuk surat dokter (jalankan terpisah di
-- Supabase Dashboard → Storage → New bucket)
-- Atau via SQL:
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('surat-dokter', 'surat-dokter', false)
ON CONFLICT (id) DO NOTHING;

-- Policy storage: user yang authenticated bisa upload ke folder company mereka
DROP POLICY IF EXISTS "surat_upload_authenticated" ON storage.objects;
CREATE POLICY "surat_upload_authenticated"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'surat-dokter'
        AND name LIKE public.my_company_id()::TEXT || '/%'
        AND split_part(name, '/', 2) = auth.uid()::TEXT
    );

DROP POLICY IF EXISTS "surat_read_authenticated" ON storage.objects;
CREATE POLICY "surat_read_authenticated"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'surat-dokter'
        AND name LIKE public.my_company_id()::TEXT || '/%'
        AND (
            split_part(name, '/', 2) = auth.uid()::TEXT
            OR public.my_role() IN ('admin','hrd')
        )
    );

INSERT INTO storage.buckets (id, name, public)
VALUES ('foto-absensi', 'foto-absensi', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "attendance_photo_upload_authenticated" ON storage.objects;
CREATE POLICY "attendance_photo_upload_authenticated"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'foto-absensi'
        AND name LIKE public.my_company_id()::TEXT || '/%'
        AND split_part(name, '/', 2) = auth.uid()::TEXT
    );

DROP POLICY IF EXISTS "attendance_photo_read_authenticated" ON storage.objects;
CREATE POLICY "attendance_photo_read_authenticated"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'foto-absensi'
        AND name LIKE public.my_company_id()::TEXT || '/%'
        AND (
            split_part(name, '/', 2) = auth.uid()::TEXT
            OR public.my_role() IN ('admin','hrd')
        )
    );

-- ============================================================
-- 7. TABEL SECURITY AUDIT LOGS (REAL-TIME AUDIT & MONITORING)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id          BIGSERIAL    PRIMARY KEY,
    company_id  BIGINT       NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    event_type  VARCHAR(50)  NOT NULL,
    severity    VARCHAR(20)  NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','CRITICAL')),
    user_email  VARCHAR(150) NULL,
    user_agent  TEXT         NULL,
    details     JSONB        NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_company ON public.security_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_sec_created ON public.security_audit_logs(created_at);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sec_logs_select"
    ON public.security_audit_logs FOR SELECT
    USING (company_id = public.my_company_id() AND public.my_role() = 'admin');

DROP POLICY IF EXISTS "sec_logs_insert" ON public.security_audit_logs;
CREATE POLICY "sec_logs_insert_own_company"
    ON public.security_audit_logs FOR INSERT
    WITH CHECK (company_id = public.my_company_id());

-- Validasi server-side untuk semua insert absensi dari browser/Supabase.
CREATE OR REPLACE FUNCTION public.validate_attendance_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_company BIGINT;
    nearest_radius NUMERIC;
    nearest_distance NUMERIC;
BEGIN
    SELECT company_id INTO user_company FROM public.profiles WHERE id = NEW.user_id;
    IF user_company IS NULL OR NEW.company_id <> user_company THEN
        RAISE EXCEPTION 'attendance tenant mismatch';
    END IF;

    IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'attendance user mismatch';
    END IF;

    SELECT distance, radius INTO nearest_distance, nearest_radius
    FROM (
        SELECT ol.radius::NUMERIC AS radius,
            6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(ol.lat::NUMERIC - NEW.gps_lat::NUMERIC) / 2), 2)
                + COS(RADIANS(NEW.gps_lat::NUMERIC)) * COS(RADIANS(ol.lat::NUMERIC))
                * POWER(SIN(RADIANS(ol.lng::NUMERIC - NEW.gps_lng::NUMERIC) / 2), 2)
            )) AS distance
        FROM public.office_locations ol
        WHERE ol.company_id = NEW.company_id
          AND NEW.gps_lat IS NOT NULL AND NEW.gps_lng IS NOT NULL
        ORDER BY distance
        LIMIT 1
    ) office_distance;

    IF nearest_distance IS NOT NULL AND nearest_distance > nearest_radius THEN
        RAISE EXCEPTION 'attendance outside office geofence';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_attendance_insert ON public.attendance_logs;
CREATE TRIGGER validate_attendance_insert
    BEFORE INSERT ON public.attendance_logs
    FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_insert();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.tipe IS NULL OR NEW.tipe NOT IN ('Masuk', 'Pulang') THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        NEW.company_id::TEXT || ':' || NEW.user_id::TEXT || ':' || NEW.tanggal::TEXT || ':' || COALESCE(NEW.tipe, ''), 0
    ));
    IF EXISTS (
        SELECT 1 FROM public.attendance_logs
        WHERE company_id = NEW.company_id
          AND user_id = NEW.user_id
          AND tanggal = NEW.tanggal
          AND tipe IS NOT DISTINCT FROM NEW.tipe
    ) THEN
        RAISE EXCEPTION 'duplicate attendance for this date and type';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_attendance ON public.attendance_logs;
CREATE TRIGGER prevent_duplicate_attendance
    BEFORE INSERT ON public.attendance_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_attendance();

-- Enable Realtime Broadcast for Security Logs (Alerts)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.security_audit_logs;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if already added or permission denied
END $$;

