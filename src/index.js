import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config, assertConfig } from './config.js';
import { log, maskToken } from './log.js';
import { AuthError, verifyToken, assertNotRevoked, checkRateLimit, rateLimitKey } from './auth.js';
import { buildServer } from './mcp-server.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'aichatbot-mcp',
    demo_mode: config.demoMode,
    write_enabled: config.allowWrite,
  });
});

/** Token stize ili iz putanje (/u/<token>/mcp) ili iz Authorization zaglavlja. */
function extractToken(req) {
  if (req.params?.token) return req.params.token;
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

async function handleMcp(req, res) {
  const token = extractToken(req);
  let ctx;

  try {
    if (!token) throw new AuthError('Nedostaje token. Koristi URL koji si dobio u AiChatBot dashboardu.');
    checkRateLimit(rateLimitKey(token));
    ctx = verifyToken(token);
    await assertNotRevoked(token);
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    log.warn('Odbijen pristup', { token: maskToken(token), reason: err.message });
    return res.status(status).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: err.message },
      id: null,
    });
  }

  log.info('MCP zahtev', {
    tenant: ctx.tenantId,
    user: ctx.userId,
    method: req.body?.method,
  });

  // Stateless: novi server + transport po zahtevu, sve se zatvara na kraju.
  const server = buildServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log.error('MCP obrada nije uspela', { error: err.message, tenant: ctx.tenantId });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interna greska servera.' },
        id: null,
      });
    }
  }
}

// Glavni endpoint za Claude.ai custom connector (token u putanji).
app.post('/u/:token/mcp', handleMcp);
// Za Claude Code / Desktop koji umeju da salju Authorization zaglavlje.
app.post('/mcp', handleMcp);

// Stateless rezim ne podrzava SSE stream niti brisanje sesije.
const notAllowed = (_req, res) =>
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Metoda nije podrzana. Server radi u stateless rezimu.' },
    id: null,
  });
app.get('/u/:token/mcp', notAllowed);
app.get('/mcp', notAllowed);
app.delete('/u/:token/mcp', notAllowed);
app.delete('/mcp', notAllowed);

const problems = assertConfig();
if (problems.length) {
  for (const p of problems) log.error('Konfiguracija', { problem: p });
  if (!config.demoMode) process.exit(1);
}

const server = app.listen(config.port, () => {
  log.info('AiChatBot MCP server pokrenut', {
    port: config.port,
    url: `${config.publicUrl}/u/<TOKEN>/mcp`,
    demo_mode: config.demoMode,
    write_enabled: config.allowWrite,
  });
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log.info('Gasim server', { signal: sig });
    server.close(() => process.exit(0));
  });
}
