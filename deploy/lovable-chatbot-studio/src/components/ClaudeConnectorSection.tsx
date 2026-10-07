import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/LanguageProvider";
import {
  Sparkles, Copy, Check, Eye, EyeOff, ShieldAlert, Trash2,
  Loader2, ExternalLink, KeyRound,
} from "lucide-react";

/**
 * Sekcija "Claude konektor" — korisnik generiše link kojim svoj nalog
 * povezuje sa Claude-om (claude.ai → Settings → Connectors).
 *
 * Link se izdaje u claude-connector-link edge funkciji, koja nalog čita iz
 * korisnikovog JWT-a. Sam token se NE čuva u bazi (samo sha256 hash, radi
 * opoziva), pa se prikazuje jednom — posle osvežavanja stranice vidi se
 * samo da link postoji, ne i koji je.
 */

/** Lokalni STR rečnik — dizajn sistem traži kompletan SR + EN. */
const STR = {
  sr: {
    title: "Claude konektor",
    desc: "Pitaj Claude-a o svojim razgovorima, leadovima i statistici običnim jezikom.",
    notConnected: "Nije povezan",
    validUntil: "važi do",
    loading: "Učitavanje…",
    yourLink: "Tvoj link",
    show: "Prikaži link",
    hide: "Sakrij link",
    copy: "Kopiraj",
    copied: "Kopirano",
    warnTitle: "Čuvaj ga kao lozinku",
    warnBody: "— ko ga ima, vidi tvoje razgovore i leadove. Prikazuje se samo sada, pa ga odmah nalepi u Claude.",
    activeNote:
      "Link je aktivan. Iz bezbednosnih razloga ga ne čuvamo, pa se ne može ponovo prikazati — ako ti treba novi, generiši ga (stari se tada opoziva).",
    create: "Generiši link",
    recreate: "Generiši novi link",
    revoke: "Opozovi pristup",
    guide: "Detaljno uputstvo",
    footer:
      "Konektor je u režimu samo za čitanje i vidi isključivo tvoj nalog. Claude ne može da menja podatke niti da priđe tuđim nalozima.",
    createdTitle: "Link je generisan",
    createdBody: "Prikazuje se samo sada — kopiraj ga i nalepi u Claude.",
    revokedTitle: "Pristup je opozvan",
    revokeConfirm:
      "Opozvati pristup? Postojeći link odmah prestaje da radi i moraćeš da dodaš novi u Claude-u.",
    errorTitle: "Greška",
    roles: { client: "Samo čitanje", client_write: "Čitanje i izmene", sales: "Prodaja" } as Record<string, string>,
    steps: [
      "Otvori claude.ai → Settings → Connectors",
      "Klikni + Add custom connector i nalepi link",
      "U razgovoru: + → Connectors → uključi aichatbot-rs",
    ],
    locale: "sr-RS",
  },
  en: {
    title: "Claude connector",
    desc: "Ask Claude about your conversations, leads and stats in plain language.",
    notConnected: "Not connected",
    validUntil: "valid until",
    loading: "Loading…",
    yourLink: "Your link",
    show: "Show link",
    hide: "Hide link",
    copy: "Copy",
    copied: "Copied",
    warnTitle: "Treat it like a password",
    warnBody:
      "— anyone who has it can see your conversations and leads. It is shown only now, so paste it into Claude right away.",
    activeNote:
      "A link is active. For security we do not store it, so it cannot be shown again — if you need a new one, generate it (the old one is then revoked).",
    create: "Generate link",
    recreate: "Generate new link",
    revoke: "Revoke access",
    guide: "Full guide",
    footer:
      "The connector is read-only and sees only your account. Claude cannot change data or reach other accounts.",
    createdTitle: "Link generated",
    createdBody: "Shown only now — copy it and paste it into Claude.",
    revokedTitle: "Access revoked",
    revokeConfirm:
      "Revoke access? The existing link stops working immediately and you will have to add a new one in Claude.",
    errorTitle: "Error",
    roles: { client: "Read only", client_write: "Read and write", sales: "Sales" } as Record<string, string>,
    steps: [
      "Open claude.ai → Settings → Connectors",
      "Click + Add custom connector and paste the link",
      "In a chat: + → Connectors → enable aichatbot-rs",
    ],
    locale: "en-US",
  },
};

interface LinkStatus {
  role: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export default function ClaudeConnectorSection() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = STR[language === "sr" ? "sr" : "en"];
  const datum = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" }) : "—";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("claude-connector-link", {
      body: { action: "status" },
    });
    if (!error && data) setStatus(data.link ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy("create");
    try {
      const { data, error } = await supabase.functions.invoke("claude-connector-link", {
        body: { action: "create" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setFreshUrl(data.url);
      setReveal(false);
      setCopied(false);
      toast({
        title: T.createdTitle,
        description: T.createdBody,
      });
      await load();
    } catch (e: any) {
      toast({ title: T.errorTitle, description: String(e.message ?? e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const revoke = async () => {
    if (!confirm(T.revokeConfirm)) return;
    setBusy("revoke");
    try {
      const { data, error } = await supabase.functions.invoke("claude-connector-link", {
        body: { action: "revoke" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setFreshUrl(null);
      setStatus(null);
      toast({ title: T.revokedTitle });
      await load();
    } catch (e: any) {
      toast({ title: T.errorTitle, description: String(e.message ?? e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const copy = async () => {
    if (!freshUrl) return;
    await navigator.clipboard.writeText(freshUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> {T.title}
            </CardTitle>
            <CardDescription className="mt-1">
              {T.desc}
            </CardDescription>
          </div>
          {status ? (
            <Badge variant="secondary" className="shrink-0">
              {T.roles[status.role] ?? status.role} · {T.validUntil} {datum(status.expires_at)}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">Nije povezan</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {T.loading}
          </p>
        ) : (
          <>
            {/* Sveže generisan link — jedini trenutak kada se vidi */}
            {freshUrl && (
              <div className="space-y-2">
                <label htmlFor="claude-mcp-url" className="text-sm font-medium flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> {T.yourLink}
                </label>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    id="claude-mcp-url"
                    readOnly
                    value={freshUrl}
                    type={reveal ? "text" : "password"}
                    className="flex-1 min-w-[220px] font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button variant="outline" size="icon" onClick={() => setReveal((r) => !r)} aria-label={reveal ? T.hide : T.show}>
                    {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button onClick={copy}>
                    {copied ? <><Check className="w-4 h-4 mr-1.5" /> {T.copied}</> : <><Copy className="w-4 h-4 mr-1.5" /> {T.copy}</>}
                  </Button>
                </div>
                <div className="flex gap-2 text-sm rounded-md border border-warning/40 bg-warning/5 p-3">
                  <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p>
                    <strong>{T.warnTitle}</strong> {T.warnBody}
                  </p>
                </div>
              </div>
            )}

            {/* Postoji link, ali je token već prikazan i ne čuvamo ga */}
            {!freshUrl && status && (
              <p className="text-sm text-muted-foreground">
                {T.activeNote}
              </p>
            )}

            <ol className="space-y-2.5 text-sm">
              {T.steps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">
                    {i === 0 ? (
                      <a
                        href="https://claude.ai/settings/connectors"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                      >
                        {step} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      step
                    )}
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={create} disabled={busy !== null}>
                  {busy === "create" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {status ? T.recreate : T.create}
                </Button>
                {status && (
                  <Button variant="ghost" onClick={revoke} disabled={busy !== null} className="text-destructive hover:text-destructive">
                    {busy === "revoke" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                    {T.revoke}
                  </Button>
                )}
              </div>
              <a href="/uputstvo/claude" target="_blank" rel="noopener noreferrer" className="text-sm text-primary font-medium hover:underline">
                {T.guide}
              </a>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              {T.footer}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
