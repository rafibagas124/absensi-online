-- ============================================================
-- MIGRATION: Push Notifications & Timezone Support
-- AbsensiPro Multi-Tenant
-- Jalankan di Supabase Dashboard → SQL Editor
-- ============================================================

-- ===== 1. TAMBAH KOLOM TIMEZONE KE TABEL COMPANIES =====
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Jakarta';

-- Update companies yang sudah ada (jika ada, set default WIB)
UPDATE public.companies SET timezone = 'Asia/Jakarta' WHERE timezone IS NULL;

-- ===== 2. TABEL PUSH SUBSCRIPTIONS (Web Push / VAPID) =====
-- Menyimpan endpoint & keys browser push per user per device
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id  BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    endpoint    TEXT         NOT NULL UNIQUE,
    p256dh      TEXT         NOT NULL,
    auth        TEXT         NOT NULL,
    user_agent  TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user     ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_company  ON public.push_subscriptions(company_id);

-- ===== 3. TABEL PUSH NOTIFICATION LOG (Anti-Duplikat) =====
-- notification_key: "{company_id}:{user_id}:{date}:{action}" → UNIQUE cegah kirim 2x
CREATE TABLE IF NOT EXISTS public.push_notification_log (
    id                  BIGSERIAL    PRIMARY KEY,
    notification_key    TEXT         NOT NULL UNIQUE,
    company_id          BIGINT       NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action              VARCHAR(20)  NOT NULL,   -- 'Masuk' | 'Pulang'
    sent_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_log_key     ON public.push_notification_log(notification_key);
CREATE INDEX IF NOT EXISTS idx_push_log_user    ON public.push_notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_sent    ON public.push_notification_log(sent_at);

-- Auto-hapus log push lebih dari 30 hari (cegah table membengkak)
CREATE OR REPLACE FUNCTION public.cleanup_push_notification_log()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.push_notification_log WHERE sent_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ===== 4. RLS: PUSH SUBSCRIPTIONS =====
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User hanya bisa lihat subscription milik sendiri
DROP POLICY IF EXISTS "push_sub_select_own" ON public.push_subscriptions;
CREATE POLICY "push_sub_select_own"
    ON public.push_subscriptions FOR SELECT
    USING (user_id = auth.uid());

-- User hanya bisa insert subscription milik sendiri, company_id harus match
DROP POLICY IF EXISTS "push_sub_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_sub_insert_own"
    ON public.push_subscriptions FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND company_id = public.my_company_id()
    );

-- User hanya bisa update subscription milik sendiri
DROP POLICY IF EXISTS "push_sub_update_own" ON public.push_subscriptions;
CREATE POLICY "push_sub_update_own"
    ON public.push_subscriptions FOR UPDATE
    USING (user_id = auth.uid());

-- User hanya bisa hapus subscription milik sendiri
DROP POLICY IF EXISTS "push_sub_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_sub_delete_own"
    ON public.push_subscriptions FOR DELETE
    USING (user_id = auth.uid());

-- ===== 5. RLS: PUSH NOTIFICATION LOG =====
ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

-- Hanya service role (cron) yang bisa insert (via SECURITY DEFINER / service key, bypass RLS)
-- User tidak bisa lihat atau manipulasi log ini langsung
-- Admin company bisa lihat log perusahaannya untuk audit
DROP POLICY IF EXISTS "push_log_select_admin" ON public.push_notification_log;
CREATE POLICY "push_log_select_admin"
    ON public.push_notification_log FOR SELECT
    USING (
        company_id = public.my_company_id()
        AND public.my_role() = 'admin'
    );

-- ===== 6. TAMBAH SHIFT MALAM KE DEFAULT SHIFTS =====
-- Update fungsi sbInsertDefaultShifts dipanggil dari JS (sudah ada pagi & siang)
-- Shift malam TIDAK otomatis dibuat — hanya pagi & siang default.
-- Admin bisa tambah shift malam via UI "Tambah Shift Baru".
-- (Lihat perubahan di app.js untuk UI tambah shift baru)

-- ===== 7. TRIGGER updated_at UNTUK PUSH SUBSCRIPTIONS =====
CREATE TRIGGER push_sub_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 8. REALTIME: TAMBAH SHIFT_CONFIGS KE PUBLICATION =====
-- Sehingga perubahan jam shift oleh admin langsung di-broadcast ke semua client
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_configs;
        EXCEPTION WHEN duplicate_object THEN
            -- Sudah ada, tidak perlu ditambah lagi
        END;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore
END $$;

-- ===== SELESAI =====
-- Setelah menjalankan migration ini, lakukan:
-- 1. Set Vercel Environment Variables:
--    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
--    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
--    APP_TIMEZONE (default: Asia/Jakarta)
--    CRON_SECRET (opsional, rekomendasi untuk keamanan)
-- 2. Generate VAPID keys: npx web-push generate-vapid-keys
-- 3. Deploy ke Vercel (push ke GitHub)
