import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

/**
 * Nova instanca po zahtevu (stateless).
 * Jeftinije je i skalira bez deljene memorije - nema sesija koje treba cuvati.
 */
export function buildServer(ctx) {
  const server = new McpServer(
    { name: 'aichatbot-rs', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: [
        'Ovo je konektor za AiChatBot.rs nalog korisnika.',
        'Svi podaci su automatski ograniceni na nalog vlasnika konektora.',
        'Pocni sa list_chatbots da dobijes chatbot_id, pa onda koristi ostale alate.',
        'Odgovaraj na jeziku kojim ti se korisnik obraca.',
      ].join(' '),
    }
  );

  registerTools(server, ctx);
  return server;
}
