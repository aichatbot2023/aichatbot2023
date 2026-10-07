import { z } from 'zod';
import { api } from './../api.js';
import { READABLE_TABLES } from './../platform-functions.js';

/**
 * Alati nad celom platformom. Svi su crossTenant: true, pa ih registar
 * daje ISKLJUCIVO ulozi `owner` - bez obzira na scope u tokenu.
 */
export const platformTools = [
  {
    name: 'platform_stats',
    needsPlatformDb: true,
    scope: 'stats:read',
    crossTenant: true,
    title: 'Brojke cele platforme',
    description:
      'Ukupno chatbotova, konverzacija, kontakata i agenata na celoj platformi. Za brojke jednog naloga koristi get_stats.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    handler: (ctx) => api.platformStats(ctx, {}),
  },
  {
    name: 'delete_chatbot',
    scope: 'chatbots:delete',
    crossTenant: true,
    write: true,
    title: 'Obrisi chatbot',
    description: 'Trajno brise chatbot po bot_id. Za ciscenje neuspelih demo botova. Nema povratka.',
    inputSchema: { bot_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: (ctx, a) => api.deleteChatbot(ctx, a),
  },
  {
    name: 'list_contacts',
    scope: 'contacts:read',
    crossTenant: true,
    title: 'Newsletter kontakti',
    description: 'Lista kontakata iz newsletter baze platforme (mejl, ime, tagovi).',
    inputSchema: {
      query: z.string().optional().describe('Pretraga po mejlu ili imenu.'),
      limit: z.number().int().min(1).max(500).default(50),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.listContacts(ctx, a),
  },
  {
    name: 'send_newsletter',
    scope: 'newsletter:send',
    crossTenant: true,
    write: true,
    title: 'Posalji newsletter',
    description:
      'Pravi i salje kampanju svim prijavljenim kontaktima ili samo onima sa datim tagovima. Slanje ide u pozadini, sa pracenjem po primaocu. PAZNJA: mejlovi stvarno odlaze.',
    inputSchema: {
      name: z.string().min(2).describe('Interni naziv kampanje.'),
      subject: z.string().min(2),
      html_content: z.string().min(10),
      tags: z.array(z.string()).optional().describe('Samo kontakti sa ovim tagovima. Prazno = svi.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    handler: (ctx, a) => api.sendNewsletter(ctx, a),
  },
  {
    name: 'run_agent_task',
    scope: 'agents:run',
    crossTenant: true,
    write: true,
    title: 'Pokreni agenta',
    description: 'Pokrece zadatak na Quantum AI agentu u pozadini. Vraca run_id - rezultat se uzima sa get_agent_run.',
    inputSchema: {
      task: z.string().min(3),
      agent_id: z.string().optional().describe('Prazno = poslednji agent.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (ctx, a) => api.runAgentTask(ctx, a),
  },
  {
    name: 'get_agent_run',
    scope: 'agents:run',
    crossTenant: true,
    title: 'Status agenta',
    description: 'Status i rezultat agent run-a po run_id iz run_agent_task.',
    inputSchema: { run_id: z.string() },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.getAgentRun(ctx, a),
  },
  {
    name: 'ai_tim_command',
    scope: 'agents:run',
    crossTenant: true,
    write: true,
    title: 'AI TIM',
    description:
      'Autonomni tim od 7 agenata: bootstrap (kreiraj tim), morning_plan (dnevni plan), evening_report (izvestaj), status (stanje tima).',
    inputSchema: {
      action: z.enum(['bootstrap', 'morning_plan', 'evening_report', 'status']),
      payload: z.record(z.any()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: (ctx, a) => api.aiTimCommand(ctx, a),
  },
  {
    name: 'read_table',
    needsPlatformDb: true,
    scope: 'platform:read',
    crossTenant: true,
    title: 'Citanje tabele',
    description: `Citanje podataka platforme, samo SELECT i samo sa bezbedne liste tabela: ${READABLE_TABLES.join(', ')}.`,
    inputSchema: {
      table: z.enum(READABLE_TABLES),
      filter_column: z.string().optional(),
      filter_value: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(50),
    },
    annotations: { readOnlyHint: true },
    handler: (ctx, a) => api.readTable(ctx, a),
  },
  {
    name: 'invoke_platform_function',
    scope: 'platform:invoke',
    crossTenant: true,
    write: true,
    title: 'Pozovi edge funkciju',
    description:
      'Univerzalni alat: poziva bilo koju edge funkciju platforme po imenu, sa JSON telom. Pokriva sve proizvode. Zaobilazi proveru argumenata pojedinacnih alata - koristi ga samo kad nema namenskog alata.',
    inputSchema: {
      function_name: z.string().min(2),
      payload: z.record(z.any()).default({}),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    handler: (ctx, a) => api.invokeFunction(ctx, a),
  },
];
