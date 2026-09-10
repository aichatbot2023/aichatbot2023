import { z } from 'zod';
import { api } from './api.js';
import { config } from './config.js';

const text = (data) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});

const fail = (msg) => ({
  content: [{ type: 'text', text: `Greska: ${msg}` }],
  isError: true,
});

const wrap = (fn) => async (args, extra) => {
  try {
    return text(await fn(args, extra));
  } catch (err) {
    return fail(err.message || String(err));
  }
};

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format mora biti YYYY-MM-DD');

/**
 * ctx = { tenantId, userId, scopes } iz potpisanog tokena.
 * Argumenti alata NIKAD ne odredjuju ciji su podaci - to radi samo token.
 */
export function registerTools(server, ctx) {
  const canWrite = config.allowWrite && ctx.scopes.includes('write');

  server.registerTool(
    'list_chatbots',
    {
      title: 'Lista chatbotova',
      description:
        'Vraca sve chatbotove na AiChatBot.rs nalogu korisnika: id, naziv, kanale (sajt, WhatsApp, Viber, Instagram, Telegram, Facebook) i status. Pozovi ovo prvo da bi dobio chatbot_id za ostale alate.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    wrap(() => api.listChatbots(ctx))
  );

  server.registerTool(
    'get_stats',
    {
      title: 'Statistika naloga',
      description:
        'Kljucni pokazatelji sa dashboarda: broj razgovora, broj leadova, procenat resenih bez operatera, raspodela po kategoriji, kanalu i sentimentu.',
      inputSchema: {
        period: z
          .enum(['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month'])
          .default('last_7_days')
          .describe('Vremenski period izvestaja.'),
        chatbot_id: z.string().optional().describe('Ogranici na jedan chatbot. Prazno = svi.'),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.getStats(ctx, a))
  );

  server.registerTool(
    'list_conversations',
    {
      title: 'Razgovori',
      description:
        'Lista skorasnjih razgovora sa filterima. Vraca sazetak bez celog transkripta - za transkript koristi get_conversation.',
      inputSchema: {
        chatbot_id: z.string().optional(),
        channel: z.enum(['web', 'whatsapp', 'viber', 'instagram', 'telegram', 'facebook']).optional(),
        category: z.string().optional().describe('Npr. prodaja, podrska, zakazivanje.'),
        sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
        has_lead: z.boolean().optional().describe('Samo razgovori u kojima je uhvacen lead.'),
        from: dateStr.optional().describe('Od datuma, YYYY-MM-DD.'),
        to: dateStr.optional().describe('Do datuma, YYYY-MM-DD.'),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.listConversations(ctx, a))
  );

  server.registerTool(
    'get_conversation',
    {
      title: 'Ceo razgovor',
      description: 'Vraca kompletan transkript jednog razgovora sa metapodacima (kanal, sentiment, lead).',
      inputSchema: {
        conversation_id: z.string().describe('ID razgovora iz list_conversations.'),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.getConversation(ctx, a.conversation_id))
  );

  server.registerTool(
    'list_leads',
    {
      title: 'Leadovi',
      description: 'Kontakti koje su chatbotovi prikupili (ime, email, telefon, izvor, razgovor iz kog poticu).',
      inputSchema: {
        chatbot_id: z.string().optional(),
        from: dateStr.optional(),
        to: dateStr.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.listLeads(ctx, a))
  );

  server.registerTool(
    'search_knowledge',
    {
      title: 'Pretraga baze znanja',
      description:
        'Pretrazuje dokumente iz kojih chatbot uci (PDF, sajt, tekst) i vraca najrelevantnije odlomke. Koristi kada treba proveriti sta bot zna o nekoj temi.',
      inputSchema: {
        chatbot_id: z.string().describe('ID chatbota ciju bazu znanja pretrazujemo.'),
        query: z.string().min(2).describe('Pojam ili pitanje.'),
        limit: z.number().int().min(1).max(20).default(5),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.searchKnowledge(ctx, a))
  );

  server.registerTool(
    'ask_chatbot',
    {
      title: 'Pitaj chatbota',
      description:
        'Postavlja pitanje chatbotu tacno onako kako bi ga postavio posetilac i vraca odgovor sa izvorima. Korisno za testiranje da li bot dobro odgovara.',
      inputSchema: {
        chatbot_id: z.string(),
        question: z.string().min(2),
      },
      annotations: { readOnlyHint: true },
    },
    wrap((a) => api.askChatbot(ctx, a))
  );

  if (!canWrite) return;

  server.registerTool(
    'add_knowledge',
    {
      title: 'Dodaj u bazu znanja',
      description:
        'Dodaje novi tekst ili URL u bazu znanja chatbota. Posle ovoga bot moze da odgovara na osnovu novog sadrzaja.',
      inputSchema: {
        chatbot_id: z.string(),
        title: z.string().min(2).describe('Naslov unosa, npr. "Cenovnik 2026".'),
        content: z.string().optional().describe('Tekst sadrzaja. Ili prosledi url.'),
        url: z.string().url().optional().describe('URL stranice koju bot treba da procita.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    wrap((a) => {
      if (!a.content && !a.url) throw new Error('Prosledi ili content ili url.');
      return api.addKnowledge(ctx, a);
    })
  );

  server.registerTool(
    'reply_to_conversation',
    {
      title: 'Odgovori u razgovoru',
      description:
        'Salje poruku korisniku u postojecem razgovoru, u ime operatera. PAZNJA: poruka stvarno stize krajnjem korisniku.',
      inputSchema: {
        conversation_id: z.string(),
        message: z.string().min(1).max(4000),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    wrap((a) => api.replyToConversation(ctx, a))
  );
}
