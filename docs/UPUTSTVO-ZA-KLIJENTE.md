# Poveži svoj AiChatBot nalog sa Claude-om

Za 2 minuta, bez ijedne linije koda.

## Šta dobijaš

Kada povežeš konektor, u Claude razgovoru možeš da pitaš stvari kao:

- „Koliko sam leadova dobio ove nedelje i odakle su došli?"
- „Prikaži mi sve razgovore sa negativnim sentimentom od ponedeljka."
- „Napravi mi rezime razgovora conv_1001 i predloži odgovor."
- „Da li moj bot zna koliko košta Start paket? Pitaj ga."
- „Izvezi leadove iz avgusta u tabelu."

Claude vidi **samo tvoj nalog** — niko drugi ne može da priđe tvojim podacima.

---

## Korak 1 — uzmi svoj link

1. Uloguj se na **app.aichatbot.rs**
2. Idi na **Podešavanja → Integracije → Claude konektor**
3. Klikni **Generiši link** i kopiraj ga

Link izgleda ovako:

```
https://mcp.aichatbot.rs/u/v1.eyJ0IjoiYWNtZSIsInMiOlsicmVhZCJdfQ.9Kc2s.../mcp
```

> ⚠️ **Ovaj link je kao lozinka.** Ko ga ima, ima pristup tvojim podacima.
> Ne šalji ga u grupne četove i ne objavljuj. Ako procuri — klikni **Opozovi** u dashboardu i generiši novi.

---

## Korak 2 — dodaj ga u Claude

### Claude.ai (sajt i desktop aplikacija)

1. Otvori **claude.ai**
2. Klikni na svoje ime dole levo → **Settings** (Podešavanja)
3. Otvori **Connectors** (Konektori)
4. Klikni **+ Add custom connector**
5. Nalepi link koji si kopirao
6. Klikni **Add**

Gotovo. Konektor se pojavljuje u listi kao **aichatbot-rs**.

> Napomena: polja *OAuth Client ID* i *Client Secret* pod „Advanced settings" **ostavi prazna** — ne trebaju ti.

### Ako imaš Team ili Enterprise nalog

Vlasnik organizacije prvo dodaje konektor u **Organization settings → Connectors**,
a tek onda ga članovi uključuju kod sebe u **Settings → Connectors**.

---

## Korak 3 — uključi ga u razgovoru

U novom razgovoru klikni **+** ispod polja za kucanje → **Connectors** → čekiraj **aichatbot-rs**.

Probaj prvo pitanje:

> Koje chatbotove imam na nalogu?

Ako dobiješ listu svojih botova — sve radi.

---

## Za tehničke korisnike: Claude Code

```bash
claude mcp add --transport http aichatbot https://mcp.aichatbot.rs/mcp \
  --header "Authorization: Bearer <TVOJ_TOKEN>"
```

Token je deo linka između `/u/` i `/mcp`.

---

## Česta pitanja

**Da li Claude može nešto da pokvari na mom nalogu?**
Podrazumevano ne. Konektor je u režimu „samo čitanje". Alati koji nešto menjaju
(dodavanje u bazu znanja, slanje odgovora korisniku) rade tek kada ih ti izričito
uključiš u dashboardu. I tada Claude traži tvoju potvrdu pre svake takve akcije.

**Vidi li neko drugi moje podatke?**
Ne. Link je vezan za tvoj nalog i svaki zahtev se proverava na serveru.
Ni ti ne možeš videti tuđe podatke ni kada bi menjao parametre.

**Kako da isključim pristup?**
Dashboard → **Podešavanja → Integracije → Claude konektor → Opozovi**.
Link istog trenutka prestaje da radi.

**Koliko košta?**
Konektor je uključen u tvoj AiChatBot paket. Treba ti Claude nalog
(radi i na besplatnom, s tim što besplatni dozvoljava samo jedan custom konektor).

**Ne vidim „Add custom connector"?**
Proveri da li si na `claude.ai` u pregledaču ili desktop aplikaciji.
U mobilnoj aplikaciji ta opcija još ne postoji — dodaj konektor na računaru,
posle radi i na telefonu.

---

Problem? Piši nam na **podrska@aichatbot.rs** sa opisom koraka na kom si zapeo.
