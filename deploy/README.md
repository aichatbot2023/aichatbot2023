# Primena na postojeću platformu

Ovde je **preporučeni put**: patch nad postojećom edge funkcijom
`claude-connector` u repou `aichatbot2023/lovable-chatbot-studio`.

Zašto tu, a ne u standalone Node serveru iz korena ovog repoa: postojeća edge
funkcija već ima sve prave implementacije (`proxy-ai`, `auto-generate-assistant`,
`lead-engine`, `send-bot-email`, direktne Supabase upite), već je deployovana i
ne traži nikakvu novu infrastrukturu. Node server je napisan pre nego što je
pristup tom kodu postojao; ostaje kao alternativa, ali dva alata
(`read_table`, `platform_stats`) u njemu ne mogu da rade jer su direktni upiti
u bazu, pa ih i ne nudi.

## Šta se menja

Postojeći konektor je imao **jedan deljeni token i nikakvu izolaciju naloga**:
`list_chatbots` je čitao sve botove na platformi, `read_table` sve redove, a
`ownerUserId()` je vraćao jedan konfigurisan nalog. Dobro za vas, neupotrebljivo
za klijente.

Posle patcha isti URL opslužuje četiri uloge:

| Uloga | Alata | Za koga |
|---|---|---|
| `client` | 6 | Krajnji klijent — svoj nalog, samo čitanje |
| `client_write` | 8 | Klijent kome ste odobrili izmene |
| `sales` | 12 | Prodavci i partneri |
| `owner` | 23 | Vi — ceo stari skup, nepromenjen |

**Vaš postojeći link nastavlja da radi.** Stari `MCP_CONNECTOR_TOKEN` se mapira
na ulogu `owner`, pa ne morate ništa da menjate u svom Claude podešavanju.

## Fajlovi

```
supabase/functions/claude-connector/_scope.ts    NOVO  uloge, scope-ovi, HMAC tokeni
supabase/functions/claude-connector/index.ts     PATCH 16 izmena nad originalom
supabase/functions/claude-connector-link/        NOVO  izdaje i opoziva klijentski link
supabase/migrations/2026...claude_connector_links.sql  NOVO  tabela za opoziv
public/uputstvo/claude/index.html                NOVO  uputstvo za klijente
_redirects.dodatak                                      dva pravila za public/_redirects
```

`index.ts` je generisan skriptom `patch-claude-connector.py` iz vašeg originala,
pa su svi delovi koje patch ne dira **bajt-identični**. Ako kasnije promenite
original, pustite skriptu ponovo:

```bash
python3 patch-claude-connector.py \
  ../../lovable-chatbot-studio/supabase/functions/claude-connector/index.ts \
  supabase/functions/claude-connector/index.ts
```

Skripta **pukne** ako ne nađe marker, umesto da tiho promaši — to znači da se
taj deo originala promenio i treba ga pogledati rukom.

## Koraci

1. **Tajna za potpisivanje** (različita od `MCP_CONNECTOR_TOKEN`):

   ```bash
   openssl rand -hex 32
   ```

   Upišite je kao Supabase secret `MCP_SIGNING_SECRET`. Dodajte i
   `MCP_PUBLIC_URL=https://aichatbot.rs/mcp`.

2. **Migracija** — pustite SQL iz `supabase/migrations/`.

3. **Kopirajte fajlove** na iste putanje u `lovable-chatbot-studio`.

4. **Dopunite `public/_redirects`** sadržajem iz `_redirects.dodatak`, iznad
   catch-all pravila. Time klijentov link postaje
   `https://aichatbot.rs/mcp?token=...` umesto da otkriva Supabase domen.

5. **Deploy** obe funkcije.

6. **Provera pre nego što pošaljete klijentima** — generišite sebi probni
   klijentski link i dodajte ga u Claude kao *drugi* konektor:

   ```
   curl -X POST https://<projekat>.supabase.co/functions/v1/claude-connector-link \
     -H "Authorization: Bearer <JWT nekog test korisnika>" \
     -H "content-type: application/json" -d '{"action":"create"}'
   ```

   U Claude-u morate videti 6 alata i **nijedan** od `read_table`,
   `platform_stats`, `send_newsletter`, `invoke_platform_function`.
   Pitajte „koje chatbotove imam" — smeju da se pojave samo botovi tog naloga.

7. **Dugme u dashboardu** — `web/connect-widget.html` i
   `web/segment-uputstvo.html` iz korena repoa su gotovi isečci; pozivaju
   `claude-connector-link` i vode na `/uputstvo/claude`.

## Tvrdo pravilo izolacije

Scope sam po sebi nije dovoljan, jer tri postojeća alata **nemaju pojam naloga**
(`platform_stats`, `read_table`, `list_contacts`). Zato iznad scope-ova stoji
pravilo koje scope ne može da probije — u `TOOL_ACCESS`:

```ts
read_table: { scope: 'platform:read', crossTenant: true },
```

`crossTenant: true` znači: dostupan **isključivo** ulozi `owner`, i kada bi
token nekako dobio taj scope. Alat koji nije u mapi tretira se kao owner-only,
pa je svaki novi alat zatvoren dok mu se svesno ne odredi pristup.

Dve dodatne brave:

- Potpisan link **nikad** ne može da nosi ulogu `owner` (`_scope.ts` to odbija).
  Owner je samo deljeni secret, koji ne izlazi iz vašeg okruženja.
- `claude-connector-link` izdaje samo `client` i `client_write`. Uloga `sales`
  se izdaje ručno, nije self-service.

Ako ikada budete davali `platform_stats` ili `read_table` klijentima, prvo
dodajte filter po nalogu u sam alat, pa tek onda skinite `crossTenant`.
Dok to ne uradite, klijent ih ne može dobiti ni greškom.

## Šta nije testirano

Patch nije pokrenut protiv žive Supabase instance — Deno nije bio dostupan u
okruženju u kom je pisan, a vaš projekat nije bio dohvatljiv. Provereno je:

- da se svih 16 izmena primenilo na tačnim mestima i da je redosled deklaracija
  ispravan (`TOOLS` → `TOOL_ACCESS` → `toolsFor` → `TOOLS.push` → `execTool`)
- da su HMAC tokeni **međusobno kompatibilni** između dashboarda (Node) i
  konektora (Deno): `test/token-compat.mjs` u korenu repoa pušta oba koda i
  proverava oba smera, odbijanje pogrešne tajne, falsifikovanog potpisa,
  isteklog tokena i pokušaja da se kroz link izda `owner`

Prvi deploy pustite na staging ili uz spreman rollback (`git revert` na
`index.ts` vraća stari konektor — stari token i dalje radi).
