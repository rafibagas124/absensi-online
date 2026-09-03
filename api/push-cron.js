import webpush from 'web-push';

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function supabaseFetch(path, options = {}) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), ...(options.headers || {}) }
  });
}

function localTime(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export default async function handler(req, res) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && req.headers.authorization !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Konfigurasi push server belum lengkap.' });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const [subscriptionsResponse, shiftsResponse] = await Promise.all([
    supabaseFetch('push_subscriptions?select=id,user_id,endpoint,p256dh,auth,timezone,last_sent_key'),
    supabaseFetch('shift_configs?select=company_id,shift_key,label,jam_masuk,menit_masuk,jam_pulang,menit_pulang')
  ]);
  if (!subscriptionsResponse.ok || !shiftsResponse.ok) return res.status(500).json({ error: 'Data push gagal dibaca.' });
  const subscriptions = await subscriptionsResponse.json();
  const shifts = await shiftsResponse.json();
  const userIds = [...new Set(subscriptions.map(item => item.user_id))];
  if (userIds.length === 0) return res.status(200).json({ sent: 0 });

  const profilesResponse = await supabaseFetch(`profiles?id=in.(${userIds.join(',')})&is_active=eq.true&select=id,company_id,role,shift`);
  if (!profilesResponse.ok) return res.status(500).json({ error: 'Profil push gagal dibaca.' });
  const profiles = Object.fromEntries((await profilesResponse.json()).map(profile => [profile.id, profile]));
  const shiftMap = Object.fromEntries(shifts.map(shift => [`${shift.company_id}:${shift.shift_key}`, shift]));
  let sent = 0;

  for (const item of subscriptions) {
    const profile = profiles[item.user_id];
    if (!profile || !['admin', 'hrd', 'karyawan', 'staff', 'magang'].includes(profile.role)) continue;
    const shift = shiftMap[`${profile.company_id}:${profile.shift || 'pagi'}`];
    if (!shift) continue;
    const now = localTime(item.timezone);
    const minute = Number(now.hour) * 60 + Number(now.minute);
    const date = `${now.year}-${now.month}-${now.day}`;
    const events = [
      { action: 'Masuk', at: Number(shift.jam_masuk) * 60 + Number(shift.menit_masuk), label: shift.label },
      { action: 'Pulang', at: Number(shift.jam_pulang) * 60 + Number(shift.menit_pulang), label: shift.label }
    ];
    const logsResponse = await supabaseFetch(`attendance_logs?user_id=eq.${profile.id}&tanggal=eq.${date}&select=tipe`);
    const logs = logsResponse.ok ? await logsResponse.json() : [];
    const hasMasuk = logs.some(log => log.tipe === 'Masuk');
    const hasPulang = logs.some(log => log.tipe === 'Pulang');

    for (const event of events) {
      if (minute < event.at - 60 || minute > event.at) continue;
      if ((event.action === 'Masuk' && hasMasuk) || (event.action === 'Pulang' && (!hasMasuk || hasPulang))) continue;
      const sentKey = `${date}:${event.action}:${event.at}`;
      if (item.last_sent_key === sentKey) continue;
      const message = event.action === 'Masuk'
        ? `Shift ${event.label} dimulai pukul ${String(Math.floor(event.at / 60)).padStart(2, '0')}:${String(event.at % 60).padStart(2, '0')}. Siapkan Absen Masuk.`
        : `Waktu Absen Pulang Shift ${event.label} pukul ${String(Math.floor(event.at / 60)).padStart(2, '0')}:${String(event.at % 60).padStart(2, '0')} sudah mendekat.`;
      try {
        await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify({ title: 'Pengingat AbsensiPro', body: message, tag: sentKey, url: '/' }));
        await supabaseFetch(`push_subscriptions?id=eq.${item.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_sent_key: sentKey, updated_at: new Date().toISOString() }) });
        item.last_sent_key = sentKey;
        sent++;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) await supabaseFetch(`push_subscriptions?id=eq.${item.id}`, { method: 'DELETE' });
      }
    }
  }
  return res.status(200).json({ sent });
};
