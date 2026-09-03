-- Add the overnight default shift for existing tenants without changing their schedules.
INSERT INTO public.shift_configs (
    company_id, shift_key, label, jam_masuk, menit_masuk, jam_pulang, menit_pulang, toleransi
)
SELECT id, 'malam', 'Malam', 22, 0, 6, 0, 15
FROM public.companies
ON CONFLICT (company_id, shift_key) DO NOTHING;