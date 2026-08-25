-- Add automatic attendance photo evidence without changing existing attendance rows.
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
    ON public.profiles FOR UPDATE
    USING (
        id = auth.uid()
        OR (company_id = public.my_company_id() AND public.my_role() IN ('admin','hrd'))
    )
    WITH CHECK (
        company_id = public.my_company_id()
        AND (id = auth.uid() OR public.my_role() IN ('admin','hrd'))
    );

ALTER TABLE public.attendance_logs
    ADD COLUMN IF NOT EXISTS foto_absen_path TEXT,
    ADD COLUMN IF NOT EXISTS foto_diambil_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status_verifikasi_foto VARCHAR(30);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'attendance_logs_status_verifikasi_foto_check'
    ) THEN
        ALTER TABLE public.attendance_logs
            ADD CONSTRAINT attendance_logs_status_verifikasi_foto_check
            CHECK (status_verifikasi_foto IN ('Menunggu Verifikasi','Disetujui','Diragukan','Ditolak'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_foto_status
    ON public.attendance_logs(status_verifikasi_foto);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date_type
    ON public.attendance_logs(user_id, tanggal, tipe);

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
        WHERE company_id = NEW.company_id AND user_id = NEW.user_id
          AND tanggal = NEW.tanggal AND tipe IS NOT DISTINCT FROM NEW.tipe
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
