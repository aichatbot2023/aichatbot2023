import { config } from './config.js';
import { log } from './log.js';
import { demo } from './demo.js';

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

export const api = {
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
