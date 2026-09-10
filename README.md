# AiChatBot.rs — MCP konektor za Claude

Remote MCP server preko kog klijent AiChatBot.rs platforme povezuje svoj nalog
sa Claude-om kao **Custom Connector**, bez ijedne linije koda sa svoje strane.

Klijent kopira jedan link iz dashboarda i nalepi ga u Claude → gotovo.

```
Klijent u Claude.ai
   │  Settings → Connectors → Add custom connector
   │  https://mcp.aichatbot.rs/u/<TOKEN>/mcp
   ▼
MCP server (ovaj repo)              ── proverava HMAC potpis tokena
   │  Authorization: Bearer <SERVICE_KEY>   ── izvlači tenant iz tokena
   │  X-Tenant-Id: <iz tokena>
   ▼
Backend AiChatBot.rs platforme
```

## Zašto token u URL-u, a ne OAuth

Claude.ai web ne dozvoljava proizvoljna HTTP zaglavlja pri dodavanju konektora,
a pun OAuth 2.1 sa dinamičkom registracijom klijenata je nedelja posla.
Potpisan token u putanji daje istu bezbednosnu garanciju uz nekoliko sati posla —
uz uslov da je opoziv (revocation) implementiran i TTL kratak.

OAuth se uvek može dodati kasnije bez menjanja alata.

## Jedan server, četiri uloge

Isti server opslužuje i krajnjeg klijenta i vas. Šta ko vidi određuje **uloga upisana u token**,
a ne konfiguracija servera — pa nema dva servera za održavanje.

| Uloga | Alata | Za koga |
|---|---|---|
| `client` | 8 | Krajnji klijent — svoj nalog, samo čitanje |
| `client_write` | 10 | Klijent kome ste odobrili izmene na svom nalogu |
| `sales` | 15 | Prodavci i partneri — demo botovi, traženje firmi |
| `owner` | 26 | Vi — cela platforma, uključujući `read_table` i `invoke_platform_function` |

```bash
node scripts/mint-token.mjs --tenant acme --role client   # link za klijenta
node scripts/mint-token.mjs --tenant acme --role owner    # vaš link
```

### Tvrdo pravilo izolacije

Iznad scope-ova stoji pravilo koje scope ne može da probije: alat označen
`crossTenant: true` čita ili menja podatke **cele platforme** i zato je dostupan
isključivo ulozi `owner` — i kada bi token nekako dobio odgovarajući scope.

Zato dodavanje dozvole klijentu ne može slučajno da otvori tuđe podatke.
Token kome ručno dodelite `platform:invoke` bez uloge `owner` ne dobija ništa —
server ga odbija sa jasnom porukom. To pokriva `test/smoke.mjs`.

### Alati

**Nalog klijenta** (tenant se uvek čita iz tokena, nikad iz argumenata)
`list_chatbots` · `get_stats` · `list_conversations` · `get_conversation` ·
`list_leads` · `search_knowledge` · `ask_chatbot` · `chat_with_bot` ·
`add_knowledge` \* · `reply_to_conversation` \*

**Prodaja** (spoljni izvori i sopstveni nalog — ne otkrivaju tuđe podatke)
`create_chatbot_from_website` \* · `get_demo_link` · `send_demo_email` \* ·
`find_leads` · `enrich_leads` · `verify_emails` · `research_company`

**Platforma** (samo `owner`)
`platform_stats` · `delete_chatbot` \* · `list_contacts` · `send_newsletter` \* ·
`run_agent_task` \* · `get_agent_run` · `ai_tim_command` \* · `read_table` ·
`invoke_platform_function` \*

\* traže i `MCP_ALLOW_WRITE=true` — jedan prekidač koji gasi sve što menja ili šalje

## Brzi start (bez backenda)

```bash
npm install
npm run dev            # DEMO_MODE - vraća izmišljene podatke
node test/smoke.mjs    # end-to-end provera pravim MCP klijentom
```

Generiši token i probaj u Claude-u:

```bash
MCP_TOKEN_SECRET=$(openssl rand -hex 32) node scripts/mint-token.mjs --tenant test
```

## Produkcija

```bash
cp .env.example .env    # popuni MCP_TOKEN_SECRET i AICHATBOT_SERVICE_KEY
docker compose up -d --build
```

Nginx konfiguracija i lista endpointa koje backend treba da izloži:
[`docs/INTEGRACIJA-BACKEND.md`](docs/INTEGRACIJA-BACKEND.md)

## Struktura

```
src/index.js        HTTP sloj, provera tokena, rate limit
src/auth.js         HMAC tokeni (mint/verify), opoziv, rate limit
src/scopes.js       scope-ovi i uloge - jedino mesto gde se menjaju dozvole
src/mcp-server.js   MCP instanca po zahtevu (stateless)
src/tools/index.js  registar alata i pravilo izolacije
src/tools/client.js     alati nad nalogom klijenta
src/tools/sales.js      demo botovi i traženje firmi
src/tools/platform.js   alati nad celom platformom (owner)
src/api.js          REST backend + Supabase edge funkcije
src/platform-functions.js  mapa alat -> edge funkcija
src/demo.js         lažni podaci za DEMO_MODE
scripts/mint-token.mjs
web/connect-widget.html   isečak za dashboard ("Kopiraj link")
docs/UPUTSTVO-ZA-KLIJENTE.md   tekst koji ide klijentu
docs/INTEGRACIJA-BACKEND.md    šta backend treba da uradi
test/smoke.mjs
```

## Trošak

Jedan mali VPS ili container (128 MB RAM je dovoljno — server je stateless,
nema bazu, nema sesije). Sve preko toga je posao na backend endpointima,
koje ionako najverovatnije već imate.
