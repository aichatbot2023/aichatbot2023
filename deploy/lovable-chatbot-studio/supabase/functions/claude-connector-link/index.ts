// claude-connector-link — izdaje i opoziva klijentski link za Claude konektor.
//
// Klijent u dashboardu klikne "Generisi link" -> ovo vraca URL koji on nalepi
// u claude.ai (Settings -> Connectors -> Add custom connector).
//
// Autentikacija: korisnikov Supabase JWT iz Authorization zaglavlja.
// Nalog se UVEK cita iz JWT-a, nikad iz tela zahteva - klijent ne moze
// da izdaje link za tudji nalog.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { mintToken, sha256Hex, type Role } from '../claude-connector/_scope.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNING_SECRET = Deno.env.get('MCP_SIGNING_SECRET') || '';
// Javna adresa konektora. Preko /mcp na vasem domenu klijent ne vidi Supabase URL.
const CONNECTOR_URL = Deno.env.get('MCP_PUBLIC_URL') || 'https://aichatbot.rs/mcp';
// Nalozi koji dobijaju konektor bez Stripe pretplate (interni test, ili
// klijent koji placa van platforme). Zarezom razdvojeni user_id-jevi.
const ALLOWED_USER_IDS = (Deno.env.get('MCP_ALLOWED_USER_IDS') || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Uloge koje klijent sme sam sebi da izda. `owner` nije na listi i nikad nece biti.
const SELF_SERVICE_ROLES: Role[] = ['client', 'client_write'];
const DEFAULT_TTL_DAYS = 90;

/**
 * Konektor je deo placenog paketa.
 * Ista definicija pretplatnika kao u src/hooks/useIsSubscriber.ts:
 * aktivna pretplata kojoj period nije istekao.
 */
async function hasActiveSubscription(admin: any, userId: string): Promise<boolean> {
  if (ALLOWED_USER_IDS.includes(userId)) return true;
  const { data } = await admin
    .from('user_subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .maybeSingle();
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Samo POST.' }, 405);
  if (!SIGNING_SECRET) return json({ error: 'MCP_SIGNING_SECRET nije postavljen.' }, 500);

  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Neautorizovano.' }, 401);

  // Ko je korisnik - po njegovom JWT-u, ne po telu zahteva.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || SERVICE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return json({ error: 'Neautorizovano.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* prazno telo je ok */ }
  const action = String(body.action || 'create');

  /* ── opoziv ────────────────────────────────────────────────────────────── */
  if (action === 'revoke') {
    const { error } = await admin
      .from('claude_connector_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('revoked_at', null);
    if (error) return json({ error: error.message }, 500);
    return json({ revoked: true, note: 'Svi postojeci linkovi ovog naloga su opozvani.' });
  }

  /* ── pregled ───────────────────────────────────────────────────────────── */
  if (action === 'status') {
    const { data } = await admin
      .from('claude_connector_links')
      .select('role, created_at, expires_at, last_used_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    // Sam token se NE cuva, pa ga ne mozemo ponovo pokazati - samo da li postoji.
    return json({
      active: Boolean(data?.[0]),
      link: data?.[0] || null,
      subscribed: await hasActiveSubscription(admin, user.id),
    });
  }

  /* ── izdavanje ─────────────────────────────────────────────────────────── */
  if (!(await hasActiveSubscription(admin, user.id))) {
    return json({
      error: 'Claude konektor je deo plaćenog paketa. Aktiviraj pretplatu pa generiši link.',
      code: 'subscription_required',
    }, 402);
  }

  const role: Role = SELF_SERVICE_ROLES.includes(body.role) ? body.role : 'client';
  const ttlDays = Math.min(Math.max(Number(body.ttl_days) || DEFAULT_TTL_DAYS, 1), 365);

  // Jedan aktivan link po nalogu: stari se opoziva da ne ostaju zivi tokeni.
  await admin
    .from('claude_connector_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('revoked_at', null);

  const token = await mintToken(
    { tenantId: user.id, userId: user.id, email: user.email || undefined, role, ttlDays },
    SIGNING_SECRET,
  );

  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();

  // Cuvamo SAMO hash - da opoziv radi, a da sam token ne postoji u bazi.
  const { error } = await admin.from('claude_connector_links').insert({
    user_id: user.id,
    token_hash: await sha256Hex(token),
    role,
    expires_at: expiresAt,
  });
  if (error) return json({ error: error.message }, 500);

  const sep = CONNECTOR_URL.includes('?') ? '&' : '?';
  return json({
    url: `${CONNECTOR_URL}${sep}token=${token}`,
    role,
    expires_at: expiresAt,
    note: 'Link se prikazuje samo jednom. Cuvaj ga kao lozinku; ako procuri, klikni Opozovi.',
  });
});
