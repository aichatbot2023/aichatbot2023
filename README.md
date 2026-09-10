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

## Šta klijent dobija

Devet alata, podrazumevano samo za čitanje:

| Alat | Šta radi |
|---|---|
| `list_chatbots` | Lista chatbotova sa kanalima i statusom |
| `get_stats` | Razgovori, leadovi, % rešenih bez operatera, sentiment |
| `list_conversations` | Razgovori sa filterima (kanal, kategorija, sentiment, datum) |
| `get_conversation` | Ceo transkript jednog razgovora |
| `list_leads` | Prikupljeni kontakti |
| `search_knowledge` | Pretraga baze znanja bota |
| `ask_chatbot` | Postavi pitanje botu i vidi kako odgovara |
| `add_knowledge` * | Dodaj tekst ili URL u bazu znanja |
| `reply_to_conversation` * | Pošalji odgovor korisniku u razgovoru |

\* rade samo uz `MCP_ALLOW_WRITE=true` i scope `write` u tokenu

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
src/mcp-server.js   MCP instanca po zahtevu (stateless)
src/tools.js        definicije alata
src/api.js          jedina tačka dodira sa backendom platforme
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
