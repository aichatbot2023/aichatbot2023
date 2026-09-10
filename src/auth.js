import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';
import { ROLES, normalizeGrant } from './scopes.js';

/**
 * Token je samopotvrdjujuci (HMAC) - MCP server ne mora u bazu da bi znao ciji je.
 * Format:  v1.<base64url(payload)>.<base64url(hmac_sha256(payload, secret))>
 * Payload: { t: tenantId, u: userId, e: email, r: role, s: [scopes], iat, exp }
 *
 * `r` je uloga (client, client_write, sales, owner) - odredjuje koje alate token vidi.
 * `s` se upisuje samo kad se trazi rucni skup scope-ova mimo uloga.
 */

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url');

function sign(payloadB64, secret) {
  return b64u(crypto.createHmac('sha256', secret).update(payloadB64).digest());
}

export function mintToken({ tenantId, userId, email, role = 'client', scopes, ttlDays = 365 }, secret = config.tokenSecret) {
  if (!secret) throw new Error('MCP_TOKEN_SECRET nije postavljen.');
  if (!tenantId) throw new Error('tenantId je obavezan.');
  if (role && role !== 'custom' && !ROLES[role]) {
    throw new Error(`Nepoznata uloga "${role}". Dozvoljene: ${Object.keys(ROLES).join(', ')}.`);
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    t: String(tenantId),
    u: userId ? String(userId) : undefined,
    e: email || undefined,
    r: role,
    s: scopes && scopes.length ? scopes : undefined,
    iat: now,
    exp: ttlDays > 0 ? now + ttlDays * 86400 : undefined,
  };
  const payloadB64 = b64u(JSON.stringify(payload));
  return `v1.${payloadB64}.${sign(payloadB64, secret)}`;
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

export function verifyToken(token, secret = config.tokenSecret) {
  if (!token || typeof token !== 'string') throw new AuthError('Token nedostaje.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new AuthError('Token je neispravnog formata.');
  const [, payloadB64, sigB64] = parts;

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthError('Potpis tokena nije validan.');
  }

  let payload;
  try {
    payload = JSON.parse(unb64u(payloadB64).toString('utf8'));
  } catch {
    throw new AuthError('Token nije citljiv.');
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError('Token je istekao. Generisi novi u AiChatBot dashboardu.');
  }

  const grant = normalizeGrant({ role: payload.r, scopes: payload.s });

  return {
    tenantId: payload.t,
    userId: payload.u || null,
    email: payload.e || null,
    role: grant.role,
    scopes: grant.scopes,
    issuedAt: payload.iat,
    expiresAt: payload.exp || null,
  };
}

/* ---------------- revokacija (opciono) ---------------- */

const revocationCache = new Map(); // tokenHash -> { revoked, checkedAt }

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function assertNotRevoked(token) {
  if (!config.revocationUrl) return;
  const key = hashToken(token);
  const hit = revocationCache.get(key);
  if (hit && Date.now() - hit.checkedAt < config.revocationCacheMs) {
    if (hit.revoked) throw new AuthError('Pristup je povucen za ovaj token.', 403);
    return;
  }
  try {
    const res = await fetch(config.revocationUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiServiceKey}`,
      },
      body: JSON.stringify({ token_hash: key }),
      signal: AbortSignal.timeout(5000),
    });
    // Ako provera padne, ne obaramo saobracaj - samo logujemo.
    if (!res.ok) {
      log.warn('Provera revokacije nije uspela', { status: res.status });
      return;
    }
    const data = await res.json();
    const revoked = Boolean(data.revoked);
    revocationCache.set(key, { revoked, checkedAt: Date.now() });
    if (revoked) throw new AuthError('Pristup je povucen za ovaj token.', 403);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    log.warn('Revokacioni endpoint nedostupan', { error: err.message });
  }
}

/* ---------------- rate limit ---------------- */

const buckets = new Map(); // key -> { count, windowStart }

export function checkRateLimit(key) {
  const limit = config.rateLimitPerMinute;
  if (limit <= 0) return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > 60000) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new AuthError(`Previse zahteva (limit ${limit}/min). Pokusaj ponovo za minut.`, 429);
  }
}

export function rateLimitKey(token) {
  return hashToken(token).slice(0, 32);
}

// Periodicno ciscenje da mapa ne raste beskonacno.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now - v.windowStart > 120000) buckets.delete(k);
  for (const [k, v] of revocationCache) if (now - v.checkedAt > config.revocationCacheMs * 5) revocationCache.delete(k);
}, 60000).unref();
