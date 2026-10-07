import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ExternalLink, ShieldAlert, Terminal, Users } from "lucide-react";

/**
 * /uputstvo/claude — javno uputstvo (bez prijave), da se može poslati i
 * klijentu koji još nije na platformi. Sam link se generiše u dashboardu,
 * u sekciji Claude konektor na /integracije.
 */

const PITANJA = [
  "Koliko sam leadova dobio ove nedelje i sa kog kanala su došli?",
  "Prikaži razgovore sa negativnim sentimentom od ponedeljka.",
  "Napravi rezime razgovora i predloži odgovor.",
  "Da li moj bot zna koliko košta Start paket? Pitaj ga.",
  "Izvezi leadove iz avgusta u tabelu.",
];

const KORACI = [
  {
    naslov: "Uzmi svoj link",
    telo: (
      <>
        U dashboardu otvori <strong>Integracije</strong>, pa u sekciji{" "}
        <strong>Claude konektor</strong> klikni <strong>Generiši link</strong> i{" "}
        <strong>Kopiraj</strong>.
      </>
    ),
  },
  {
    naslov: "Dodaj ga u Claude",
    telo: (
      <>
        Na{" "}
        <a
          href="https://claude.ai/settings/connectors"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          claude.ai → Settings → Connectors <ExternalLink className="w-3 h-3" />
        </a>{" "}
        klikni <strong>+ Add custom connector</strong>, nalepi link i klikni{" "}
        <strong>Add</strong>. Polja <em>OAuth Client ID</em> i{" "}
        <em>Client Secret</em> ostavi prazna.
      </>
    ),
  },
  {
    naslov: "Uključi ga u razgovoru",
    telo: (
      <>
        Klikni <strong>+</strong> ispod polja za kucanje → <strong>Connectors</strong>{" "}
        → čekiraj <strong>aichatbot-rs</strong>. Probaj prvo pitanje:{" "}
        <em>„Koje chatbotove imam na nalogu?"</em>
      </>
    ),
  },
];

const FAQ = [
  {
    q: "Može li Claude nešto da pokvari na mom nalogu?",
    a: "Podrazumevano ne — konektor je u režimu samo za čitanje. Alati koji nešto menjaju rade tek kad ih izričito uključimo, i tada Claude traži tvoju potvrdu pre svake akcije.",
  },
  {
    q: "Vidi li neko drugi moje podatke?",
    a: "Ne. Link je vezan za tvoj nalog i svaki zahtev se proverava na serveru. Ni ti ne možeš videti tuđe podatke ni kad bi menjao parametre.",
  },
  {
    q: "Kako da isključim pristup?",
    a: "Integracije → Claude konektor → Opozovi pristup. Link prestaje da radi odmah.",
  },
  {
    q: "Šta kad link istekne?",
    a: "Claude će prijaviti da konektor ne radi. Generiši novi link i zameni ga u Settings → Connectors — ostalo ostaje isto.",
  },
  {
    q: "Da li mi treba plaćeni Claude nalog?",
    a: "Radi i na besplatnom, s tim što besplatni dozvoljava samo jedan custom konektor.",
  },
  {
    q: 'Ne vidim „Add custom connector"',
    a: "Ta opcija postoji na claude.ai u pregledaču i u desktop aplikaciji, ali još ne i u mobilnoj. Dodaj konektor na računaru — posle radi i na telefonu.",
  },
];

export default function UputstvoClaude() {
  return (
    <div className="container mx-auto max-w-3xl py-12 space-y-10">
      <header className="space-y-3">
        <Badge variant="outline" className="font-mono text-xs">
          AiChatBot.rs × Claude
        </Badge>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3 flex-wrap">
          <Sparkles className="w-8 h-8 text-primary shrink-0" />
          Poveži svoj nalog sa Claude-om
        </h1>
        <p className="text-muted-foreground text-lg">
          Pitaj Claude-a o svojim razgovorima, leadovima i statistici običnim
          jezikom. Bez koda, bez instalacije — podešavanje traje 2 minuta.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Šta ćeš moći da pitaš</h2>
        <ul className="divide-y border-y">
          {PITANJA.map((p) => (
            <li key={p} className="flex gap-3 py-3 text-sm">
              <span className="text-primary font-mono shrink-0">→</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Claude vidi isključivo tvoj nalog — sajt widget, WhatsApp, Viber,
          Instagram, Telegram i Facebook, sve na jednom mestu.
        </p>
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Povezivanje</h2>
        <ol className="space-y-6">
          {KORACI.map((k, i) => (
            <li key={k.naslov} className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-semibold font-mono">
                {i + 1}
              </span>
              <div className="space-y-1.5 pt-0.5">
                <h3 className="font-semibold">{k.naslov}</h3>
                <p className="text-sm text-muted-foreground [&_strong]:text-foreground">
                  {k.telo}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p>
            <strong>Link je kao lozinka.</strong> Ko ga ima, vidi tvoje razgovore
            i leadove — ne šalji ga u grupne četove. Prikazuje se samo jednom i
            važi 90 dana. Ako procuri, klikni <strong>Opozovi</strong> u
            Integracijama.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Posebni slučajevi</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-primary" /> Team ili Enterprise
              </h3>
              <p className="text-sm text-muted-foreground">
                Vlasnik organizacije prvo dodaje konektor u{" "}
                <strong className="text-foreground">
                  Organization settings → Connectors
                </strong>
                . Tek onda ga svaki član uključuje kod sebe.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Terminal className="w-4 h-4 text-primary" /> Claude Code
              </h3>
              <p className="text-sm text-muted-foreground">
                Isti link radi i ovde — stavi ga pod navodnike:
              </p>
              <pre className="rounded bg-muted p-3 text-xs overflow-x-auto">
                <code>{'claude mcp add --transport http \\\n  aichatbot "<TVOJ_LINK>"'}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Pitanja koja svi postave</h2>
        <div className="divide-y border-y">
          {FAQ.map((f) => (
            <div key={f.q} className="py-4 space-y-1.5">
              <h3 className="font-medium text-sm">{f.q}</h3>
              <p className="text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
        <span>
          Zapeo si negde? Piši nam na{" "}
          <a href="mailto:podrska@aichatbot.rs" className="text-primary hover:underline">
            podrska@aichatbot.rs
          </a>
        </span>
        <Link to="/integracije" className="text-primary font-medium hover:underline">
          Generiši link →
        </Link>
      </footer>
    </div>
  );
}
