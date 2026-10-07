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
NOVI
src/components/ClaudeConnectorSection.tsx        sekcija u dashboardu: generiši / kopiraj / opozovi
src/pages/UputstvoClaude.tsx                     javna strana /uputstvo/claude
supabase/functions/claude-connector/_scope.ts    uloge, scope-ovi, HMAC tokeni
supabase/functions/claude-connector-link/        izdaje i opoziva klijentski link
supabase/migrations/2026...claude_connector_links.sql   tabela za opoziv

MENJANI (patch, ostalo bajt-identično)
supabase/functions/claude-connector/index.ts     16 izmena — uloge i izolacija naloga
src/pages/Integrations.tsx                       2 izmene — sekcija na /integracije
src/App.tsx                                      2 izmene — javna ruta
vite-plugins/route-meta.ts                       1 izmena — link preview nove rute
public/_redirects                                1 pravilo — /mcp pod vašim domenom
```

Dve skripte, oba puta pucaju ako marker nije nađen:

| Skripta | Šta radi |
|---|---|
| `patch-claude-connector.py` | generiše patchovanu edge funkciju iz vašeg originala |
| `patch-site.py` | primenjuje sve na repo — kopira nove fajlove i menja postojeće |

```bash
cd deploy/lovable-chatbot-studio
python3 patch-site.py /putanja/do/lovable-chatbot-studio
```

## Gde to klijent vidi

**U dashboardu** — `/integracije`, prva sekcija. Dugme *Generiši link*, pa
*Kopiraj*, pa tri koraka i *Opozovi pristup*. Link se prikazuje **samo jednom**
jer se token ne čuva u bazi (samo sha256 hash, radi opoziva); posle osvežavanja
vidi se da link postoji, ali ne i koji je.

**Javno** — `aichatbot.rs/uputstvo/claude`, bez prijave, pa može da se pošalje i
nekome koga još nema na platformi. Ima svoj link preview preko `route-meta`.

Sekcija poziva `claude-connector-link`, koji nalog čita iz korisnikovog JWT-a —
klijent ne može da izda link za tuđi nalog, i ne može sam sebi da izda `sales`
ni `owner`.

> Isečci `web/connect-widget.html` i `web/segment-uputstvo.html` u korenu ovog
> repoa su iz faze pre pristupa pravom kodu i **zamenjeni** su React sekcijom.
> Ostaju ako vam zatrebaju van Lovable aplikacije.

## Dva pravila iz vašeg CLAUDE.md koja menjaju redosled

**Git push ne objavljuje.** `CLAUDE.md` kaže: *„Frontend se objavljuje kroz
Lovable `deploy_project` — sam git push NE objavljuje."* Dakle posle merge-a
treba i Lovable deploy, inače na sajtu nema ničega.

**DB izmene idu kroz Lovable agenta**, ne direktno u Supabase. Migracija
`claude_connector_links` zato ide tim putem, a ne `psql`-om.

Treće, `docs/DESIGN-SYSTEM.md` traži **kompletan SR + EN** za svaku stranicu i
sekciju — i sekcija i javna strana imaju lokalni STR rečnik za oba jezika.

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

## Šta je provereno

Patch je primenjen na pravi klon `lovable-chatbot-studio` i tamo:

- **`tsc --noEmit` — 0 grešaka.** Repo i pre patcha nije imao nijednu, pa
  dodatak ne unosi nove.
- **`npm run build` prolazi.** `route-meta` je prešao sa 22 na 23 strane, što
  potvrđuje da je nova ruta registrovana.
- Patch je pušten **dva puta iz čistog stanja** — ponovljiv je.
- HMAC tokeni su **međusobno kompatibilni** između dashboarda i konektora:
  `test/token-compat.mjs` u korenu ovog repoa pušta i Node i Deno kod i
  proverava oba smera, plus odbijanje pogrešne tajne, falsifikovanog potpisa,
  isteklog tokena i pokušaja da se kroz link izda `owner`.

## Šta nije provereno

Edge funkcije nisu pokrenute protiv žive Supabase instance — Deno nije bio
dostupan u okruženju u kom su pisane. Konkretno nije potvrđeno:

- da `claude-connector-link` dobija ispravan JWT kroz `supabase.functions.invoke`
  (po dokumentaciji dobija, ali to nije izvršeno)
- da `_redirects` proksi propušta POST sa query stringom na Lovable hostingu;
  ako ne propušta, klijentov link ostaje direktan Supabase URL i sve radi, samo
  je adresa manje lepa

Prvi deploy pustite na staging ili uz spreman rollback — `git revert` na
`index.ts` vraća stari konektor, a stari token radi i dalje.
