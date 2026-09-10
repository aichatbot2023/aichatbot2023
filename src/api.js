import { config } from './config.js';
import { log } from './log.js';
import { demo } from './demo.js';
import { edgeNameFor } from './platform-functions.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Jedina tacka dodira sa backendom AiChatBot.rs platforme.
 * Ako se putanje kod vas zovu drugacije - menja se samo ova datoteka.
 */
async function call(ctx, method, path, { query, body } = {}) {
  if (config.demoMode) return demo(method, path, { query, body, ctx });

  const url = new URL(config.apiBaseUrl + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      // Server-to-server kljuc: backend zna da poziv dolazi od MCP servera.
      authorization: `Bearer ${config.apiServiceKey}`,
      // Tenant/korisnik NIKAD ne dolaze iz argumenata alata, vec iz potpisanog tokena.
      'x-tenant-id': ctx.tenantId,
      ...(ctx.userId ? { 'x-user-id': ctx.userId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    log.warn('API greska', { path, status: res.status, tenant: ctx.tenantId });
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new ApiError(`AiChatBot API: ${msg}`, res.status);
  }
  return data;
}

/**
 * Drugi kanal: Supabase edge funkcije platforme.
 * Postojeci alati (demo botovi, leadovi, agenti, newsletter) idu ovuda.
 */
async function edge(ctx, tool, payload = {}, { functionName } = {}) {
  const name = functionName || edgeNameFor(tool);
  if (config.demoMode) return demo('POST', `/functions/v1/${name}`, { body: payload, ctx });

  if (!config.supabaseUrl) throw new ApiError('SUPABASE_URL nije podesen na serveru.', 500);

  const res = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: config.supabaseServiceKey,
      authorization: `Bearer ${config.supabaseServiceKey}`,
      // Ko poziva - edge funkcija moze da odbije poziv van svog naloga.
      'x-tenant-id': ctx.tenantId,
      'x-mcp-role': ctx.role,
      ...(ctx.userId ? { 'x-user-id': ctx.userId } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    log.warn('Edge funkcija vratila gresku', { fn: name, status: res.status, tenant: ctx.tenantId });
    throw new ApiError(`${name}: ${data?.message || data?.error || `HTTP ${res.status}`}`, res.status);
  }
  return data;
}

export const api = {
  /* ---- edge funkcije platforme ---- */
  edge,

  chatWithBot: (ctx, p) => edge(ctx, 'chat_with_bot', p),
  createChatbotFromWebsite: (ctx, p) => edge(ctx, 'create_chatbot_from_website', p),
  deleteChatbot: (ctx, p) => edge(ctx, 'delete_chatbot', p),
  getDemoLink: (ctx, p) => edge(ctx, 'get_demo_link', p),
  sendDemoEmail: (ctx, p) => edge(ctx, 'send_demo_email', p),
  findLeads: (ctx, p) => edge(ctx, 'find_leads', p),
  enrichLeads: (ctx, p) => edge(ctx, 'enrich_leads', p),
  verifyEmails: (ctx, p) => edge(ctx, 'verify_emails', p),
  researchCompany: (ctx, p) => edge(ctx, 'research_company', p),
  listContacts: (ctx, p) => edge(ctx, 'list_contacts', p),
  sendNewsletter: (ctx, p) => edge(ctx, 'send_newsletter', p),
  runAgentTask: (ctx, p) => edge(ctx, 'run_agent_task', p),
  getAgentRun: (ctx, p) => edge(ctx, 'get_agent_run', p),
  aiTimCommand: (ctx, p) => edge(ctx, 'ai_tim_command', p),
  platformStats: (ctx, p) => edge(ctx, 'platform_stats', p),
  readTable: (ctx, p) => edge(ctx, 'read_table', p),
  invokeFunction: (ctx, { function_name, payload }) =>
    edge(ctx, 'invoke', payload || {}, { functionName: function_name }),

  /* ---- REST endpointi za klijentske podatke ---- */
  listChatbots: (ctx) => call(ctx, 'GET', '/api/v1/chatbots'),

  getStats: (ctx, { period, chatbot_id }) =>
    call(ctx, 'GET', '/api/v1/stats', { query: { period, chatbot_id } }),

  listConversations: (ctx, q) =>
    call(ctx, 'GET', '/api/v1/conversations', { query: q }),

  getConversation: (ctx, id) =>
    call(ctx, 'GET', `/api/v1/conversations/${encodeURIComponent(id)}`),

  listLeads: (ctx, q) => call(ctx, 'GET', '/api/v1/leads', { query: q }),

  searchKnowledge: (ctx, { chatbot_id, query, limit }) =>
    call(ctx, 'POST', `/api/v1/chatbots/${encodeURIComponent(chatbot_id)}/knowledge/search`, {
      body: { query, limit },
    }),

  askChatbot: (ctx, { chatbot_id, question }) =>
    call(ctx, 'POST', `/api/v1/chatbots/${encodeURIComponent(chatbot_id)}/ask`, {
      body: { question },
    }),

  addKnowledge: (ctx, { chatbot_id, title, content, url }) =>
    call(ctx, 'POST', `/api/v1/chatbots/${encodeURIComponent(chatbot_id)}/knowledge`, {
      body: { title, content, url },
    }),

  replyToConversation: (ctx, { conversation_id, message }) =>
    call(ctx, 'POST', `/api/v1/conversations/${encodeURIComponent(conversation_id)}/reply`, {
      body: { message },
    }),
};
