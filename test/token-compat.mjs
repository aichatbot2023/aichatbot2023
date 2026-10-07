/**
 * Dashboard mintuje token u Node-u (src/auth.js), a konektor ga proverava
 * u Denu (_scope.ts). Ako se HMAC ne poklapa, klijentski linkovi ne rade.
 * Ovaj test pusta OBA koda u Node-u i proverava da se slazu u oba smera.
 *
 *   node --experimental-strip-types test/token-compat.mjs
 */
const SECRET = 'tajna-za-potpisivanje-dovoljno-dugacka-1234567890';
process.env.MCP_TOKEN_SECRET = SECRET;

const node = await import('../src/auth.js');
const deno = await import('../deploy/lovable-chatbot-studio/supabase/functions/_shared/claudeScope.ts');

let failed = 0;
const check = (ok, label) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`); };

/* 1. Node mintuje -> Deno proverava */
const fromNode = node.mintToken({ tenantId: 'user-abc', userId: 'user-abc', email: 'pera@firma.rs', role: 'client' });
const ctx1 = await deno.resolveToken(fromNode, { legacyToken: 'nesto-drugo', signingSecret: SECRET });
check(ctx1.tenantId === 'user-abc', `Node->Deno: tenant prenet (${ctx1.tenantId})`);
check(ctx1.role === 'client', `Node->Deno: uloga prenta (${ctx1.role})`);
check(ctx1.scopes.has('chatbots:read') && !ctx1.scopes.has('platform:invoke'), 'Node->Deno: scope-ovi tacni');

/* 2. Deno mintuje -> Node proverava */
const fromDeno = await deno.mintToken({ tenantId: 'user-xyz', email: 'mika@firma.rs', role: 'sales' }, SECRET);
const ctx2 = node.verifyToken(fromDeno);
check(ctx2.tenantId === 'user-xyz', `Deno->Node: tenant prenet (${ctx2.tenantId})`);
check(ctx2.role === 'sales', `Deno->Node: uloga prenta (${ctx2.role})`);

/* 3. Pogresna tajna mora da padne */
await deno.resolveToken(fromNode, { legacyToken: '', signingSecret: 'druga-tajna-koja-nije-ista-nikako' })
  .then(() => check(false, 'pogresna tajna odbijena'))
  .catch((e) => check(/potpis/i.test(e.message), `pogresna tajna odbijena (${e.message})`));

/* 4. Falsifikovan potpis */
await deno.resolveToken(fromNode.slice(0, -3) + 'zzz', { legacyToken: '', signingSecret: SECRET })
  .then(() => check(false, 'falsifikovan potpis odbijen'))
  .catch((e) => check(/potpis/i.test(e.message), `falsifikovan potpis odbijen (${e.message})`));

/* 5. Stari deljeni token -> owner, bez tenanta */
const legacyCtx = await deno.resolveToken('stari-deljeni-token', { legacyToken: 'stari-deljeni-token', signingSecret: SECRET });
check(legacyCtx.role === 'owner', 'stari MCP_CONNECTOR_TOKEN daje ulogu owner');
check(legacyCtx.scopes.has('platform:invoke'), 'owner ima platform:invoke');

/* 6. Potpisan link NE MOZE da bude owner */
const ownerAttempt = await deno.mintToken({ tenantId: 'user-abc', role: 'owner' }, SECRET);
await deno.resolveToken(ownerAttempt, { legacyToken: '', signingSecret: SECRET })
  .then(() => check(false, 'potpisan owner link odbijen'))
  .catch((e) => check(/ne izdaje/i.test(e.message), `potpisan owner link odbijen (${e.message})`));

/* 7. Istekao token - mintujemo sa pomerenim satom, pa vracamo sat */
const realNow = Date.now;
Date.now = () => realNow() - 10 * 86400 * 1000; // 10 dana u proslost
const expired = await deno.mintToken({ tenantId: 'user-abc', role: 'client', ttlDays: 1 }, SECRET);
Date.now = realNow;
await deno.resolveToken(expired, { legacyToken: '', signingSecret: SECRET })
  .then(() => check(false, 'istekao token odbijen'))
  .catch((e) => check(/istekao/i.test(e.message), `istekao token odbijen (${e.message})`));

/* 8. Link bez roka se ne izdaje - ni u jednom ni u drugom kodu */
await deno.mintToken({ tenantId: 'user-abc', role: 'client', ttlDays: 0 }, SECRET)
  .then(() => check(false, 'Deno: ttlDays 0 odbijen'))
  .catch((e) => check(/pozitivan/i.test(e.message), `Deno: ttlDays 0 odbijen (${e.message})`));
try {
  node.mintToken({ tenantId: 'user-abc', role: 'client', ttlDays: 0 });
  check(false, 'Node: ttlDays 0 odbijen');
} catch (e) {
  check(/pozitivan/i.test(e.message), `Node: ttlDays 0 odbijen (${e.message})`);
}

console.log(failed === 0 ? '\nSVE PROLAZI\n' : `\n${failed} PROVERA PALO\n`);
process.exit(failed === 0 ? 0 : 1);
