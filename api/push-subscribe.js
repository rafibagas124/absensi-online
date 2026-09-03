const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, body) {
  res.status(status).json(body);
}

async function supabaseFetch(path, options = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!process.env.VAPID_PUBLIC_KEY) return json(res, 500, { error: 'Push notification belum dikonfigurasi.' });
    return json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method tidak didukung.' });
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Konfigurasi server belum lengkap.' });

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return json(res, 401, { error: 'Sesi tidak valid.' });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) return json(res, 401, { error: 'Sesi tidak valid.' });
  const user = await userResponse.json();
  const subscription = req.body?.subscription;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return json(res, 422, { error: 'Subscription push tidak lengkap.' });
  }

  const profileResponse = await supabaseFetch(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,company_id,is_active`);
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || !profiles[0]?.is_active) return json(res, 403, { error: 'Profil tidak aktif.' });

  const payload = {
    user_id: user.id,
    company_id: profiles[0].company_id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    timezone: subscription.timezone || 'UTC',
    user_agent: String(req.headers['user-agent'] || '').slice(0, 255),
    updated_at: new Date().toISOString()
  };
  const saveResponse = await supabaseFetch('push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!saveResponse.ok) return json(res, 500, { error: 'Subscription push gagal disimpan.' });
  return json(res, 200, { subscribed: true });
};
