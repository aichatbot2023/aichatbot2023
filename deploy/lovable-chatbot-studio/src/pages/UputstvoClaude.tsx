import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/LanguageProvider";
import { Sparkles, ExternalLink, ShieldAlert, Terminal, Users } from "lucide-react";

/**
 * /uputstvo/claude — javno uputstvo (bez prijave), da može da se pošalje i
 * klijentu koji još nije na platformi. Sam link se generiše u dashboardu,
 * u sekciji Claude konektor na /integracije.
 *
 * Lokalni STR rečnik, SR + EN — po docs/DESIGN-SYSTEM.md.
 */

const STR = {
  sr: {
    eyebrow: "AiChatBot.rs × Claude",
    h1: "Poveži svoj nalog sa Claude-om",
    lead:
      "Pitaj Claude-a o svojim razgovorima, leadovima i statistici običnim jezikom. Bez koda, bez instalacije — podešavanje traje 2 minuta.",
    asksTitle: "Šta ćeš moći da pitaš",
    asks: [
      "Koliko sam leadova dobio ove nedelje i sa kog kanala su došli?",
      "Prikaži razgovore sa negativnim sentimentom od ponedeljka.",
      "Napravi rezime razgovora i predloži odgovor.",
      "Da li moj bot zna koliko košta Start paket? Pitaj ga.",
      "Izvezi leadove iz avgusta u tabelu.",
    ],
    asksNote:
      "Claude vidi isključivo tvoj nalog — sajt widget, WhatsApp, Viber, Instagram, Telegram i Facebook, sve na jednom mestu.",
    stepsTitle: "Povezivanje",
    steps: [
      {
        h: "Uzmi svoj link",
        p: ["U dashboardu otvori ", "Integracije", ", pa u sekciji ", "Claude konektor", " klikni ", "Generiši link", " i ", "Kopiraj", "."],
      },
      {
        h: "Dodaj ga u Claude",
        p: ["Na ", "claude.ai → Settings → Connectors", " klikni ", "+ Add custom connector", ", nalepi link i klikni ", "Add", ". Polja OAuth Client ID i Client Secret ostavi prazna."],
      },
      {
        h: "Uključi ga u razgovoru",
        p: ["Klikni ", "+", " ispod polja za kucanje → ", "Connectors", " → čekiraj ", "aichatbot-rs", ". Probaj prvo pitanje: „Koje chatbotove imam na nalogu?”"],
      },
    ],
    warn: [
      "Link je kao lozinka.",
      " Ko ga ima, vidi tvoje razgovore i leadove — ne šalji ga u grupne četove. Prikazuje se samo jednom i važi 90 dana. Ako procuri, klikni Opozovi u Integracijama.",
    ],
    specialTitle: "Posebni slučajevi",
    teamH: "Team ili Enterprise",
    teamP:
      "Vlasnik organizacije prvo dodaje konektor u Organization settings → Connectors. Tek onda ga svaki član uključuje kod sebe.",
    codeH: "Claude Code",
    codeP: "Isti link radi i ovde — stavi ga pod navodnike:",
    faqTitle: "Pitanja koja svi postave",
    faq: [
      ["Može li Claude nešto da pokvari na mom nalogu?", "Podrazumevano ne — konektor je u režimu samo za čitanje. Alati koji nešto menjaju rade tek kad ih izričito uključimo, i tada Claude traži tvoju potvrdu pre svake akcije."],
      ["Vidi li neko drugi moje podatke?", "Ne. Link je vezan za tvoj nalog i svaki zahtev se proverava na serveru. Ni ti ne možeš videti tuđe podatke ni kad bi menjao parametre."],
      ["Kako da isključim pristup?", "Integracije → Claude konektor → Opozovi pristup. Link prestaje da radi odmah."],
      ["Šta kad link istekne?", "Claude će prijaviti da konektor ne radi. Generiši novi link i zameni ga u Settings → Connectors — ostalo ostaje isto."],
      ["Da li mi treba plaćeni Claude nalog?", "Radi i na besplatnom, s tim što besplatni dozvoljava samo jedan custom konektor."],
      ['Ne vidim „Add custom connector”', "Ta opcija postoji na claude.ai u pregledaču i u desktop aplikaciji, ali još ne i u mobilnoj. Dodaj konektor na računaru — posle radi i na telefonu."],
    ] as [string, string][],
    footerAsk: "Zapeo si negde? Piši nam na",
    footerCta: "Generiši link →",
  },
  en: {
    eyebrow: "AiChatBot.rs × Claude",
    h1: "Connect your account to Claude",
    lead:
      "Ask Claude about your conversations, leads and stats in plain language. No code, no install — setup takes 2 minutes.",
    asksTitle: "What you will be able to ask",
    asks: [
      "How many leads did I get this week, and which channel did they come from?",
      "Show conversations with negative sentiment since Monday.",
      "Summarise this conversation and draft a reply.",
      "Does my bot know the price of the Start plan? Ask it.",
      "Export August leads into a table.",
    ],
    asksNote:
      "Claude sees only your account — site widget, WhatsApp, Viber, Instagram, Telegram and Facebook, all in one place.",
    stepsTitle: "Connecting",
    steps: [
      {
        h: "Get your link",
        p: ["In the dashboard open ", "Integrations", ", then in the ", "Claude connector", " section click ", "Generate link", " and ", "Copy", "."],
      },
      {
        h: "Add it to Claude",
        p: ["At ", "claude.ai → Settings → Connectors", " click ", "+ Add custom connector", ", paste the link and click ", "Add", ". Leave OAuth Client ID and Client Secret empty."],
      },
      {
        h: "Enable it in a chat",
        p: ["Click ", "+", " below the message box → ", "Connectors", " → check ", "aichatbot-rs", ". Try the first question: “Which chatbots do I have?”"],
      },
    ],
    warn: [
      "The link is like a password.",
      " Anyone who has it can see your conversations and leads — do not share it in group chats. It is shown only once and is valid for 90 days. If it leaks, click Revoke in Integrations.",
    ],
    specialTitle: "Special cases",
    teamH: "Team or Enterprise",
    teamP:
      "The organisation owner first adds the connector under Organization settings → Connectors. Only then does each member enable it.",
    codeH: "Claude Code",
    codeP: "The same link works here — put it in quotes:",
    faqTitle: "Questions everyone asks",
    faq: [
      ["Can Claude break something on my account?", "By default no — the connector is read-only. Tools that change anything work only once we explicitly enable them, and then Claude asks for your confirmation before each action."],
      ["Can anyone else see my data?", "No. The link is tied to your account and every request is checked on the server. Even you cannot see other accounts' data by changing parameters."],
      ["How do I turn access off?", "Integrations → Claude connector → Revoke access. The link stops working immediately."],
      ["What happens when the link expires?", "Claude will report that the connector is failing. Generate a new link and replace it under Settings → Connectors — everything else stays the same."],
      ["Do I need a paid Claude plan?", "It works on the free plan too, except the free plan allows only one custom connector."],
      ['I cannot see "Add custom connector"', "That option exists on claude.ai in the browser and in the desktop app, but not yet on mobile. Add the connector on a computer — afterwards it works on your phone too."],
    ] as [string, string][],
    footerAsk: "Stuck somewhere? Write to us at",
    footerCta: "Generate link →",
  },
};

/** Niz delova gde su neparni indeksi naglašeni — bez dangerouslySetInnerHTML. */
function Rich({ parts, link }: { parts: string[]; link?: number }) {
  return (
    <>
      {parts.map((part, i) =>
        i === link ? (
          <a
            key={i}
            href="https://claude.ai/settings/connectors"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline inline-flex items-center gap-1"
          >
            {part} <ExternalLink className="w-3 h-3" />
          </a>
        ) : i % 2 === 1 ? (
          <strong key={i} className="text-foreground font-semibold">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function UputstvoClaude() {
  const { language } = useLanguage();
  const T = STR[language === "sr" ? "sr" : "en"];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 space-y-10">
      <header className="space-y-3">
        <Badge variant="outline" className="font-mono text-xs">{T.eyebrow}</Badge>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3 flex-wrap">
          <Sparkles className="w-8 h-8 text-primary shrink-0" />
          {T.h1}
        </h1>
        <p className="text-muted-foreground text-lg">{T.lead}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{T.asksTitle}</h2>
        <ul className="divide-y border-y">
          {T.asks.map((a) => (
            <li key={a} className="flex gap-3 py-3 text-sm">
              <span className="text-primary font-mono shrink-0">→</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{T.asksNote}</p>
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold">{T.stepsTitle}</h2>
        <ol className="space-y-6">
          {T.steps.map((k, i) => (
            <li key={k.h} className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-semibold font-mono">
                {i + 1}
              </span>
              <div className="space-y-1.5 pt-0.5">
                <h3 className="font-semibold">{k.h}</h3>
                <p className="text-sm text-muted-foreground">
                  <Rich parts={k.p} link={i === 1 ? 1 : undefined} />
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p>
            <strong>{T.warn[0]}</strong>
            {T.warn[1]}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{T.specialTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-primary" /> {T.teamH}
              </h3>
              <p className="text-sm text-muted-foreground">{T.teamP}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Terminal className="w-4 h-4 text-primary" /> {T.codeH}
              </h3>
              <p className="text-sm text-muted-foreground">{T.codeP}</p>
              <pre className="rounded bg-muted p-3 text-xs overflow-x-auto">
                <code>{'claude mcp add --transport http \\\n  aichatbot "<LINK>"'}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{T.faqTitle}</h2>
        <div className="divide-y border-y">
          {T.faq.map(([q, a]) => (
            <div key={q} className="py-4 space-y-1.5">
              <h3 className="font-medium text-sm">{q}</h3>
              <p className="text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
        <span>
          {T.footerAsk}{" "}
          <a href="mailto:podrska@aichatbot.rs" className="text-primary hover:underline">
            podrska@aichatbot.rs
          </a>
        </span>
        <Link to="/integracije" className="text-primary font-medium hover:underline">
          {T.footerCta}
        </Link>
      </footer>
    </div>
  );
}
