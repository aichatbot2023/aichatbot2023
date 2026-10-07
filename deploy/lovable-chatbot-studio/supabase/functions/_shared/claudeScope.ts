// Pristup: tokeni, uloge i scope-ovi za claude-connector.
//
// Dva tipa tokena istovremeno:
//   1) STARI - deljeni MCP_CONNECTOR_TOKEN iz secreta. Dobija ulogu `owner`,
//      pa vas postojeci link u Claude-u nastavlja da radi bez ikakve izmene.
//   2) NOVI  - HMAC-potpisan token po korisniku: v1.<payload>.<sig>
//      Nosi tenant (user_id), ulogu i rok. Ne upisuje se u bazu.

export type Role = 'client' | 'client_write' | 'sales' | 'owner';

export interface Ctx {
  tenantId: string | null; // user_id vlasnika naloga; null samo za owner
  userId: string | null;
  email: string | null;
  role: Role;
  scopes: Set<string>;
  tokenHash: string | null;
}

export const SCOPES = [
  'chatbots:read',
  'chatbots:write',
  'chatbots:delete',
  'chatbots:chat',
  'conversations:read',
  'knowledge:read',
  'leads:read',
  'leads:find',
  'contacts:read',
  'newsletter:send',
  'demo:create',
  'demo:send',
  'agents:run',
  'stats:read',
  'platform:read',
  'platform:invoke',
] as const;

export const ROLES: Record<Role, string[]> = {
  client: ['chatbots:read', 'chatbots:chat', 'conversations:read', 'leads:read', 'stats:read'],
  client_write: ['chatbots:read', 'chatbots:chat', 'chatbots:write', 'conversations:read', 'leads:read', 'stats:read', 'demo:create'],
  sales: [
    'chatbots:read', 'chatbots:write', 'chatbots:chat', 'conversations:read',
    'leads:read', 'leads:find', 'demo:create', 'demo:send', 'stats:read',
  ],
  owner: [...SCOPES],
};

/* ── HMAC token ─────────────────────────────────────────────────────────── */

const enc = new TextEncoder();

const b64u = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64u = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const str = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
};

async function hmacKey(secret: string) {
  return await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(payloadB64: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payloadB64));
  return b64u(new Uint8Array(sig));
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function mintToken(
  opts: { tenantId: string; userId?: string; email?: string; role?: Role; ttlDays?: number },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlDays ?? 90;
  // Link koji nikad ne istice je rupa: token zivi i kad korisnik ode iz firme.
  // Zato nema opcije "bez roka" - ako treba duze, zadaj veci broj dana.
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('ttlDays mora biti pozitivan broj - link bez roka se ne izdaje.');
  }
  const payload: Record<string, unknown> = {
    t: opts.tenantId,
    u: opts.userId || opts.tenantId,
    e: opts.email || undefined,
    r: opts.role || 'client',
    iat: now,
    exp: now + ttl * 86400,
  };

  const p = b64u(enc.encode(JSON.stringify(payload)));
  return `v1.${p}.${await sign(p, secret)}`;
}

/** Konstantno vreme - da poredjenje ne odaje koliko se znakova poklopilo. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function resolveToken(
  token: string,
  opts: { legacyToken: string; signingSecret: string },
): Promise<Ctx> {
  if (!token) throw new AuthError('Token nedostaje.');

  // 1) Stari deljeni token -> owner.
  if (opts.legacyToken && timingSafeEqual(token, opts.legacyToken)) {
    return {
      tenantId: null,
      userId: null,
      email: null,
      role: 'owner',
      scopes: new Set(ROLES.owner),
      tokenHash: null,
    };
  }

  // 2) Novi HMAC token.
  if (!token.startsWith('v1.')) throw new AuthError('Token nije prepoznat.');
  if (!opts.signingSecret) throw new AuthError('MCP_SIGNING_SECRET nije postavljen na serveru.', 500);

  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Token je neispravnog formata.');
  const [, payloadB64, sig] = parts;

  if (!timingSafeEqual(sig, await sign(payloadB64, opts.signingSecret))) {
    throw new AuthError('Potpis tokena nije validan.');
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64u(payloadB64)));
  } catch {
    throw new AuthError('Token nije citljiv.');
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError('Token je istekao. Generisi novi link u dashboardu.');
  }
  if (!payload.t) throw new AuthError('Token ne nosi nalog.');

  const role: Role = ROLES[payload.r as Role] ? (payload.r as Role) : 'client';

  // Vazno: HMAC token NIKAD ne moze da bude owner.
  // Owner je samo deljeni secret, koji ne izlazi iz vaseg okruzenja.
  if (role === 'owner') throw new AuthError('Ova uloga se ne izdaje kroz link.', 403);

  return {
    tenantId: String(payload.t),
    userId: payload.u ? String(payload.u) : String(payload.t),
    email: payload.e || null,
    role,
    scopes: new Set(ROLES[role]),
    tokenHash: await sha256Hex(token),
  };
}

export const can = (ctx: Ctx, scope: string) => ctx.scopes.has(scope);
export const isOwner = (ctx: Ctx) => ctx.role === 'owner';
