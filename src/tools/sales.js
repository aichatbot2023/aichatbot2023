import { z } from 'zod';
import { api } from './../api.js';

/**
 * Prodajni alati. Rade nad jednim nalogom ili nad spoljnim izvorima
 * (OpenStreetMap, sajtovi firmi), pa ne mogu da otkriju tudje podatke.
 */
export const salesTools = [
  {
    name: 'chat_with_bot',
    scope: 'chatbots:chat',
    crossTenant: false,
    title: 'Test razgovor sa botom',
    description:
      'Posalji poruku chatbotu i dobij odgovor kroz pravi engine. Prosledi session_id da bi nastavio istu sesiju.',
    inputSchema: {
      bot_id: z.string(),
      message: z.string().min(1),
      session_id: z.string().optional().describe('Opciono - nastavak iste sesije.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (ctx, a) => api.chatWithBot(ctx, a),
  },
  {
    name: 'create_chatbot_from_website',
    scope: 'demo:create',
    crossTenant: false,
    write: true,
    title: 'Napravi bota od sajta',
    description:
      'Skenira sajt klijenta, generise ime, instrukcije, avatar i boje brenda, pa kreira bota. Vraca bot_id i demo link.',
    inputSchema: {
      url: z.string().url().describe('URL sajta klijenta.'),
      name: z.string().optional().describe('Ime bota. Prazno = generisano.'),
      language: z.string().default('auto'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (ctx, a) => api.createChatbotFromWebsite(ctx, a),
  },
  {
    name: 'get_demo_link',
    scope: 'demo:create',
    crossTenant: false,
    title: 'Demo link i embed kod',
    description: 'Vraca javni demo link i embed kod za chatbot.',
    inputSchema: { bot_id: z.string() },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.getDemoLink(ctx, a),
  },
  {
    name: 'send_demo_email',
    scope: 'demo:send',
    crossTenant: false,
    write: true,
    title: 'Posalji demo mejl',
    description:
      'Salje mejl sa demo linkom gotovog bota na adresu kontakta, koristeci email konfiguraciju bota. PAZNJA: mejl stvarno odlazi.',
    inputSchema: {
      bot_id: z.string(),
      to: z.string().email().describe('Mejl primaoca.'),
      recipient_name: z.string().optional(),
      subject: z.string().optional(),
      message_html: z.string().optional().describe('Telo u HTML-u. Prazno = standardni demo mejl.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    handler: (ctx, a) => api.sendDemoEmail(ctx, a),
  },
  {
    name: 'find_leads',
    scope: 'leads:find',
    crossTenant: false,
    title: 'Pronadji firme',
    description:
      'Trazi prave firme u OpenStreetMap bazi po delatnosti i lokaciji, pa svaku obogacuje waterfall-om (sajt -> kontakt strana -> mejl -> MX provera -> telefon -> drustvene mreze) i skoruje. Bez izmisljanja. Npr. "restorani u Beogradu", "stomatolozi Novi Sad".',
    inputSchema: {
      industry: z.string().describe('Delatnost, npr. restoran, stomatolog, hotel, advokat.'),
      location: z.string().describe('Grad, opstina ili regija, npr. Beograd, Novi Sad, Zlatibor.'),
      limit: z.number().int().min(1).max(50).default(20),
      require_email: z.boolean().optional().describe('Samo firme sa pronadjenim mejlom.'),
      require_website: z.boolean().optional().describe('Samo firme sa sajtom.'),
      research: z
        .string()
        .optional()
        .describe('AI pitanje o svakoj firmi, odgovor iskljucivo iz njenog sajta. Npr. "Da li imaju online rezervacije?"'),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.findLeads(ctx, a),
  },
  {
    name: 'enrich_leads',
    scope: 'leads:find',
    crossTenant: false,
    title: 'Obogati leadove',
    description:
      'Za postojecu listu firmi nalazi mejl, telefon i drustvene mreze i skoruje ih. Ulaz je lista objekata sa company_name i website.',
    inputSchema: {
      leads: z
        .array(z.object({ company_name: z.string(), website: z.string() }))
        .min(1)
        .max(100),
      research: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.enrichLeads(ctx, a),
  },
  {
    name: 'verify_emails',
    scope: 'leads:find',
    crossTenant: false,
    title: 'Proveri mejl adrese',
    description: 'Provera sintakse, MX zapisa i disposable domena pre slanja - smanjuje bounce.',
    inputSchema: { emails: z.array(z.string()).min(1).max(200) },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.verifyEmails(ctx, a),
  },
  {
    name: 'research_company',
    scope: 'leads:find',
    crossTenant: false,
    title: 'Istrazi firmu',
    description: 'Odgovara na pitanje o firmi iskljucivo iz sadrzaja njenog sajta, bez izmisljanja.',
    inputSchema: { website: z.string().url(), question: z.string().min(3) },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.researchCompany(ctx, a),
  },
];
