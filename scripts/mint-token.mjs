#!/usr/bin/env node
/**
 * Generisanje klijentskog tokena iz komandne linije.
 *
 *   MCP_TOKEN_SECRET=... node scripts/mint-token.mjs --tenant acme --user 42 \
 *     --email pera@firma.rs --role client --days 365
 *
 * Uloge: client (samo citanje svog naloga), client_write, sales, owner.
 * --scopes se koristi samo za rucni skup mimo uloga.
 */
import { mintToken } from '../src/auth.js';
import { config } from '../src/config.js';
import { ROLE_NAMES } from '../src/scopes.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]]);
    return acc;
  }, [])
);

if (!args.tenant) {
  console.error(`Upotreba: node scripts/mint-token.mjs --tenant <id> [--user <id>] [--email <mail>] [--role <${ROLE_NAMES.join('|')}>] [--scopes a,b] [--days 365]`);
  process.exit(1);
}

const role = args.role || 'client';
if (!args.scopes && !ROLE_NAMES.includes(role)) {
  console.error(`Nepoznata uloga "${role}". Dozvoljene: ${ROLE_NAMES.join(', ')}.`);
  process.exit(1);
}

const token = mintToken({
  tenantId: args.tenant,
  userId: args.user,
  email: args.email,
  role: args.scopes ? 'custom' : role,
  scopes: args.scopes ? args.scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  ttlDays: Number(args.days ?? 365),
});

console.log(`\nUloga: ${args.scopes ? 'custom (' + args.scopes + ')' : role}`);
console.log('\nToken:');
console.log(token);
console.log('\nURL za Claude.ai custom connector:');
console.log(`${config.publicUrl}/u/${token}/mcp\n`);
