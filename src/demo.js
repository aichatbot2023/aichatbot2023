/**
 * DEMO_MODE=true - server radi bez backenda i vraca izmisljene podatke.
 * Sluzi da klijent/vi proverite vezu sa Claude-om pre nego sto backend endpointi postoje.
 */
const CHATBOTS = [
  { id: 'bot_web', name: 'Sajt - podrska', channels: ['web', 'viber'], status: 'active', language: 'sr' },
  { id: 'bot_wa', name: 'WhatsApp prodaja', channels: ['whatsapp'], status: 'active', language: 'sr' },
];

const CONVERSATIONS = [
  {
    id: 'conv_1001',
    chatbot_id: 'bot_web',
    channel: 'web',
    started_at: '2026-09-09T09:12:00Z',
    resolved_without_agent: true,
    sentiment: 'positive',
    category: 'prodaja',
    lead: { name: 'Marko Petrovic', email: 'marko@primer.rs', phone: '+3816011223' },
    messages: [
      { role: 'user', text: 'Koliko kosta paket za mali biznis?' },
      { role: 'bot', text: 'Paket Start je 49 EUR mesecno i ukljucuje 2 kanala.' },
      { role: 'user', text: 'Super, posaljite ponudu na mejl.' },
    ],
  },
  {
    id: 'conv_1002',
    chatbot_id: 'bot_wa',
    channel: 'whatsapp',
    started_at: '2026-09-09T14:40:00Z',
    resolved_without_agent: false,
    sentiment: 'negative',
    category: 'podrska',
    lead: null,
    messages: [
      { role: 'user', text: 'Ne radi mi integracija sa Viberom.' },
      { role: 'bot', text: 'Zao mi je zbog toga. Prosledjujem kolegi iz podrske.' },
    ],
  },
];

const EDGE_DEMO = {
  'chat-with-bot': (b) => ({ reply: `(demo) Bot ${b.bot_id} odgovara na: "${b.message}"`, session_id: b.session_id || 'sess_demo' }),
  'create-chatbot-from-website': (b) => ({ bot_id: 'bot_demo_new', name: b.name || 'Demo bot', demo_url: 'https://demo.aichatbot.rs/bot_demo_new' }),
  'delete-chatbot': (b) => ({ ok: true, deleted: b.bot_id }),
  'get-demo-link': (b) => ({ demo_url: `https://demo.aichatbot.rs/${b.bot_id}`, embed: `<script src="https://cdn.aichatbot.rs/w.js" data-bot="${b.bot_id}"></script>` }),
  'send-demo-email': (b) => ({ ok: true, sent_to: b.to }),
  'find-leads': (b) => ({
    leads: [
      { company_name: `Demo ${b.industry} 1`, city: b.location, website: 'https://primer1.rs', email: 'info@primer1.rs', phone: '+38111222333', score: 82 },
      { company_name: `Demo ${b.industry} 2`, city: b.location, website: 'https://primer2.rs', email: null, phone: '+38111444555', score: 54 },
    ].slice(0, b.limit || 20),
  }),
  'enrich-leads': (b) => ({ leads: (b.leads || []).map((l) => ({ ...l, email: `info@${(l.website || '').replace(/^https?:\/\//, '')}`, score: 71 })) }),
  'verify-emails': (b) => ({ results: (b.emails || []).map((e) => ({ email: e, valid: e.includes('@'), mx: true, disposable: false })) }),
  'research-company': (b) => ({ answer: `(demo) Na pitanje "${b.question}" sajt ${b.website} ne daje jasan odgovor.`, source: b.website }),
  'list-contacts': () => ({ contacts: [{ email: 'pera@primer.rs', name: 'Pera Peric', tags: ['newsletter'] }] }),
  'send-newsletter': (b) => ({ ok: true, campaign: b.name, queued: 128 }),
  'run-agent-task': (b) => ({ run_id: 'run_demo_1', status: 'queued', task: b.task }),
  'get-agent-run': (b) => ({ run_id: b.run_id, status: 'completed', result: '(demo) Zadatak zavrsen.' }),
  'ai-tim-command': (b) => ({ ok: true, action: b.action, agents: 7 }),
  'platform-stats': () => ({ chatbots: 214, conversations: 18734, contacts: 3120, agents: 12 }),
  'read-table': (b) => ({ table: b.table, rows: [{ id: 1, note: '(demo red)' }], limit: b.limit || 50 }),
};

export function demo(method, path, { query = {}, body = {} } = {}) {
  const edge = path.match(/^\/functions\/v1\/(.+)$/);
  if (edge) {
    const fn = EDGE_DEMO[edge[1]];
    if (!fn) return { ok: true, demo: true, function: edge[1], payload: body };
    return fn(body);
  }

  if (path === '/api/v1/chatbots') return { chatbots: CHATBOTS };

  if (path === '/api/v1/stats') {
    return {
      period: query.period || 'last_7_days',
      conversations: 342,
      leads: 47,
      resolved_without_agent_pct: 78,
      by_category: { prodaja: 141, podrska: 158, zakazivanje: 43 },
      by_channel: { web: 190, whatsapp: 96, viber: 56 },
      sentiment: { positive: 212, neutral: 96, negative: 34 },
    };
  }

  if (path === '/api/v1/conversations') {
    const list = CONVERSATIONS.filter((c) => !query.chatbot_id || c.chatbot_id === query.chatbot_id).map(
      ({ messages, ...rest }) => ({ ...rest, message_count: messages.length })
    );
    return { conversations: list, total: list.length };
  }

  const convMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)$/);
  if (convMatch) {
    const found = CONVERSATIONS.find((c) => c.id === decodeURIComponent(convMatch[1]));
    if (!found) throw new Error('Razgovor nije pronadjen (demo).');
    return found;
  }

  if (path === '/api/v1/leads') {
    return {
      leads: CONVERSATIONS.filter((c) => c.lead).map((c) => ({
        ...c.lead,
        conversation_id: c.id,
        created_at: c.started_at,
        source: c.channel,
      })),
    };
  }

  if (path.endsWith('/knowledge/search')) {
    return {
      results: [
        { title: 'Cenovnik 2026', score: 0.91, excerpt: 'Paket Start 49 EUR, Pro 99 EUR, Enterprise po dogovoru.' },
        { title: 'Uslovi koriscenja', score: 0.62, excerpt: 'Ugovor se sklapa na 12 meseci uz mogucnost raskida.' },
      ].slice(0, body.limit || 5),
    };
  }

  if (path.endsWith('/ask')) {
    return {
      answer: `(demo odgovor) Na pitanje "${body.question}" bot bi odgovorio na osnovu baze znanja.`,
      sources: ['Cenovnik 2026'],
    };
  }

  if (path.endsWith('/knowledge')) {
    return { ok: true, id: 'kb_demo_1', title: body.title || 'Bez naslova' };
  }

  if (path.endsWith('/reply')) {
    return { ok: true, delivered: true, message: body.message };
  }

  throw new Error(`Demo rezim nema odgovor za ${method} ${path}`);
}
