/**
 * End-to-end provera: pokrece server u demo rezimu i pravim MCP klijentom
 * proverava (1) da alati rade i (2) da uloge vide tacno ono sto smeju.
 *
 *   node test/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SECRET = 'test-secret-koji-je-dovoljno-dugacak-1234567890';
const PORT = 8799;

process.env.MCP_TOKEN_SECRET = SECRET;
const { mintToken } = await import('../src/auth.js');

const child = spawn(process.execPath, ['src/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DEMO_MODE: 'true',
    MCP_ALLOW_WRITE: 'true',
    MCP_TOKEN_SECRET: SECRET,
    PUBLIC_URL: `http://127.0.0.1:${PORT}`,
    LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
process.on('exit', () => child.kill('SIGTERM'));

let up = false;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) { up = true; break; } } catch {}
  await sleep(150);
}
if (!up) { console.error('FAIL: server se nije podigao'); process.exit(1); }

let failed = 0;
const check = (ok, label) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`); };

async function connect(tokenOpts) {
  const token = mintToken({ tenantId: 'demo-tenant', userId: '42', ...tokenOpts });
  const client = new Client({ name: 'smoke-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/u/${token}/mcp`)));
  const { tools } = await client.listTools();
  return { client, names: tools.map((t) => t.name) };
}

/* ---------- 1. koje alate koja uloga vidi ---------- */

console.log('\n— vidljivost alata po ulozi —');

// read_table i platform_stats traze bazu platforme -> samo edge verzija.
const PLATFORM_ONLY = ['invoke_platform_function', 'send_newsletter', 'delete_chatbot', 'list_contacts', 'run_agent_task', 'ai_tim_command'];
const EDGE_ONLY = ['read_table', 'platform_stats'];

const client = await connect({ role: 'client' });
console.log(`client       : ${client.names.length} alata`);
check(client.names.includes('list_chatbots'), 'client vidi list_chatbots');
check(!client.names.some((n) => PLATFORM_ONLY.includes(n)), 'client NE vidi nijedan alat platforme');
check(!client.names.includes('add_knowledge'), 'client NE vidi add_knowledge (nema write scope)');
check(!client.names.includes('find_leads'), 'client NE vidi find_leads');

const clientWrite = await connect({ role: 'client_write' });
console.log(`client_write : ${clientWrite.names.length} alata`);
check(clientWrite.names.includes('add_knowledge'), 'client_write vidi add_knowledge');
check(clientWrite.names.includes('reply_to_conversation'), 'client_write vidi reply_to_conversation');
check(!clientWrite.names.some((n) => PLATFORM_ONLY.includes(n)), 'client_write NE vidi alate platforme');

const sales = await connect({ role: 'sales' });
console.log(`sales        : ${sales.names.length} alata`);
check(sales.names.includes('find_leads'), 'sales vidi find_leads');
check(sales.names.includes('create_chatbot_from_website'), 'sales vidi create_chatbot_from_website');
check(sales.names.includes('send_demo_email'), 'sales vidi send_demo_email');
check(!sales.names.includes('send_newsletter'), 'sales NE vidi send_newsletter');
check(!sales.names.includes('invoke_platform_function'), 'sales NE vidi invoke_platform_function');

const owner = await connect({ role: 'owner' });
console.log(`owner        : ${owner.names.length} alata`);
for (const n of PLATFORM_ONLY) check(owner.names.includes(n), `owner vidi ${n}`);
for (const n of EDGE_ONLY) check(!owner.names.includes(n), `${n} se ne nudi u standalone serveru (samo edge)`);

/* ---------- 2. tvrdo pravilo izolacije ---------- */

console.log('\n— tvrdo pravilo: crossTenant alat trazi ulogu owner —');

// Token kome je RUCNO dodeljen najopasniji scope, ali bez uloge owner.
// Ne sme da dobije nijedan alat - a posto ih nema nijedan, server ga odbija sa 403.
const sneakyToken = mintToken({
  tenantId: 'demo-tenant',
  role: 'custom',
  scopes: ['platform:invoke', 'platform:read', 'newsletter:send', 'contacts:read'],
});
const sneakyRes = await fetch(`http://127.0.0.1:${PORT}/u/${sneakyToken}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
const sneakyBody = await sneakyRes.json();
check(sneakyRes.status === 403, `platformski scope bez uloge owner ne otvara nista (HTTP ${sneakyRes.status})`);
check(/nema nijedan dozvoljen alat/.test(sneakyBody?.error?.message || ''), 'poruka o odbijanju je jasna');

// Alat koji uloga ne vidi mora da bude odbijen i pri direktnom pozivu po imenu.
const denied = await client.client.callTool({ name: 'invoke_platform_function', arguments: { function_name: 'x' } });
check(
  denied.isError === true && /not found/i.test(denied.content[0].text),
  `direktan poziv invoke_platform_function sa client tokenom odbijen (${denied.content[0].text.slice(0, 45)})`
);
const denied2 = await sales.client.callTool({ name: 'send_newsletter', arguments: { name: 'x', subject: 'y', html_content: 'zzzzzzzzzzz' } });
check(denied2.isError === true, 'direktan poziv send_newsletter sa sales tokenom odbijen');

/* ---------- 3. da alati stvarno rade ---------- */

console.log('\n— izvrsavanje alata —');

const calls = [
  [client.client, 'list_chatbots', {}],
  [client.client, 'get_stats', { period: 'last_7_days' }],
  [client.client, 'list_conversations', { limit: 5 }],
  [client.client, 'get_conversation', { conversation_id: 'conv_1001' }],
  [client.client, 'list_leads', {}],
  [client.client, 'search_knowledge', { chatbot_id: 'bot_web', query: 'cena' }],
  [clientWrite.client, 'add_knowledge', { chatbot_id: 'bot_web', title: 'Test', content: 'Nesto novo.' }],
  [sales.client, 'chat_with_bot', { bot_id: 'bot_web', message: 'Zdravo' }],
  [sales.client, 'find_leads', { industry: 'stomatolog', location: 'Novi Sad', limit: 2 }],
  [sales.client, 'get_demo_link', { bot_id: 'bot_web' }],
  [owner.client, 'invoke_platform_function', { function_name: 'bilo-sta', payload: { a: 1 } }],
];

for (const [c, name, args] of calls) {
  const res = await c.callTool({ name, arguments: args });
  check(!res.isError, `${name} -> ${res.content[0].text.replace(/\s+/g, ' ').slice(0, 60)}`);
}

/* ---------- 4. stari tokeni i odbijanje ---------- */

console.log('\n— kompatibilnost i odbijanje —');

const legacy = await connect({ role: undefined, scopes: ['read'] });
check(legacy.names.includes('list_chatbots'), 'stari token sa scopes:["read"] i dalje radi kao client');
check(!legacy.names.some((n) => PLATFORM_ONLY.includes(n)), 'stari token ne dobija alate platforme');

const bad = await fetch(`http://127.0.0.1:${PORT}/u/v1.aaa.bbb/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
check(bad.status === 401, `falsifikovan token odbijen (HTTP ${bad.status})`);

for (const s of [client, clientWrite, sales, owner, legacy]) await s.client.close();
child.kill('SIGTERM');

console.log(failed === 0 ? '\nSVE PROLAZI\n' : `\n${failed} PROVERA PALO\n`);
process.exit(failed === 0 ? 0 : 1);
