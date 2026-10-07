import { config } from './../config.js';
import { can, isOwner } from './../scopes.js';
import { clientTools } from './client.js';
import { salesTools } from './sales.js';
import { platformTools } from './platform.js';

export const ALL_TOOLS = [...clientTools, ...salesTools, ...platformTools];

/**
 * Alat vidi samo token koji ima odgovarajuci scope.
 *
 * Iznad scope-a stoji tvrdo pravilo izolacije:
 *   crossTenant: true  = alat cita ili menja podatke cele platforme,
 *                        ne ume da se ogranici na jedan nalog
 *                        -> dostupan iskljucivo ulozi `owner`,
 *                           i kad bi token nekako dobio scope.
 *
 * Zato dodavanje scope-a klijentu ne moze slucajno da otvori tudje podatke.
 */
export function visibleTools(ctx) {
  return ALL_TOOLS.filter((t) => {
    if (t.crossTenant && !isOwner(ctx)) return false;
    if (!can(ctx, t.scope)) return false;
    if (t.write && !config.allowWrite) return false;
    // Alati koji su direktni upiti u bazu platforme rade samo u edge verziji
    // konektora (deploy/lovable-chatbot-studio). Ovde se ne nude da lista
    // ne obecava sto server ne moze.
    if (t.needsPlatformDb) return false;
    return true;
  });
}

export function registerTools(server, ctx) {
  for (const t of visibleTools(ctx)) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema || {},
        annotations: t.annotations || {},
      },
      async (args) => {
        try {
          const data = await t.handler(ctx, args || {});
          return {
            content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Greska: ${err.message || String(err)}` }],
            isError: true,
          };
        }
      }
    );
  }
}
