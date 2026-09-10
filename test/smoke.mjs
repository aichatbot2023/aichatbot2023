/**
 * End-to-end provera: pokrece server u demo rezimu, povezuje se pravim MCP klijentom
 * preko Streamable HTTP-a, lista alate i poziva nekoliko njih.
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
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const cleanup = () => child.kill('SIGTERM');
process.on('exit', cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (r.ok) { up = true; break; }
  } catch {}
  await sleep(150);
}
if (!up) { console.error('FAIL: server se nije podigao'); process.exit(1); }

const token = mintToken({ tenantId: 'demo-tenant', userId: '42', email: 'test@aichatbot.rs', scopes: ['read', 'write'] });
const url = new URL(`http://127.0.0.1:${PORT}/u/${token}/mcp`);

const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(url));

const { tools } = await client.listTools();
console.log(`\nAlati (${tools.length}):`);
for (const t of tools) console.log(`  - ${t.name}: ${t.description.slice(0, 70)}...`);

const checks = [
  ['list_chatbots', {}],
  ['get_stats', { period: 'last_7_days' }],
  ['list_conversations', { limit: 5 }],
  ['get_conversation', { conversation_id: 'conv_1001' }],
  ['list_leads', {}],
  ['search_knowledge', { chatbot_id: 'bot_web', query: 'cena' }],
  ['ask_chatbot', { chatbot_id: 'bot_web', question: 'Koliko kosta Start paket?' }],
  ['add_knowledge', { chatbot_id: 'bot_web', title: 'Test', content: 'Nesto novo.' }],
];

let failed = 0;
for (const [name, args] of checks) {
  const res = await client.callTool({ name, arguments: args });
  const ok = !res.isError;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} -> ${res.content[0].text.replace(/\s+/g, ' ').slice(0, 80)}`);
}

// Neispravan token mora biti odbijen.
const badRes = await fetch(`http://127.0.0.1:${PORT}/u/v1.aaa.bbb/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
console.log(`${badRes.status === 401 ? 'OK  ' : 'FAIL'} neispravan token odbijen (HTTP ${badRes.status})`);
if (badRes.status !== 401) failed++;

await client.close();
child.kill('SIGTERM');

console.log(failed === 0 ? '\nSVE PROLAZI\n' : `\n${failed} PROVERA PALO\n`);
process.exit(failed === 0 ? 0 : 1);
