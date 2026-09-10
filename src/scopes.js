/**
 * Jedan server, tri nivoa pristupa.
 *
 * Scope je dozvola za grupu alata. Uloga (role) je gotov skup scope-ova
 * koji se upisuje u token pri generisanju.
 *
 * Nezavisno od scope-a vazi tvrdo pravilo izolacije:
 * alat koji NE ume da se ogranici na jedan nalog (tenantScoped: false)
 * dostupan je iskljucivo ulozi `owner`. Vidi src/tools/index.js.
 */

export const SCOPES = [
  'chatbots:read',        // lista botova, demo link
  'chatbots:write',       // pravljenje bota
  'chatbots:delete',      // brisanje bota
  'chatbots:chat',        // test razgovor kroz pravi engine
  'conversations:read',   // razgovori i transkripti
  'conversations:reply',  // slanje poruke krajnjem korisniku
  'knowledge:read',       // pretraga baze znanja
  'knowledge:write',      // dodavanje u bazu znanja
  'leads:read',           // leadovi sa sopstvenog naloga
  'leads:find',           // pronalazenje NOVIH firmi (OSM + enrichment)
  'contacts:read',        // newsletter baza
  'newsletter:send',      // slanje kampanje
  'demo:create',          // pravljenje demo bota od sajta
  'demo:send',            // slanje demo mejla
  'agents:run',           // Quantum agenti, AI TIM
  'stats:read',           // brojke
  'platform:read',        // read_table - sirovo citanje tabela
  'platform:invoke',      // invoke_platform_function - poziv bilo koje edge funkcije
];

/** Gotovi skupovi. Menjaj ovde, ne po alatima. */
export const ROLES = {
  /** Krajnji klijent: svoj nalog, samo citanje. */
  client: [
    'chatbots:read',
    'chatbots:chat',
    'conversations:read',
    'knowledge:read',
    'leads:read',
    'stats:read',
  ],

  /** Klijent kome ste odobrili i izmene na sopstvenom nalogu. */
  client_write: [
    'chatbots:read',
    'chatbots:chat',
    'conversations:read',
    'conversations:reply',
    'knowledge:read',
    'knowledge:write',
    'leads:read',
    'stats:read',
  ],

  /** Vasi prodavci i partneri: demo botovi i trazenje novih firmi. */
  sales: [
    'chatbots:read',
    'chatbots:write',
    'chatbots:chat',
    'conversations:read',
    'knowledge:read',
    'leads:read',
    'leads:find',
    'contacts:read',
    'demo:create',
    'demo:send',
    'stats:read',
  ],

  /** Vi. Sve, ukljucujuci sirovo citanje tabela i pozivanje edge funkcija. */
  owner: [...SCOPES],
};

export const ROLE_NAMES = Object.keys(ROLES);

/**
 * Stari tokeni nose scopes: ['read'] ili ['read','write'] bez uloge.
 * Prevodimo ih da postojeci linkovi ne prestanu da rade.
 */
export function normalizeGrant({ role, scopes }) {
  if (role && ROLES[role]) {
    return { role, scopes: new Set(ROLES[role]) };
  }
  const legacy = Array.isArray(scopes) ? scopes : [];
  if (legacy.includes('write')) return { role: 'client_write', scopes: new Set(ROLES.client_write) };
  if (legacy.length && legacy.every((s) => SCOPES.includes(s))) {
    return { role: 'custom', scopes: new Set(legacy) };
  }
  return { role: 'client', scopes: new Set(ROLES.client) };
}

export function can(ctx, scope) {
  return ctx.scopes.has(scope);
}

export function isOwner(ctx) {
  return ctx.role === 'owner';
}
