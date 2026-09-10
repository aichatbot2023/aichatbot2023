import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, visibleTools } from './tools/index.js';

/**
 * Nova instanca po zahtevu (stateless).
 * Jeftinije je i skalira bez deljene memorije - nema sesija koje treba cuvati.
 */
export function buildServer(ctx) {
  const server = new McpServer(
    { name: 'aichatbot-rs', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: instructionsFor(ctx),
    }
  );

  registerTools(server, ctx);
  return server;
}

function instructionsFor(ctx) {
  const base = [
    'Ovo je konektor za AiChatBot.rs platformu.',
    'Pocni sa list_chatbots da dobijes bot_id, pa onda koristi ostale alate.',
    'Odgovaraj na jeziku kojim ti se korisnik obraca.',
  ];

  if (ctx.role === 'owner') {
    base.push(
      'Token ima vlasnicki pristup celoj platformi.',
      'Alati koji salju mejlove (send_newsletter, send_demo_email), brisu botove ili pozivaju edge funkcije menjaju produkciju - trazi potvrdu pre poziva.'
    );
  } else {
    base.push(
      'Svi podaci su ograniceni na nalog vlasnika konektora - drugi nalozi nisu dostupni.',
      'get_stats daje brojke ovog naloga.'
    );
  }

  return base.join(' ');
}

export { visibleTools };
