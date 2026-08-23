-- Apply to an existing Supabase project after supabase_schema.sql.

-- Pastikan tabel audit tersedia sebelum policy-nya diubah.
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    severity    VARCHAR(20) NOT NULL DEFAULT 'INFO'
                CHECK (severity IN ('INFO','WARNING','CRITICAL')),
    user_email  VARCHAR(150) NULL,
    user_agent  TEXT NULL,
    details     JSONB NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_company ON public.security_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_sec_created ON public.security_audit_logs(created_at);
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_insert_all" ON public.shift_configs;
DROP POLICY IF EXISTS "shift_insert_admin" ON public.shift_configs;
CREATE POLICY "shift_insert_admin"
    ON public.shift_configs FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.my_company_id()
        AND public.my_role() IN ('admin','hrd')
    );

DROP POLICY IF EXISTS "sec_logs_insert" ON public.security_audit_logs;
DROP POLICY IF EXISTS "sec_logs_insert_own_company" ON public.security_audit_logs;
CREATE POLICY "sec_logs_insert_own_company"
    ON public.security_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.my_company_id());

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