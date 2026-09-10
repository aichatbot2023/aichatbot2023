import { config } from './config.js';

/**
 * Mapa: naziv alata -> ime Supabase edge funkcije platforme.
 *
 * Ovo je JEDINO mesto koje treba prepraviti ako se kod vas funkcije
 * zovu drugacije. Moze i bez menjanja koda, preko EDGE_MAP_JSON:
 *
 *   EDGE_MAP_JSON='{"chat_with_bot":"bot-chat","find_leads":"lead-finder"}'
 */
const DEFAULT_EDGE_MAP = {
  chat_with_bot: 'chat-with-bot',
  create_chatbot_from_website: 'create-chatbot-from-website',
  delete_chatbot: 'delete-chatbot',
  get_demo_link: 'get-demo-link',
  send_demo_email: 'send-demo-email',
  find_leads: 'find-leads',
  enrich_leads: 'enrich-leads',
  verify_emails: 'verify-emails',
  research_company: 'research-company',
  list_contacts: 'list-contacts',
  send_newsletter: 'send-newsletter',
  run_agent_task: 'run-agent-task',
  get_agent_run: 'get-agent-run',
  ai_tim_command: 'ai-tim-command',
  platform_stats: 'platform-stats',
  read_table: 'read-table',
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
