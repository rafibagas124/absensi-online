import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Helper: ambil menit dalam waktu lokal (sesuai timezone company)
function localMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour   = Number(parts.find(p => p.type === 'hour')?.value   || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

// Helper: tanggal lokal dalam format YYYY-MM-DD (sesuai timezone company)
function localDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

// Pesan bilingual berdasarkan preferensi bahasa user
function buildMessage(profile, shift, action, lang) {
  const isEn = lang === 'en';
  const shiftLabel = shift.label;
  const timeLabel  = action === 'Masuk'
    ? `${String(shift.jam_masuk).padStart(2,'0')}:${String(shift.menit_masuk).padStart(2,'0')}`
    : `${String(shift.jam_pulang).padStart(2,'0')}:${String(shift.menit_pulang).padStart(2,'0')}`;

  if (action === 'Masuk') {
    return isEn
      ? `${profile.nama}, your ${shiftLabel} Shift starts at ${timeLabel}. Don't forget to Clock In!`
      : `${profile.nama}, Shift ${shiftLabel} dimulai pukul ${timeLabel}. Jangan lupa Absen Masuk!`;
  } else {
    return isEn
      ? `${profile.nama}, it's almost time to Clock Out from your ${shiftLabel} Shift (${timeLabel}). Don't forget!`
      : `${profile.nama}, waktu Absen Pulang Shift ${shiftLabel} pukul ${timeLabel} sudah mendekat. Jangan lupa!`;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  // Keamanan: validasi CRON_SECRET agar hanya Vercel Cron yang bisa memanggil endpoint ini
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Validasi env vars wajib
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_PUBLIC_KEY
  ) {
    return res.status(503).json({ error: 'Push service is not configured. Set VAPID & Supabase env vars.' });
  }

  // Setup web-push VAPID
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@absensipro.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // Buat Supabase client dengan service role (bypass RLS) untuk cron
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const now = new Date();

  // Waktu reminder: 30 menit sebelum jam shift (sesuai permintaan)
  const REMINDER_MINUTES_BEFORE = 30;
  // Window toleransi: ±2 menit dari target (cegah notif terlewat jika cron delay 1-2 menit)
  const WINDOW_MINUTES = 2;

  // ── Load semua data yang dibutuhkan secara paralel ──
  const [
    { data: companies, error: compError },
    { data: profiles,  error: profileError },
    { data: shifts,    error: shiftError },
    { data: subs,      error: subError }
  ] = await Promise.all([
    // Companies beserta timezone-nya
    sb.from('companies')
      .select('id, timezone, is_active')
      .eq('is_active', true),

    // Hanya role yang perlu absen (bukan admin/hrd)
    sb.from('profiles')
      .select('id, company_id, nama, role, shift, lang')
      .eq('is_active', true)
      .in('role', ['karyawan', 'staff', 'magang']),

    // Semua shift config aktif
    sb.from('shift_configs')
      .select('company_id, shift_key, label, jam_masuk, menit_masuk, jam_pulang, menit_pulang'),

    // Push subscriptions
    sb.from('push_subscriptions')
      .select('id, user_id, company_id, endpoint, p256dh, auth')
  ]);

  if (compError || profileError || shiftError || subError) {
    console.error('Data load error:', { compError, profileError, shiftError, subError });
    return res.status(500).json({ error: 'Unable to load push recipients' });
  }

  // Map companies by id untuk lookup timezone cepat
  const companyMap = Object.fromEntries((companies || []).map(c => [c.id, c]));
  // Map subscriptions by user_id
  const subsByUser = {};
  for (const sub of (subs || [])) {
    if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
    subsByUser[sub.user_id].push(sub);
  }

  const due = [];

  for (const profile of (profiles || [])) {
    const company = companyMap[profile.company_id];
    if (!company) continue;

    // Gunakan timezone per perusahaan, fallback ke Asia/Jakarta
    const tz = company.timezone || process.env.APP_TIMEZONE || 'Asia/Jakarta';
    const minutes = localMinutes(now, tz);
    const date    = localDate(now, tz);

    // Cari config shift yang cocok dengan shift user
    const shift = (shifts || []).find(
      s => s.company_id === profile.company_id && s.shift_key === (profile.shift || 'pagi')
    );
    if (!shift) continue;

    // Hitung target menit untuk reminder masuk & pulang
    const masukAt  = (Number(shift.jam_masuk)  * 60 + Number(shift.menit_masuk))  % 1440;
    const pulangAt = (Number(shift.jam_pulang) * 60 + Number(shift.menit_pulang)) % 1440;
    const remMasuk  = (masukAt  - REMINDER_MINUTES_BEFORE + 1440) % 1440;
    const remPulang = (pulangAt - REMINDER_MINUTES_BEFORE + 1440) % 1440;

    // Cek apakah sekarang ada dalam window toleransi reminder masuk atau pulang
    const inMasukWindow  = minutes >= remMasuk  && minutes <= remMasuk  + WINDOW_MINUTES;
    const inPulangWindow = minutes >= remPulang && minutes <= remPulang + WINDOW_MINUTES;

    let action = null;
    if (inMasukWindow)  action = 'Masuk';
    if (inPulangWindow) action = 'Pulang';
    if (!action) continue;

    // Cegah duplikat: coba insert ke log (UNIQUE constraint akan reject kalau sudah dikirim)
    const key = `${profile.company_id}:${profile.id}:${date}:${action}`;
    const { data: inserted, error: logError } = await sb
      .from('push_notification_log')
      .insert({
        notification_key: key,
        company_id: profile.company_id,
        user_id: profile.id,
        action,
        sent_at: now.toISOString()
      })
      .select('id')
      .maybeSingle();

    // Kalau sudah ada (duplikat) atau error lain, skip
    if (!inserted) continue;

    // Tambahkan semua subscription user ini ke antrian kirim
    const userSubs = subsByUser[profile.id] || [];
    for (const sub of userSubs) {
      // Pastikan company_id subscription cocok (multi-tenant safety)
      if (sub.company_id !== profile.company_id) continue;
      due.push({ sub, profile, shift, action, tz, lang: profile.lang || 'id' });
    }
  }

  // Kirim semua push notification
  let sent = 0;
  const errors = [];

  for (const item of due) {
    const body = buildMessage(item.profile, item.shift, item.action, item.lang);
    const date = localDate(now, item.tz);
    const payload = JSON.stringify({
      title: 'AbsensiPro 🔔',
      body,
      tag:   `shift-${item.action}-${date}-${item.profile.id}`,
      data:  { url: '/', action: item.action }
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: item.sub.endpoint,
          keys: { p256dh: item.sub.p256dh, auth: item.sub.auth }
        },
        payload
      );
      sent++;
    } catch (err) {
      // 404/410 = subscription kadaluarsa/dicabut, hapus dari DB
      if (err.statusCode === 404 || err.statusCode === 410) {
        await sb.from('push_subscriptions').delete().eq('id', item.sub.id);
      } else {
        errors.push({ user: item.profile.nama, error: err.message });
      }
    }
  }

  return res.status(200).json({
    ok: true,
    checkedAt:  now.toISOString(),
    dueCount:   due.length,
    sent,
    errors: errors.length > 0 ? errors : undefined
  });
}
