const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'da'].includes(String(v).toLowerCase());

export const config = {
  port: Number(process.env.PORT || 8787),

  // Javni URL pod kojim server radi - koristi se samo za ispis u logu i /health.
  publicUrl: (process.env.PUBLIC_URL || 'https://mcp.aichatbot.rs').replace(/\/$/, ''),

  // Tajna kojom se potpisuju klijentski tokeni. OBAVEZNA u produkciji.
  tokenSecret: process.env.MCP_TOKEN_SECRET || '',

  // Backend AiChatBot.rs platforme koji MCP server poziva.
  apiBaseUrl: (process.env.AICHATBOT_API_URL || 'https://app.aichatbot.rs').replace(/\/$/, ''),
  // Servisni kljuc kojim se MCP server predstavlja backendu (server-to-server).
  apiServiceKey: process.env.AICHATBOT_SERVICE_KEY || '',
  apiTimeoutMs: Number(process.env.AICHATBOT_TIMEOUT_MS || 20000),

  // Bez backenda - vraca demo podatke. Za testiranje veze sa Claude-om.
  demoMode: bool(process.env.DEMO_MODE, false),

  // Alati koji menjaju podatke su podrazumevano iskljuceni.
  allowWrite: bool(process.env.MCP_ALLOW_WRITE, false),

  // Opcioni endpoint za proveru da li je token povucen (revoked).
  // Ako je prazan, provera se preskace (token vazi do isteka).
  revocationUrl: process.env.MCP_REVOCATION_URL || '',
  revocationCacheMs: Number(process.env.MCP_REVOCATION_CACHE_MS || 60000),

  // Prosti rate limit po tokenu.
  rateLimitPerMinute: Number(process.env.MCP_RATE_LIMIT || 120),

  logLevel: process.env.LOG_LEVEL || 'info',
};

export function assertConfig() {
  const problems = [];
  if (!config.tokenSecret && !config.demoMode) {
    problems.push('MCP_TOKEN_SECRET nije postavljen (obavezan van DEMO_MODE).');
  }
  if (config.tokenSecret && config.tokenSecret.length < 32) {
    problems.push('MCP_TOKEN_SECRET je kraci od 32 karaktera - generisi jaci.');
  }
  if (!config.demoMode && !config.apiServiceKey) {
    problems.push('AICHATBOT_SERVICE_KEY nije postavljen (obavezan van DEMO_MODE).');
  }
  return problems;
}
