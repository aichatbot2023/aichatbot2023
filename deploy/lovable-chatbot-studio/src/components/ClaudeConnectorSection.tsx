import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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

interface LinkStatus {
  role: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  client: "Samo čitanje",
  client_write: "Čitanje i izmene",
  sales: "Prodaja",
};

const dan = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("sr-RS", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function ClaudeConnectorSection() {
  const { toast } = useToast();
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
        title: "Link je generisan",
        description: "Prikazuje se samo sada — kopiraj ga i nalepi u Claude.",
      });
      await load();
    } catch (e: any) {
      toast({ title: "Greška", description: String(e.message ?? e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const revoke = async () => {
    if (!confirm("Opozvati pristup? Postojeći link odmah prestaje da radi i moraćeš da dodaš novi u Claude-u.")) return;
    setBusy("revoke");
    try {
      const { data, error } = await supabase.functions.invoke("claude-connector-link", {
        body: { action: "revoke" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setFreshUrl(null);
      setStatus(null);
      toast({ title: "Pristup je opozvan" });
      await load();
    } catch (e: any) {
      toast({ title: "Greška", description: String(e.message ?? e), variant: "destructive" });
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
              <Sparkles className="w-5 h-5 text-primary" /> Claude konektor
            </CardTitle>
            <CardDescription className="mt-1">
              Pitaj Claude-a o svojim razgovorima, leadovima i statistici običnim jezikom.
            </CardDescription>
          </div>
          {status ? (
            <Badge variant="secondary" className="shrink-0">
              {ROLE_LABEL[status.role] ?? status.role} · važi do {dan(status.expires_at)}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">Nije povezan</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Učitavanje…
          </p>
        ) : (
          <>
            {/* Sveže generisan link — jedini trenutak kada se vidi */}
            {freshUrl && (
              <div className="space-y-2">
                <label htmlFor="claude-mcp-url" className="text-sm font-medium flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Tvoj link
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
                  <Button variant="outline" size="icon" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Sakrij link" : "Prikaži link"}>
                    {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button onClick={copy}>
                    {copied ? <><Check className="w-4 h-4 mr-1.5" /> Kopirano</> : <><Copy className="w-4 h-4 mr-1.5" /> Kopiraj</>}
                  </Button>
                </div>
                <div className="flex gap-2 text-sm rounded-md border border-warning/40 bg-warning/5 p-3">
                  <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p>
                    <strong>Čuvaj ga kao lozinku</strong> — ko ga ima, vidi tvoje razgovore i leadove.
                    Prikazuje se samo sada, pa ga odmah nalepi u Claude.
                  </p>
                </div>
              </div>
            )}

            {/* Postoji link, ali je token već prikazan i ne čuvamo ga */}
            {!freshUrl && status && (
              <p className="text-sm text-muted-foreground">
                Link je aktivan. Iz bezbednosnih razloga ga ne čuvamo, pa se ne može
                ponovo prikazati — ako ti treba novi, generiši ga (stari se tada opoziva).
              </p>
            )}

            <ol className="space-y-2.5 text-sm">
              {[
                <>Otvori <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline inline-flex items-center gap-1">claude.ai → Settings → Connectors <ExternalLink className="w-3 h-3" /></a></>,
                <>Klikni <strong>+ Add custom connector</strong> i nalepi link</>,
                <>U razgovoru: <strong>+</strong> → <strong>Connectors</strong> → uključi <strong>aichatbot-rs</strong></>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground [&_strong]:text-foreground">{step}</span>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={create} disabled={busy !== null}>
                  {busy === "create" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {status ? "Generiši novi link" : "Generiši link"}
                </Button>
                {status && (
                  <Button variant="ghost" onClick={revoke} disabled={busy !== null} className="text-destructive hover:text-destructive">
                    {busy === "revoke" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                    Opozovi pristup
                  </Button>
                )}
              </div>
              <a href="/uputstvo/claude" target="_blank" rel="noopener noreferrer" className="text-sm text-primary font-medium hover:underline">
                Detaljno uputstvo
              </a>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              Konektor je u režimu samo za čitanje i vidi isključivo tvoj nalog.
              Claude ne može da menja podatke niti da priđe tuđim nalozima.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
