import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Push service is not configured' });
  }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const sb = getSupabase();

    // Verifikasi token JWT user
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData.user) return res.status(401).json({ error: 'Invalid session' });

    // Validasi payload subscription
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(422).json({ error: 'Invalid push subscription payload' });
    }

    // Ambil profil user (company_id + status aktif)
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('company_id, is_active, role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile?.is_active) {
      return res.status(403).json({ error: 'Inactive or unknown profile' });
    }

    // Rate limit: maks 10 subscription per user (cegah abuse multi-device berlebihan)
    const { count } = await sb
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id);

    if ((count || 0) >= 10) {
      // Hapus subscription terlama untuk memberi ruang
      const { data: oldest } = await sb
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', authData.user.id)
        .order('updated_at', { ascending: true })
        .limit(1)
        .single();
      if (oldest) await sb.from('push_subscriptions').delete().eq('id', oldest.id);
    }

    // Upsert subscription (update jika endpoint sudah ada, insert jika baru)
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        user_id:    authData.user.id,
        company_id: profile.company_id,
        endpoint:   subscription.endpoint,
        p256dh:     subscription.keys.p256dh,
        auth:       subscription.keys.auth,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'endpoint' }
    );

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('push-subscribe error:', err);
    return res.status(500).json({ error: 'Unable to save push subscription' });
  }
}
