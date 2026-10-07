// claude-connector — MCP server za claude.ai (custom connector).
// Claude preko ovoga radi posao u platformi: pravi chatbotove, ćaska sa njima,
// nalazi leadove, šalje demo mejlove, pokreće Quantum agente...
//
// Protokol: MCP Streamable HTTP (stateless JSON-RPC 2.0 preko POST).
// Auth: tajni token u URL-u (?token=...) upoređen sa MCP_CONNECTOR_TOKEN
// secretom. U claude.ai se dodaje kao Custom Connector sa URL-om:
//   https://<projekat>.supabase.co/functions/v1/claude-connector?token=<TOKEN>
// Bez važećeg tokena sve vraća 401. Ključevi/secrets se nikad ne vraćaju.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { type Ctx, isOwner, resolveToken, AuthError } from './_scope.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONNECTOR_TOKEN = Deno.env.get('MCP_CONNECTOR_TOKEN') || '';
// Tajna kojom se potpisuju klijentski linkovi (uloge client/client_write/sales).
// Razlicita od MCP_CONNECTOR_TOKEN: taj ostaje vas owner pristup.
const SIGNING_SECRET = Deno.env.get('MCP_SIGNING_SECRET') || '';
const SITE_ORIGIN = 'https://aichatbot.rs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

async function callFn(name: string, body: unknown): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  try { return JSON.parse(raw); } catch { return { raw: raw.slice(0, 2000), status: resp.status }; }
}

/**
 * Pod kojim nalogom alat radi.
 *
 * Za klijentski token to je UVEK nalog iz tokena - nikad iz argumenata,
 * pa Claude ne moze da ga podmetne. Za owner token vazi stara logika.
 */
async function effectiveUserId(ctx: Ctx): Promise<string> {
  if (!isOwner(ctx)) {
    if (!ctx.tenantId) throw new Error('Token ne nosi nalog.');
    return ctx.tenantId;
  }
  return await ownerUserId();
}

/** Bot mora da pripada nalogu iz tokena. Owner preskace proveru. */
async function assertBotOwned(botId: string, ctx: Ctx): Promise<void> {
  if (isOwner(ctx)) return;
  if (!botId) throw new Error('bot_id je obavezan.');
  const { data, error } = await supabase.from('bots').select('id').eq('id', botId).eq('user_id', ctx.tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Bot nije pronadjen na ovom nalogu.');
}

/** Id-jevi botova naloga - za filtriranje tabela koje nemaju user_id. */
async function tenantBotIds(ctx: Ctx): Promise<string[]> {
  const { data, error } = await supabase.from('bots').select('id').eq('user_id', ctx.tenantId);
  if (error) throw new Error(error.message);
  return (data || []).map((b) => b.id);
}

async function ownerUserId(): Promise<string> {
  const configured = Deno.env.get('MCP_OWNER_USER_ID');
  if (configured) return configured;
  const { data } = await supabase.from('bots').select('user_id').order('created_at', { ascending: false }).limit(1);
  if (data?.[0]?.user_id) return data[0].user_id;
  throw new Error('Nije moguće odrediti vlasnika — postavi MCP_OWNER_USER_ID secret.');
}

const demoLink = (botId: string) => `${SITE_ORIGIN}/widget/${botId}`;

// ── Alati ────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_chatbots',
    description: 'Lista AI chatbotova na platformi (ime, status, jezik, demo link).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max broj (podrazumevano 25)' } } },
  },
  {
    name: 'create_chatbot_from_website',
    description: 'Napravi novi AI chatbot analizom sajta klijenta: skenira sajt, generiše ime, instrukcije, avatar i boje brenda, pa kreira bota. Vraća bot_id i demo link.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL sajta klijenta' }, name: { type: 'string', description: 'Ime bota (opciono, inače generisano)' }, language: { type: 'string', description: "Jezik ('auto' podrazumevano)" } }, required: ['url'] },
  },
  {
    name: 'chat_with_bot',
    description: 'Pošalji poruku chatbotu i dobij odgovor (test razgovor kroz pravi engine).',
    inputSchema: { type: 'object', properties: { bot_id: { type: 'string' }, message: { type: 'string' }, session_id: { type: 'string', description: 'Opciono — nastavak iste sesije' } }, required: ['bot_id', 'message'] },
  },
  {
    name: 'get_demo_link',
    description: 'Vrati javni demo link i embed kod za chatbot.',
    inputSchema: { type: 'object', properties: { bot_id: { type: 'string' } }, required: ['bot_id'] },
  },
  {
    name: 'send_demo_email',
    description: 'Pošalji mejl sa demo linkom gotovog chatbota na adresu kontakta (koristi email konfiguraciju bota).',
    inputSchema: { type: 'object', properties: { bot_id: { type: 'string' }, to: { type: 'string', description: 'Email primaoca' }, subject: { type: 'string' }, message_html: { type: 'string', description: 'Opciono telo (HTML); inače standardni demo mejl' }, recipient_name: { type: 'string' } }, required: ['bot_id', 'to'] },
  },
  {
    name: 'find_leads',
    description: 'PRONAĐI PRAVE FIRME (Clay-model): traži u OpenStreetMap bazi realnih firmi po delatnosti + lokaciji, pa waterfall-om obogaćuje svaku (sajt → kontakt strana → mejl → MX verifikacija → telefon → društvene mreže) i skoruje je. Neograničeno mesečno, bez izmišljanja. Za "restorani u Beogradu", "stomatolozi Novi Sad", "hoteli Zlatibor" itd.',
    inputSchema: {
      type: 'object',
      properties: {
        industry: { type: 'string', description: 'Delatnost, npr. "restoran", "stomatolog", "hotel", "advokat"' },
        location: { type: 'string', description: 'Grad/opština/regija, npr. "Beograd", "Novi Sad", "Zlatibor"' },
        limit: { type: 'number', description: 'Koliko leadova (max 50, podrazumevano 20)' },
        research: { type: 'string', description: 'Opciono AI pitanje o svakoj firmi (odgovara SAMO iz njenog sajta), npr. "Da li imaju online rezervacije?"' },
        require_email: { type: 'boolean', description: 'Vrati samo firme sa pronađenim mejlom' },
        require_website: { type: 'boolean', description: 'Vrati samo firme sa sajtom' },
      },
      required: ['industry', 'location'],
    },
  },
  {
    name: 'enrich_leads',
    description: 'Obogati postojeće leadove Clay waterfall-om: nađe mejl (sajt → kontakt strana → Hunter ako ima ključ → obrazac + MX provera), telefon, društvene mreže, i skoruje. Ulaz: lista {company_name, website}.',
    inputSchema: { type: 'object', properties: { leads: { type: 'array', items: { type: 'object' }, description: 'Lista objekata sa company_name i website' }, research: { type: 'string' } }, required: ['leads'] },
  },
  {
    name: 'verify_emails',
    description: 'Proveri mejl adrese (sintaksa + MX zapis + disposable domeni) pre slanja — smanjuje bounce.',
    inputSchema: { type: 'object', properties: { emails: { type: 'array', items: { type: 'string' } } }, required: ['emails'] },
  },
  {
    name: 'research_company',
    description: 'AI istraživanje firme (Claygent): odgovara na pitanje ISKLJUČIVO iz sadržaja njenog sajta, bez izmišljanja.',
    inputSchema: { type: 'object', properties: { website: { type: 'string' }, question: { type: 'string' } }, required: ['website', 'question'] },
  },
  {
    name: 'list_contacts',
    description: 'Lista kontakata iz newsletter baze (email, ime, tagovi).',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Pretraga po emailu/imenu' }, limit: { type: 'number' } } },
  },
  {
    name: 'run_agent_task',
    description: 'Pokreni zadatak na Quantum AI agentu platforme (u pozadini). Vraća run_id — rezultat se uzima sa get_agent_run.',
    inputSchema: { type: 'object', properties: { task: { type: 'string' }, agent_id: { type: 'string', description: 'Opciono — inače poslednji agent' } }, required: ['task'] },
  },
  {
    name: 'get_agent_run',
    description: 'Status/rezultat agent run-a po run_id (iz run_agent_task).',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
  },
  {
    name: 'platform_stats',
    description: 'Brojke platforme: chatbotovi, konverzacije, kontakti, agenti.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_chatbot',
    description: 'Trajno obriši chatbot po bot_id (za čišćenje neuspelih demo botova).',
    inputSchema: { type: 'object', properties: { bot_id: { type: 'string' } }, required: ['bot_id'] },
  },
  {
    name: 'list_platform_functions',
    description: 'Katalog SVIH funkcija platforme po proizvodima (chatbotovi, knowledge base, leadovi/prodaja, newsletter, email, agenti, AI TIM, avatari/glas, kursevi, sastanci, e-commerce...). Koristi pre invoke_platform_function.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'invoke_platform_function',
    description: 'Univerzalni alat: pozovi BILO KOJU edge funkciju platforme po imenu sa JSON payload-om (pokriva sve proizvode). Prvo pogledaj list_platform_functions za imena i namenu.',
    inputSchema: { type: 'object', properties: { function_name: { type: 'string' }, payload: { type: 'object', description: 'JSON telo zahteva' } }, required: ['function_name'] },
  },
  {
    name: 'read_table',
    description: 'Čitanje podataka platforme (samo SELECT, bezbedna lista tabela): bots, conversations, newsletter_campaigns/contacts/sends, agent_instances/runs/tasks/events, workflow_runs, platform_conversations.',
    inputSchema: { type: 'object', properties: { table: { type: 'string' }, filter_column: { type: 'string' }, filter_value: { type: 'string' }, limit: { type: 'number' } }, required: ['table'] },
  },
  {
    name: 'ai_tim_command',
    description: 'AI TIM (autonomni tim od 7 agenata): bootstrap (kreiraj tim), morning_plan (dnevni plan), evening_report (izveštaj), status (stanje tima).',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['bootstrap', 'morning_plan', 'evening_report', 'status'] }, payload: { type: 'object' } }, required: ['action'] },
  },
  {
    name: 'send_newsletter',
    description: 'Napravi i pošalji newsletter kampanju svim prijavljenim kontaktima (ili po tagovima). Slanje ide u pozadini sa praćenjem po primaocu.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, subject: { type: 'string' }, html_content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' }, description: 'Opciono — samo kontakti sa ovim tagovima' } }, required: ['name', 'subject', 'html_content'] },
  },
];

/**
 * Koji alat trazi koji scope, i da li ume da se ogranici na jedan nalog.
 *
 * crossTenant: true  = alat cita ili menja podatke CELE platforme
 *                      -> dostupan iskljucivo ulozi owner, i kad bi token
 *                         nekako dobio odgovarajuci scope.
 *
 * Zato dodavanje dozvole klijentu ne moze slucajno da otvori tudje podatke.
 * Alat koji nije u ovoj mapi tretira se kao crossTenant (owner-only) -
 * novi alat je zatvoren dok mu se svesno ne odredi pristup.
 */
const TOOL_ACCESS: Record<string, { scope: string; crossTenant?: boolean }> = {
  // nalog klijenta
  list_chatbots: { scope: 'chatbots:read' },
  chat_with_bot: { scope: 'chatbots:chat' },
  get_demo_link: { scope: 'chatbots:read' },
  list_conversations: { scope: 'conversations:read' },
  get_conversation: { scope: 'conversations:read' },
  get_stats: { scope: 'stats:read' },
  // prodaja - spoljni izvori, ne otkrivaju tudje podatke
  create_chatbot_from_website: { scope: 'demo:create' },
  send_demo_email: { scope: 'demo:send' },
  find_leads: { scope: 'leads:find' },
  enrich_leads: { scope: 'leads:find' },
  verify_emails: { scope: 'leads:find' },
  research_company: { scope: 'leads:find' },
  // cela platforma - samo owner
  platform_stats: { scope: 'stats:read', crossTenant: true },
  delete_chatbot: { scope: 'chatbots:delete', crossTenant: true },
  list_contacts: { scope: 'contacts:read', crossTenant: true },
  send_newsletter: { scope: 'newsletter:send', crossTenant: true },
  run_agent_task: { scope: 'agents:run', crossTenant: true },
  get_agent_run: { scope: 'agents:run', crossTenant: true },
  ai_tim_command: { scope: 'agents:run', crossTenant: true },
  read_table: { scope: 'platform:read', crossTenant: true },
  list_platform_functions: { scope: 'platform:invoke', crossTenant: true },
  invoke_platform_function: { scope: 'platform:invoke', crossTenant: true },
};

function toolAllowed(name: string, ctx: Ctx): boolean {
  const access = TOOL_ACCESS[name];
  if (!access) return isOwner(ctx); // nepoznat alat = zatvoren
  if (access.crossTenant && !isOwner(ctx)) return false;
  return ctx.scopes.has(access.scope);
}

const toolsFor = (ctx: Ctx) => TOOLS.filter((t) => toolAllowed(t.name, ctx));

TOOLS.push(
  {
    name: 'list_conversations',
    description: 'Razgovori na nalogu, najnoviji prvi. Vraca sazetak bez punog transkripta — za transkript koristi get_conversation.',
    inputSchema: { type: 'object', properties: { bot_id: { type: 'string' }, has_lead: { type: 'boolean', description: 'Samo razgovori u kojima je uhvacen lead' }, from: { type: 'string', description: 'Od datuma YYYY-MM-DD' }, to: { type: 'string', description: 'Do datuma YYYY-MM-DD' }, limit: { type: 'number' } } },
  },
  {
    name: 'get_conversation',
    description: 'Ceo razgovor sa porukama i podacima o leadu.',
    inputSchema: { type: 'object', properties: { conversation_id: { type: 'string' } }, required: ['conversation_id'] },
  },
  {
    name: 'get_stats',
    description: 'Brojke za nalog: botovi, razgovori i leadovi u periodu. Za brojke cele platforme postoji platform_stats.',
    inputSchema: { type: 'object', properties: { period: { type: 'string', enum: ['today', 'last_7_days', 'last_30_days'] } } },
  },
);

// Katalog funkcija po proizvodima (ime → namena). Za invoke_platform_function.
const FUNCTION_CATALOG: Record<string, string> = {
  // Chatbotovi
  'proxy-ai': 'Chat sa botom {bot_id, session_id, messages[]} — glavni engine',
  'auto-generate-assistant': 'Generiši bota od sajta {url, language}',
  'widget-config': 'Konfiguracija widgeta za bota',
  'analyze-conversation': 'Analiza razgovora (sentiment, teme)',
  'export-conversations': 'Izvoz razgovora bota',
  'run-bot-evals': 'Automatski testovi kvaliteta bota',
  // Knowledge base
  'enhanced-web-scraper': 'Skeniranje sajta u knowledge base',
  'extract-document': 'OCR/ekstrakcija PDF-a i slika',
  'chunk-document': 'Seckanje dokumenta za RAG',
  'kb-embed': 'Embedovanje knowledge base (pgvector)',
  'rag-query': 'RAG pretraga znanja {query, botId}',
  // Leadovi i prodaja
  'lead-discovery': 'Leadovi: {action: discover_leads|generate_outreach|score_lead|generate_followup|search_triggers...}',
  'outreach-agent': 'Autonomni outreach agent',
  'sales-crew-execute': 'Prodajni tim agenata (crew)',
  'sales-morning-brief': 'Jutarnji prodajni brifing',
  'proactive-outreach': 'Proaktivne poruke posetiocima',
  'precise-product-search': 'Precizna pretraga proizvoda',
  // Newsletter i email
  'send-newsletter': 'Pošalji kampanju {campaignId}',
  'newsletter-import-contacts': 'Uvoz kontakata {contacts[]}',
  'send-bot-email': 'Mejl kroz email konfiguraciju bota {botId, to, subject, html}',
  'mail-agent': 'AI mail agent {action: check_inbox|process_email|send_approved}',
  'send-contact-email': 'Kontakt forma mejl',
  // Quantum agenti
  'agent-execute': 'Pokreni agenta {agent_id, task, background:true}',
  'agent-background-worker': 'Red zadataka {action: create_task|process_queue|save_memory|search_memory}',
  'agent-orchestrator': 'Multi-step sesije {action: create_session|get_session|process_queue}',
  'agent-schedule-runner': 'Cron tick za rasporede/workflow-e',
  // AI TIM
  'ai-tim-direktor': 'Direktor tima {action: bootstrap|morning_plan|evening_report|status}',
  'ai-tim-radnik': 'Radnik tima {action: process|cron_morning|cron_evening}',
  // Avatari i glas
  'avatar-video': 'Talking-head video od slike+teksta',
  'generate-ai-avatar': 'Generiši avatar sliku {style, companyName, brandColor}',
  'd-id-talk': 'D-ID live avatar {action: list-presenters|create-stream...}',
  'elevenlabs-voice-agent': 'Glasovni agent (ElevenLabs/OpenAI realtime)',
  'openai-tts': 'Tekst u govor', 'voice-tts': 'TTS za bota', 'detect-emotion': 'Detekcija emocija u poruci',
  // Kursevi (LMS)
  'generate-lesson-quiz': 'Generiši kviz za lekciju',
  'issue-certificate': 'Izdaj sertifikat polazniku',
  'create-student-account': 'Nalog za polaznika',
  'course-checkout': 'Naplata kursa',
  // Sastanci i termini
  'meeting-ai': 'AI beleške/sažetak sastanka',
  'new-appointment': 'Zakazivanje termina',
  // E-commerce i naplata
  'create-checkout': 'Stripe checkout', 'get-products': 'Lista proizvoda',
  'product-sync': 'Sinhronizacija proizvoda iz prodavnice', 'ecommerce-gateway': 'E-commerce integracije', 'b2b-catalog': 'B2B katalog',
  // Alati i sadržaj
  'generate-landing-page': 'Generiši landing stranicu',
  'generate-document': 'Generiši dokument', 'analyze-website': 'Analiza sajta',
  'ai-visibility-audit': 'AI vidljivost brenda (GEO audit)', 'scrape-competitor': 'Analiza konkurencije', 'search-engine': 'Web pretraga',
  'hotel-guest-automation': 'Hotel automatizacije', 'demo-majstor': 'Demo majstor', 'meeting-ai ': 'AI sastanci',
};

// Funkcije koje konektor NIKAD ne poziva (vraćaju/upravljaju tajnama).
const FUNCTION_BLOCKLIST = new Set(['get-openai-key', 'store-openai-key', 'claude-connector', 'google-oauth-callback', 'stripe-event-webhook']);

const READABLE_TABLES = new Set(['bots', 'conversations', 'newsletter_campaigns', 'newsletter_contacts', 'newsletter_sends', 'agent_instances', 'agent_runs', 'agent_tasks', 'agent_events', 'workflow_runs', 'platform_conversations']);

async function execTool(name: string, args: any, ctx: Ctx): Promise<unknown> {
  // Druga brava: i da alat nekako procuri u listu, ovde se zaustavlja.
  if (!toolAllowed(name, ctx)) throw new Error(`Alat "${name}" nije dostupan za ovaj pristup.`);

  switch (name) {
    case 'list_chatbots': {
      let q = supabase.from('bots')
        .select('id, name, description, bot_status, language, is_public, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(args?.limit || 25, 100));
      if (!isOwner(ctx)) q = q.eq('user_id', ctx.tenantId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []).map((b) => ({ ...b, demo_link: demoLink(b.id) }));
    }

    case 'create_chatbot_from_website': {
      const gen = await callFn('auto-generate-assistant', { url: args.url, language: args.language || 'auto' });
      if (!gen?.botName && !gen?.instructions) throw new Error(`Analiza sajta nije uspela: ${JSON.stringify(gen).slice(0, 300)}`);
      const userId = await effectiveUserId(ctx);
      const botName = args.name || gen.botName || 'Novi AI asistent';
      const lang = gen.websiteData?.detectedLanguage || args.language || 'sr';
      const primary = gen.primaryColor || '#6d28d9';

      // Avatar je obavezan za widget — ako analiza sajta nije dala sliku,
      // generiši je posebno (generate-ai-avatar vraća imageUrl).
      // dicebear inicijali NISU pravi avatar — tretiraj kao da ga nema
      let avatarUrl: string | null = (gen.avatarUrl && !String(gen.avatarUrl).includes('dicebear.com')) ? gen.avatarUrl : null;
      if (!avatarUrl) {
        try {
          const av = await callFn('generate-ai-avatar', { style: 'realistic', companyName: botName, brandColor: primary });
          avatarUrl = av?.imageUrl || av?.imageData || null;
        } catch (_) { /* bez avatara je bolje nego pukao alat */ }
      }

      const welcome = String(lang).startsWith('sr')
        ? `👋 Dobrodošli! Ja sam ${botName} — tu sam da odgovorim na sva vaša pitanja. Kako mogu da pomognem?`
        : `👋 Welcome! I'm ${botName} — here to answer all your questions. How can I help?`;

      // DIZAJN ŠABLON: Tesla/KiBOST bot — svi novi botovi dobijaju isti format
      // widgeta (dizajn sekcija), a generisani sadržaj (prompt/boje/welcome)
      // prepisuje samo svoja polja preko šablona.
      let tpl: Record<string, unknown> = {};
      try {
        const { data: t } = await supabase.from('bots').select('config').eq('id', '431b8773-54d2-48e5-9515-20ea666d22db').maybeSingle();
        tpl = (t?.config as Record<string, unknown>) || {};
      } catch (_) { /* bez šablona */ }

      const { data: bot, error } = await supabase.from('bots').insert({
        user_id: userId,
        name: botName,
        description: gen.description || null,
        language: lang,
        logo_url: avatarUrl,
        data_source_type: 'website',
        data_source_value: args.url,
        is_public: true,
        bot_status: 'active',
        config: {
          ...tpl, // dizajn format kao Tesla primer; polja ispod prepisuju svoje
          // FIX: chat engine (proxy-ai) čita customPrompt — ranije je upisivan
          // samo systemPrompt pa je bot ćaskao BEZ instrukcija/znanja sajta.
          customPrompt: gen.instructions,
          systemPrompt: gen.instructions,
          welcomeMessage: welcome,
          model: 'google/gemini-2.5-flash',
          temperature: 0.4,
          useKnowledgeBase: true,
          primaryColor: primary,
          secondaryColor: gen.secondaryColor || '#F3F4F6',
          avatar: avatarUrl,
          brand: { colors: gen.brandColors, fonts: gen.fonts, industry: gen.websiteData?.industry },
        } as any,
      }).select('id, name').single();
      if (error) throw new Error(error.message);
      return { bot_id: bot.id, name: bot.name, demo_link: demoLink(bot.id), avatar: avatarUrl, website: gen.websiteData, note: 'Bot kreiran sa instrukcijama sa sajta, welcome porukom, avatarom i bojama brenda. Testiraj sa chat_with_bot.' };
    }

    case 'chat_with_bot': {
      await assertBotOwned(args.bot_id, ctx);
      const sessionId = args.session_id || `mcp-${crypto.randomUUID()}`;
      const resp = await callFn('proxy-ai', { bot_id: args.bot_id, session_id: sessionId, messages: [{ role: 'user', content: args.message }] });
      return { reply: resp?.choices?.[0]?.message?.content || resp?.error || '(bez odgovora)', session_id: sessionId };
    }

    case 'get_demo_link': {
      await assertBotOwned(args.bot_id, ctx);
      const url = demoLink(args.bot_id);
      return { demo_link: url, autoopen_link: `${url}?autoOpen=true`, embed_code: `<script src="${SITE_ORIGIN}/widget-loader.js" data-bot-id="${args.bot_id}" async></script>` };
    }

    case 'send_demo_email': {
      await assertBotOwned(args.bot_id, ctx);
      const { data: bot } = await supabase.from('bots').select('id, name').eq('id', args.bot_id).maybeSingle();
      if (!bot) throw new Error('Bot nije pronađen.');
      const link = demoLink(bot.id);
      // ČISTI LINKOVI: skini google redirect omotače (google.com/url?q=...) —
      // u mejlu sme da stoji SAMO direktan URL, ništa ispred njega.
      const unwrapGoogle = (s: string) => s.replace(
        /https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?[^"'\s<>]*?[?&]q=([^&"'\s<>]+)[^"'\s<>]*/gi,
        (_m, q) => { try { return decodeURIComponent(q); } catch { return q; } },
      );
      if (args.message_html) args.message_html = unwrapGoogle(String(args.message_html));
      const html = args.message_html || `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="color:#111;">Vaš AI asistent je spreman 🎉</h2>
          <p>Pozdrav${args.recipient_name ? ` ${args.recipient_name}` : ''},</p>
          <p>Pripremili smo demo AI chatbota <strong>${bot.name}</strong> za vas. Isprobajte ga uživo — odgovara na pitanja vaših kupaca 24/7:</p>
          <p style="margin:24px 0;"><a href="${link}" style="background:#6d28d9;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Isprobaj demo →</a></p>
          <p>Ili otvorite link: <a href="${link}">${link}</a></p>
          <p style="color:#666;font-size:13px;">AiChatBot.rs — AI chatbotovi bez kodiranja</p>
        </div>`;
      const resp = await callFn('send-bot-email', { botId: args.bot_id, to: args.to, subject: args.subject || `Vaš AI chatbot demo — ${bot.name}`, html, text: `Demo vašeg AI chatbota: ${link}` });
      if (resp?.success === false || resp?.error) throw new Error(`Slanje nije uspelo: ${resp?.error || JSON.stringify(resp).slice(0, 200)} (proveri email konfiguraciju bota u Builderu)`);
      return { sent: true, to: args.to, demo_link: link };
    }

    case 'find_leads': {
      // Clay-model: prave firme iz OSM baze + waterfall obogaćivanje.
      const resp = await callFn('lead-engine', {
        action: 'discover_and_enrich',
        industry: args.industry,
        location: args.location || args.product || 'Beograd',
        limit: Math.min(args.limit || args.count || 20, 50),
        research: args.research,
        require_email: args.require_email === true,
        require_website: args.require_website === true,
      });
      if (resp?.error) throw new Error(resp.error);
      return resp;
    }

    case 'enrich_leads': {
      const resp = await callFn('lead-engine', { action: 'enrich', leads: args.leads, research: args.research });
      if (resp?.error) throw new Error(resp.error);
      return resp;
    }

    case 'verify_emails': {
      const resp = await callFn('lead-engine', { action: 'verify_email', emails: args.emails });
      if (resp?.error) throw new Error(resp.error);
      return resp;
    }

    case 'research_company': {
      const resp = await callFn('lead-engine', { action: 'research', website: args.website, question: args.question });
      if (resp?.error) throw new Error(resp.error);
      return resp;
    }

    case 'list_contacts': {
      let q = supabase.from('newsletter_contacts').select('email, first_name, last_name, tags, subscribed').order('created_at', { ascending: false }).limit(Math.min(args?.limit || 25, 100));
      if (args?.query) q = q.or(`email.ilike.%${args.query}%,first_name.ilike.%${args.query}%,last_name.ilike.%${args.query}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    }

    case 'run_agent_task': {
      let agentId = args.agent_id;
      if (!agentId) {
        const { data } = await supabase.from('agent_instances').select('id').order('created_at', { ascending: false }).limit(1);
        agentId = data?.[0]?.id;
        if (!agentId) throw new Error('Nema nijednog agenta — napravi ga u Agent Builderu.');
      }
      const resp = await callFn('agent-execute', { agent_id: agentId, task: args.task, background: true, source: 'claude-connector', max_steps: 25 });
      if (!resp?.accepted) throw new Error(resp?.error || 'Agent nije prihvatio zadatak.');
      return { run_id: resp.run_id, agent_id: agentId, status: 'running', note: 'Proveri rezultat sa get_agent_run za ~30-120s.' };
    }

    case 'get_agent_run': {
      const { data, error } = await supabase.from('agent_runs').select('status, result, error, steps, tokens_used, duration_ms, created_at, completed_at').eq('id', args.run_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Run nije pronađen.');
      return data;
    }

    case 'platform_stats': {
      const cnt = async (table: string) => (await supabase.from(table).select('*', { count: 'exact', head: true })).count || 0;
      return { bots: await cnt('bots'), conversations: await cnt('conversations'), newsletter_contacts: await cnt('newsletter_contacts'), agents: await cnt('agent_instances') };
    }

    case 'delete_chatbot': {
      const { error } = await supabase.from('bots').delete().eq('id', args.bot_id);
      if (error) throw new Error(error.message);
      return { deleted: true, bot_id: args.bot_id };
    }

    case 'list_platform_functions':
      return FUNCTION_CATALOG;

    case 'invoke_platform_function': {
      const fnName = String(args.function_name || '').trim();
      if (!fnName || FUNCTION_BLOCKLIST.has(fnName)) throw new Error('Ova funkcija nije dostupna kroz konektor.');
      return await callFn(fnName, args.payload || {});
    }

    case 'read_table': {
      const table = String(args.table || '');
      if (!READABLE_TABLES.has(table)) throw new Error(`Tabela nije na dozvoljenoj listi: ${[...READABLE_TABLES].join(', ')}`);
      let q = supabase.from(table).select('*').limit(Math.min(args?.limit || 25, 100));
      if (args.filter_column && args.filter_value !== undefined) q = q.eq(String(args.filter_column), args.filter_value);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    }

    case 'ai_tim_command':
      return await callFn('ai-tim-direktor', { action: args.action, ...(args.payload || {}) });

    case 'send_newsletter': {
      const { data: camp, error } = await supabase.from('newsletter_campaigns').insert({
        name: args.name,
        subject: args.subject,
        html_content: args.html_content,
        status: 'draft',
        recipient_type: args.tags?.length ? 'tags' : 'all',
        recipient_tags: args.tags?.length ? args.tags : null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const resp = await callFn('send-newsletter', { campaignId: camp.id });
      if (resp?.error) throw new Error(resp.error);
      return { campaign_id: camp.id, queued: true, note: 'Slanje ide u pozadini — prati u Newsletter Monitoring-u ili preko read_table(newsletter_sends).' };
    }

    case 'list_conversations': {
      // conversations nema pouzdan user_id na svim redovima, pa filtriramo
      // preko bot_id-jeva naloga - radi i za stare redove.
      let q = supabase.from('conversations')
        .select('id, bot_id, session_id, conversation_title, conversation_summary, status, message_count, lead_name, lead_email, lead_phone, started_at, last_message_at')
        .order('started_at', { ascending: false })
        .limit(Math.min(args?.limit || 20, 100));

      if (!isOwner(ctx)) {
        const ids = await tenantBotIds(ctx);
        if (!ids.length) return { conversations: [], note: 'Nalog nema nijednog bota.' };
        q = q.in('bot_id', args.bot_id && ids.includes(args.bot_id) ? [args.bot_id] : ids);
      } else if (args.bot_id) {
        q = q.eq('bot_id', args.bot_id);
      }

      if (args.has_lead === true) q = q.not('lead_email', 'is', null);
      if (args.from) q = q.gte('started_at', `${args.from}T00:00:00Z`);
      if (args.to) q = q.lte('started_at', `${args.to}T23:59:59Z`);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { conversations: data || [], count: data?.length || 0 };
    }

    case 'get_conversation': {
      const { data, error } = await supabase.from('conversations').select('*').eq('id', args.conversation_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Razgovor nije pronadjen.');
      if (!isOwner(ctx)) await assertBotOwned(String(data.bot_id || ''), ctx);
      return data;
    }

    case 'get_stats': {
      const ids = isOwner(ctx) ? null : await tenantBotIds(ctx);
      if (ids && !ids.length) return { bots: 0, conversations: 0, leads: 0, note: 'Nalog nema nijednog bota.' };

      const days = { today: 1, last_7_days: 7, last_30_days: 30 }[String(args?.period || 'last_7_days')] ?? 7;
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const count = async (withLead: boolean) => {
        let q = supabase.from('conversations').select('*', { count: 'exact', head: true }).gte('started_at', since);
        if (ids) q = q.in('bot_id', ids);
        if (withLead) q = q.not('lead_email', 'is', null);
        return (await q).count || 0;
      };

      return {
        period: args?.period || 'last_7_days',
        bots: ids ? ids.length : (await supabase.from('bots').select('*', { count: 'exact', head: true })).count || 0,
        conversations: await count(false),
        leads: await count(true),
      };
    }

    default:
      throw new Error(`Nepoznat alat: ${name}`);
  }
}

// ── MCP JSON-RPC sloj ────────────────────────────────────────────────────────
const rpcResult = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const rpcError = (id: unknown, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: stari deljeni MCP_CONNECTOR_TOKEN (owner) ILI potpisan klijentski token.
  // Token moze da dodje iz ?token=, iz putanje /u/<token>, ili iz Authorization zaglavlja.
  const url = new URL(req.url);
  const fromPath = url.pathname.match(/\/u\/([^/]+)/)?.[1];
  const authHeader = req.headers.get('authorization') || '';
  const fromHeader = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const rawToken = url.searchParams.get('token') || fromPath || fromHeader || '';

  let ctx: Ctx;
  try {
    ctx = await resolveToken(rawToken, { legacyToken: CONNECTOR_TOKEN, signingSecret: SIGNING_SECRET });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return new Response(JSON.stringify({ error: (e as Error).message || 'Unauthorized' }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Opoziv: dashboard upisuje hash u claude_connector_links.revoked_at.
  if (ctx.tokenHash) {
    const { data: link } = await supabase.from('claude_connector_links').select('revoked_at').eq('token_hash', ctx.tokenHash).maybeSingle();
    if (link?.revoked_at) {
      return new Response(JSON.stringify({ error: 'Pristup je opozvan. Generisi novi link u dashboardu.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const allowedTools = toolsFor(ctx);
  if (allowedTools.length === 0) {
    return new Response(JSON.stringify({ error: `Ovaj link (uloga "${ctx.role}") nema nijedan dozvoljen alat.` }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (req.method === 'GET') return new Response(null, { status: 405, headers: corsHeaders }); // stateless: bez SSE stream-a
  if (req.method === 'DELETE') return new Response(null, { status: 200, headers: corsHeaders });

  let msg: any;
  try { msg = await req.json(); } catch { return rpcError(null, -32700, 'Parse error'); }
  if (Array.isArray(msg)) return rpcError(null, -32600, 'Batch nije podržan');

  const { id, method, params } = msg || {};

  // Notifikacije (bez id) → 202 bez tela
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: corsHeaders });

  try {
    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: params?.protocolVersion || '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'aichatbot-rs-connector', version: '1.0.0' },
          instructions: isOwner(ctx)
            ? 'Konektor za aichatbot.rs platformu (vlasnicki pristup): pravljenje AI chatbotova od sajta klijenta, testiranje razgovora, demo linkovi, slanje demo mejlova, pronalazenje leadova, Quantum agenti, newsletter i citanje tabela. Alati koji salju mejlove, brisu botove ili pozivaju edge funkcije menjaju produkciju — trazi potvrdu pre poziva.'
            : 'Konektor za AiChatBot.rs nalog korisnika. Svi podaci su ograniceni na ovaj nalog — drugi nalozi nisu dostupni. Pocni sa list_chatbots da dobijes bot_id. Odgovaraj na jeziku kojim ti se korisnik obraca.',
        });
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: allowedTools });
      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};
        try {
          const result = await execTool(toolName, args, ctx);
          return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
        } catch (e: any) {
          return rpcResult(id, { content: [{ type: 'text', text: `Greška: ${e?.message || e}` }], isError: true });
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    return rpcError(id, -32603, e?.message || 'Internal error');
  }
});
