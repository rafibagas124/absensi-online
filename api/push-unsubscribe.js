import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
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

    const userId = authData.user.id;

    // Hapus semua subscription milik user ini
    const { error } = await sb
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return res.status(200).json({ ok: true, message: 'Push subscriptions removed' });
  } catch (err) {
    return res.status(500).json({ error: 'Unable to remove push subscription' });
  }
}
