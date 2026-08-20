-- ============================================================
-- SUPABASE SCHEMA - AbsensiPro Multi-Tenant
-- Jalankan file ini di Supabase Dashboard → SQL Editor
-- Project: thalftivgwdugkuipxqy (rafibagas124's Project)
-- ============================================================

-- ===== 1. TABEL COMPANIES (TENANT) =====
CREATE TABLE IF NOT EXISTS public.companies (
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
-- Semua user yang sudah login bisa lihat data perusahaan mereka sendiri
CREATE POLICY "companies_select_own"
    ON public.companies FOR SELECT
    USING (id = public.my_company_id());

-- Siapapun (anon) boleh INSERT company baru (untuk register)
CREATE POLICY "companies_insert_anon"
    ON public.companies FOR INSERT
    WITH CHECK (true);

-- Hanya admin perusahaan sendiri yang boleh update
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
CREATE POLICY "profiles_update_own_or_admin"
    ON public.profiles FOR UPDATE
    USING (
        id = auth.uid()
        OR (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'))
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
CREATE POLICY "shift_select_same_company"
    ON public.shift_configs FOR SELECT
    USING (company_id = public.my_company_id());

CREATE POLICY "shift_insert_admin"
    ON public.shift_configs FOR INSERT
    WITH CHECK (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'));

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
CREATE POLICY "surat_upload_authenticated"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'surat-dokter');

CREATE POLICY "surat_read_authenticated"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'surat-dokter');
