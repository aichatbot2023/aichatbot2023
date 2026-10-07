import { config } from './config.js';

/**
 * Mapa: naziv alata -> ime Supabase edge funkcije platforme.
 *
 * Ovo je JEDINO mesto koje treba prepraviti ako se kod vas funkcije
 * zovu drugacije. Moze i bez menjanja koda, preko EDGE_MAP_JSON:
 *
 *   EDGE_MAP_JSON='{"chat_with_bot":"bot-chat","find_leads":"lead-finder"}'
 */
/**
 * POTVRDJENO iz koda platforme (supabase/functions/claude-connector/index.ts
 * u repou aichatbot2023/lovable-chatbot-studio).
 *
 * Nekoliko alata NIJE prost poziv po imenu - treba im i oblik tela:
 *   chat_with_bot   -> proxy-ai   { bot_id, session_id, messages: [{role, content}] }
 *   find_leads      -> lead-engine { action: 'discover_and_enrich', industry, location, ... }
 *   enrich_leads    -> lead-engine { action: 'enrich', leads, research }
 *   verify_emails   -> lead-engine { action: 'verify_email', emails }
 *   research_company-> lead-engine { action: 'research', website, question }
 *   ai_tim_command  -> ai-tim-direktor { action, ...payload }
 *   run_agent_task  -> agent-execute { agent_id, task, background: true }
 *   send_demo_email -> send-bot-email { botId, to, subject, html, text }
 *
 * A ovi uopste ne idu kroz edge funkciju - oni su direktni upiti u Supabase:
 *   list_chatbots, list_contacts, read_table, platform_stats,
 *   get_agent_run, delete_chatbot
 *
 * Zato je preporuceni put deploy/lovable-chatbot-studio/ (patch nad postojecom
 * edge funkcijom), gde sve to vec radi. Vidi deploy/README.md.
 */
const DEFAULT_EDGE_MAP = {
  chat_with_bot: 'proxy-ai',
  create_chatbot_from_website: 'auto-generate-assistant',
  send_demo_email: 'send-bot-email',
  find_leads: 'lead-engine',
  enrich_leads: 'lead-engine',
  verify_emails: 'lead-engine',
  research_company: 'lead-engine',
  ai_tim_command: 'ai-tim-direktor',
  run_agent_task: 'agent-execute',
  send_newsletter: 'send-newsletter',
  generate_avatar: 'generate-ai-avatar',
};

let cached = null;

export function edgeMap() {
  if (cached) return cached;
  let override = {};
  if (config.edgeMapOverride) {
    try {
      override = JSON.parse(config.edgeMapOverride);
    } catch {
      throw new Error('EDGE_MAP_JSON nije validan JSON.');
    }
  }
  cached = { ...DEFAULT_EDGE_MAP, ...override };
  return cached;
}

export function edgeNameFor(tool) {
  const name = edgeMap()[tool];
  if (!name) throw new Error(`Nema edge funkcije mapirane za alat "${tool}".`);
  return name;
}

/** Tabele koje read_table sme da cita. Sve van ovoga se odbija. */
export const READABLE_TABLES = [
  'bots',
  'conversations',
  'platform_conversations',
  'newsletter_campaigns',
  'newsletter_contacts',
  'newsletter_sends',
  'agent_instances',
  'agent_runs',
  'agent_tasks',
  'agent_events',
  'workflow_runs',
];
