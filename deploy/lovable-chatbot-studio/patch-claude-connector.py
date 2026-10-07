#!/usr/bin/env python3
"""
Dodaje uloge i scope-ove u postojeci claude-connector, bez prepisivanja.

    python3 patch-claude-connector.py \
        ../../../lovable-chatbot-studio/supabase/functions/claude-connector/index.ts \
        supabase/functions/claude-connector/index.ts

Netaknuti delovi ostaju bajt-identicni originalu. Ako posle azuriranja
originala skripta prijavi da marker nije nadjen, znaci da se taj deo promenio
i treba ga pogledati rucno - to je namerno, bolje da pukne nego da tiho promasi.
"""
import sys, pathlib

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
s = src.read_text(encoding='utf-8')
applied = []

def sub(marker, replacement, label):
    global s
    if marker not in s:
        raise SystemExit(f"GRESKA: marker nije nadjen -> {label}\n  trazio: {marker[:90]}")
    if s.count(marker) != 1:
        raise SystemExit(f"GRESKA: marker nije jedinstven ({s.count(marker)}x) -> {label}")
    s = s.replace(marker, replacement, 1)
    applied.append(label)

# ── 1. import + novi secret ─────────────────────────────────────────────────
sub(
"""const CONNECTOR_TOKEN = Deno.env.get('MCP_CONNECTOR_TOKEN') || '';""",
"""const CONNECTOR_TOKEN = Deno.env.get('MCP_CONNECTOR_TOKEN') || '';
// Tajna kojom se potpisuju klijentski linkovi (uloge client/client_write/sales).
// Razlicita od MCP_CONNECTOR_TOKEN: taj ostaje vas owner pristup.
const SIGNING_SECRET = Deno.env.get('MCP_SIGNING_SECRET') || '';""",
"import secreta")

sub(
"""import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';""",
"""import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { type Ctx, isOwner, resolveToken, AuthError } from './_scope.ts';""",
"import _scope")

# ── 2. tenant-aware vlasnik ─────────────────────────────────────────────────
sub(
"""async function ownerUserId(): Promise<string> {""",
"""/**
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

async function ownerUserId(): Promise<string> {""",
"tenant helperi")

# ── 3. mapa pristupa + filter alata ────────────────────────────────────────
sub(
"""// Katalog funkcija po proizvodima (ime → namena). Za invoke_platform_function.""",
"""/**
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

// Katalog funkcija po proizvodima (ime → namena). Za invoke_platform_function.""",
"mapa pristupa")

# ── 4. execTool prima ctx ──────────────────────────────────────────────────
sub(
"""async function execTool(name: string, args: any): Promise<unknown> {
  switch (name) {""",
"""async function execTool(name: string, args: any, ctx: Ctx): Promise<unknown> {
  // Druga brava: i da alat nekako procuri u listu, ovde se zaustavlja.
  if (!toolAllowed(name, ctx)) throw new Error(`Alat "${name}" nije dostupan za ovaj pristup.`);

  switch (name) {""",
"execTool ctx")

# ── 5. list_chatbots: filter po nalogu ─────────────────────────────────────
sub(
"""    case 'list_chatbots': {
      const { data, error } = await supabase.from('bots')
        .select('id, name, description, bot_status, language, is_public, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(args?.limit || 25, 100));""",
"""    case 'list_chatbots': {
      let q = supabase.from('bots')
        .select('id, name, description, bot_status, language, is_public, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(args?.limit || 25, 100));
      if (!isOwner(ctx)) q = q.eq('user_id', ctx.tenantId);
      const { data, error } = await q;""",
"list_chatbots filter")

# ── 6. novi bot ide pod nalog iz tokena ────────────────────────────────────
sub(
"""      const userId = await ownerUserId();
      const botName = args.name || gen.botName || 'Novi AI asistent';""",
"""      const userId = await effectiveUserId(ctx);
      const botName = args.name || gen.botName || 'Novi AI asistent';""",
"novi bot pod tenant")

# ── 7. provera vlasnistva bota ─────────────────────────────────────────────
sub(
"""    case 'chat_with_bot': {
      const sessionId = args.session_id""",
"""    case 'chat_with_bot': {
      await assertBotOwned(args.bot_id, ctx);
      const sessionId = args.session_id""",
"chat_with_bot owned")

sub(
"""    case 'get_demo_link': {
      const url = demoLink(args.bot_id);""",
"""    case 'get_demo_link': {
      await assertBotOwned(args.bot_id, ctx);
      const url = demoLink(args.bot_id);""",
"get_demo_link owned")

sub(
"""    case 'send_demo_email': {
      const { data: bot } = await supabase.from('bots').select('id, name').eq('id', args.bot_id).maybeSingle();""",
"""    case 'send_demo_email': {
      await assertBotOwned(args.bot_id, ctx);
      const { data: bot } = await supabase.from('bots').select('id, name').eq('id', args.bot_id).maybeSingle();""",
"send_demo_email owned")

# ── 8. novi klijentski alati ───────────────────────────────────────────────
sub(
"""    default:
      throw new Error(`Nepoznat alat: ${name}`);""",
"""    case 'list_conversations': {
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
      throw new Error(`Nepoznat alat: ${name}`);""",
"novi klijentski alati")

# ── 9. definicije novih alata u TOOLS ──────────────────────────────────────
sub(
"""// Katalog funkcija po proizvodima""",
"""TOOLS.push(
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

// Katalog funkcija po proizvodima""",
"nove definicije alata")

# ── 10. auth + rutiranje ───────────────────────────────────────────────────
sub(
"""  // Auth: ?token= mora da se poklopi sa MCP_CONNECTOR_TOKEN secretom.
  const url = new URL(req.url);
  if (!CONNECTOR_TOKEN || url.searchParams.get('token') !== CONNECTOR_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }""",
"""  // Auth: stari deljeni MCP_CONNECTOR_TOKEN (owner) ILI potpisan klijentski token.
  // Token moze da dodje iz ?token=, iz putanje /u/<token>, ili iz Authorization zaglavlja.
  const url = new URL(req.url);
  const fromPath = url.pathname.match(/\\/u\\/([^/]+)/)?.[1];
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
  }""",
"auth sa ulogama")

sub(
"""          instructions: 'Konektor za aichatbot.rs platformu: pravljenje AI chatbotova od sajta klijenta, testiranje razgovora, demo linkovi, slanje demo mejlova kontaktima, pronalaženje leadova i pokretanje Quantum AI agenata.',""",
"""          instructions: isOwner(ctx)
            ? 'Konektor za aichatbot.rs platformu (vlasnicki pristup): pravljenje AI chatbotova od sajta klijenta, testiranje razgovora, demo linkovi, slanje demo mejlova, pronalazenje leadova, Quantum agenti, newsletter i citanje tabela. Alati koji salju mejlove, brisu botove ili pozivaju edge funkcije menjaju produkciju — trazi potvrdu pre poziva.'
            : 'Konektor za AiChatBot.rs nalog korisnika. Svi podaci su ograniceni na ovaj nalog — drugi nalozi nisu dostupni. Pocni sa list_chatbots da dobijes bot_id. Odgovaraj na jeziku kojim ti se korisnik obraca.',""",
"instrukcije po ulozi")

sub(
"""      case 'tools/list':
        return rpcResult(id, { tools: TOOLS });""",
"""      case 'tools/list':
        return rpcResult(id, { tools: allowedTools });""",
"tools/list filtriran")

sub(
"""          const result = await execTool(toolName, args);""",
"""          const result = await execTool(toolName, args, ctx);""",
"tools/call ctx")

dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(s, encoding='utf-8')
print(f"Primenjeno {len(applied)} izmena:")
for a in applied:
    print(f"  - {a}")
print(f"\nUpisano: {dst}  ({len(s.splitlines())} linija)")
