import { z } from 'zod';
import { api } from './../api.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format mora biti YYYY-MM-DD');

/**
 * Podaci jednog naloga. Tenant se uvek uzima iz tokena (ctx), nikad iz argumenata,
 * pa Claude ne moze da ga podmetne.
 */
export const clientTools = [
  {
    name: 'list_chatbots',
    scope: 'chatbots:read',
    crossTenant: false,
    title: 'Lista chatbotova',
    description:
      'Vraca chatbotove na nalogu: id, naziv, kanale (sajt, WhatsApp, Viber, Instagram, Telegram, Facebook), status i jezik. Pozovi ovo prvo da bi dobio chatbot_id za ostale alate.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    handler: (ctx) => api.listChatbots(ctx),
  },
  {
    name: 'get_stats',
    scope: 'stats:read',
    crossTenant: false,
    title: 'Statistika naloga',
    description:
      'Pokazatelji sa dashboarda za ovaj nalog: broj razgovora, leadova, procenat resenih bez operatera, raspodela po kategoriji, kanalu i sentimentu.',
    inputSchema: {
      period: z
        .enum(['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month'])
        .default('last_7_days'),
      chatbot_id: z.string().optional().describe('Ogranici na jedan chatbot. Prazno = svi.'),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.getStats(ctx, a),
  },
  {
    name: 'list_conversations',
    scope: 'conversations:read',
    crossTenant: false,
    title: 'Razgovori',
    description:
      'Skorasnji razgovori sa filterima. Vraca sazetak bez transkripta - za transkript koristi get_conversation.',
    inputSchema: {
      chatbot_id: z.string().optional(),
      channel: z.enum(['web', 'whatsapp', 'viber', 'instagram', 'telegram', 'facebook']).optional(),
      category: z.string().optional().describe('Npr. prodaja, podrska, zakazivanje.'),
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
      has_lead: z.boolean().optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.listConversations(ctx, a),
  },
  {
    name: 'get_conversation',
    scope: 'conversations:read',
    crossTenant: false,
    title: 'Ceo razgovor',
    description: 'Kompletan transkript jednog razgovora sa metapodacima (kanal, sentiment, lead).',
    inputSchema: { conversation_id: z.string().describe('ID iz list_conversations.') },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.getConversation(ctx, a.conversation_id),
  },
  {
    name: 'list_leads',
    scope: 'leads:read',
    crossTenant: false,
    title: 'Leadovi sa naloga',
    description:
      'Kontakti koje su chatbotovi ovog naloga prikupili u razgovorima (ime, mejl, telefon, izvor, razgovor iz kog poticu). Za trazenje NOVIH firmi koristi find_leads.',
    inputSchema: {
      chatbot_id: z.string().optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.listLeads(ctx, a),
  },
  {
    name: 'search_knowledge',
    scope: 'knowledge:read',
    crossTenant: false,
    title: 'Pretraga baze znanja',
    description:
      'Pretrazuje dokumente iz kojih bot uci (PDF, sajt, tekst) i vraca najrelevantnije odlomke. Koristi kad treba proveriti sta bot zna o nekoj temi.',
    inputSchema: {
      chatbot_id: z.string(),
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).default(5),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.searchKnowledge(ctx, a),
  },
  {
    name: 'ask_chatbot',
    scope: 'knowledge:read',
    crossTenant: false,
    title: 'Pitaj chatbota (bez pisanja u istoriju)',
    description:
      'Postavlja pitanje botu i vraca odgovor sa izvorima, bez upisa u istoriju razgovora. Za pravi test razgovor kroz engine koristi chat_with_bot.',
    inputSchema: { chatbot_id: z.string(), question: z.string().min(2) },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.askChatbot(ctx, a),
  },
  {
    name: 'add_knowledge',
    scope: 'knowledge:write',
    crossTenant: false,
    write: true,
    title: 'Dodaj u bazu znanja',
    description: 'Dodaje tekst ili URL u bazu znanja bota. Posle ovoga bot odgovara i na osnovu novog sadrzaja.',
    inputSchema: {
      chatbot_id: z.string(),
      title: z.string().min(2).describe('Naslov unosa, npr. "Cenovnik 2026".'),
      content: z.string().optional().describe('Tekst sadrzaja. Ili prosledi url.'),
      url: z.string().url().optional().describe('URL stranice koju bot treba da procita.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (ctx, a) => {
      if (!a.content && !a.url) throw new Error('Prosledi ili content ili url.');
      return api.addKnowledge(ctx, a);
    },
  },
  {
    name: 'reply_to_conversation',
    scope: 'conversations:reply',
    crossTenant: false,
    write: true,
    title: 'Odgovori u razgovoru',
    description:
      'Salje poruku krajnjem korisniku u postojecem razgovoru, u ime operatera. PAZNJA: poruka stvarno stize korisniku.',
    inputSchema: { conversation_id: z.string(), message: z.string().min(1).max(4000) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    handler: (ctx, a) => api.replyToConversation(ctx, a),
  },
];
