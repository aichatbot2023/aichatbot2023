#!/usr/bin/env node
/**
 * Generisanje klijentskog tokena iz komandne linije.
 *
 *   MCP_TOKEN_SECRET=... node scripts/mint-token.mjs --tenant acme --user 42 \
 *     --email pera@firma.rs --scopes read,write --days 365
 */
import { mintToken } from '../src/auth.js';
import { config } from '../src/config.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]]);
    return acc;
  }, [])
);

if (!args.tenant) {
  console.error('Upotreba: node scripts/mint-token.mjs --tenant <id> [--user <id>] [--email <mail>] [--scopes read,write] [--days 365]');
  process.exit(1);
}

const token = mintToken({
  tenantId: args.tenant,
  userId: args.user,
  email: args.email,
  scopes: (args.scopes || 'read').split(',').map((s) => s.trim()).filter(Boolean),
  ttlDays: Number(args.days ?? 365),
});

console.log('\nToken:');
console.log(token);
console.log('\nURL za Claude.ai custom connector:');
console.log(`${config.publicUrl}/u/${token}/mcp\n`);
