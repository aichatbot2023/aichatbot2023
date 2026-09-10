# Šta backend AiChatBot.rs platforme treba da uradi

MCP server je tanak sloj. On **ne dira bazu** — samo poziva vaš postojeći backend.
Treba mu troje: tajna za tokene, servisni ključ i devet REST endpointa.

---

## 1. Generisanje tokena u dashboardu

Token je HMAC-potpisan JSON. Ne piše se u bazu (mada preporučujemo da čuvate
`sha256(token)` radi opoziva). Format:

```
v1.<base64url(payload)>.<base64url(hmac_sha256(payload, MCP_TOKEN_SECRET))>
```

Payload:

```json
{ "t": "tenant_id", "u": "user_id", "e": "mejl@firma.rs", "s": ["read"], "iat": 1789046605, "exp": 1820582605 }
```

### PHP

```php
function mint_mcp_token(string $tenantId, ?string $userId, ?string $email, array $scopes, int $ttlDays): string {
    $secret = getenv('MCP_TOKEN_SECRET');
    $now = time();
    $payload = array_filter([
        't'   => $tenantId,
        'u'   => $userId,
        'e'   => $email,
        's'   => $scopes ?: ['read'],
        'iat' => $now,
        'exp' => $ttlDays > 0 ? $now + $ttlDays * 86400 : null,
    ], fn($v) => $v !== null);

    $b64 = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $p   = $b64(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $sig = $b64(hash_hmac('sha256', $p, $secret, true));

    return "v1.$p.$sig";
}

// Link koji se prikazuje klijentu:
$token = mint_mcp_token($tenant->id, $user->id, $user->email, ['read'], 365);
$url   = "https://mcp.aichatbot.rs/u/$token/mcp";
```

### Node

```js
import { mintToken } from './src/auth.js';
const token = mintToken({ tenantId, userId, email, scopes: ['read'], ttlDays: 365 });
```

### Iz komandne linije (za brzi test)

```bash
MCP_TOKEN_SECRET=... node scripts/mint-token.mjs --tenant acme --user 42 --scopes read
```

> `MCP_TOKEN_SECRET` mora biti **ista vrednost** na platformi i na MCP serveru.
> Menjanje tajne obara sve postojeće linkove klijenata.

---

## 2. Servisna autentikacija

Svaki poziv ka vašem backendu nosi:

```
Authorization: Bearer <AICHATBOT_SERVICE_KEY>
X-Tenant-Id: <tenant iz tokena>
X-User-Id: <user iz tokena, opciono>
```

Backend proverava servisni ključ, pa **sam** ograničava upit na `X-Tenant-Id`.
Ni jedan alat ne prima tenant kao argument — Claude ne može da ga podmetne.

---

## 3. Endpointi

Sve putanje su konfigurabilne u `src/api.js` ako se kod vas zovu drugačije.

| Metod | Putanja | Vraća |
|---|---|---|
| GET | `/api/v1/chatbots` | `{ chatbots: [{ id, name, channels[], status, language }] }` |
| GET | `/api/v1/stats?period=&chatbot_id=` | `{ conversations, leads, resolved_without_agent_pct, by_category, by_channel, sentiment }` |
| GET | `/api/v1/conversations?chatbot_id=&channel=&category=&sentiment=&has_lead=&from=&to=&limit=` | `{ conversations: [...], total }` |
| GET | `/api/v1/conversations/:id` | ceo transkript + metapodaci |
| GET | `/api/v1/leads?chatbot_id=&from=&to=&limit=` | `{ leads: [{ name, email, phone, conversation_id, created_at, source }] }` |
| POST | `/api/v1/chatbots/:id/knowledge/search` | `{ results: [{ title, score, excerpt }] }` |
| POST | `/api/v1/chatbots/:id/ask` | `{ answer, sources[] }` |
| POST | `/api/v1/chatbots/:id/knowledge` | `{ ok, id, title }` |
| POST | `/api/v1/conversations/:id/reply` | `{ ok, delivered }` |

Poslednja dva rade samo kada je `MCP_ALLOW_WRITE=true` **i** token nosi scope `write`.

Redosled implementacije koji preporučujemo — prva tri pokrivaju 80% onoga
zbog čega klijenti traže konektor:

1. `/chatbots` 2. `/stats` 3. `/conversations` 4. `/leads` 5. ostalo

---

## 4. Opoziv tokena (preporučeno)

Postavite `MCP_REVOCATION_URL` na endpoint koji prima:

```json
POST { "token_hash": "<sha256 heks>" }
→ { "revoked": false }
```

MCP server kešira odgovor 60 sekundi. Kada klijent klikne „Opozovi",
upišete taj hash u tabelu povučenih tokena i link prestaje da radi u roku od minuta.

Bez ovog endpointa token važi do `exp` — u tom slučaju držite kratak TTL (npr. 90 dana).

---

## 5. Podizanje

```bash
cp .env.example .env      # popuni MCP_TOKEN_SECRET i AICHATBOT_SERVICE_KEY
docker compose up -d --build
```

Iza Nginx-a, na `mcp.aichatbot.rs`:

```nginx
server {
    server_name mcp.aichatbot.rs;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;          # bitno za streaming odgovore
        proxy_read_timeout 300s;
    }
}
```

Obavezno HTTPS (Let's Encrypt) — Claude ne prihvata običan HTTP.

Server mora biti dostupan sa javnog interneta. Ako imate firewall koji propušta
samo određene IP adrese, morate propustiti Anthropic-ove opsege.

### Provera pre nego što pošaljete klijentima

```bash
curl https://mcp.aichatbot.rs/health

MCP_TOKEN_SECRET=<ista tajna> node scripts/mint-token.mjs --tenant test --scopes read
# pa nalepite dobijeni URL u Claude.ai → Settings → Connectors
```

Ili kompletan lokalni test bez backenda:

```bash
node test/smoke.mjs
```

---

## 6. Bezbednosne napomene

- Token stoji **u URL-u**, jer Claude.ai web ne dozvoljava proizvoljna zaglavlja.
  Zbog toga: kratak TTL, mogućnost opoziva, jedan token po korisniku, `read` po difoltu.
- Ne logujte pun token. `src/log.js` ima `maskToken()` upravo zbog toga.
- Rate limit je po tokenu (`MCP_RATE_LIMIT`, difolt 120/min).
- Write alati su dvostruko zaključani: env prekidač + scope u tokenu.
  Uz to Claude traži potvrdu korisnika pre svakog poziva.
