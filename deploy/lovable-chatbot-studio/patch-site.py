#!/usr/bin/env python3
"""
Ukopcava sekciju "Claude konektor" u postojecu stranicu /integracije
i dodaje javnu rutu /uputstvo/claude.

    python3 patch-site.py /putanja/do/lovable-chatbot-studio

Menja fajlove NA MESTU u ciljnom repou. Pukne ako marker nije nadjen,
umesto da tiho promasi.
"""
import sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
here = pathlib.Path(__file__).parent
applied = []

def patch(rel, marker, replacement, label):
    """Idempotentno: ako je izmena vec primenjena, preskace."""
    p = root / rel
    s = p.read_text(encoding='utf-8')
    if replacement in s:
        applied.append(f"{rel}: {label} (vec primenjeno)")
        return
    if marker not in s:
        raise SystemExit(
            f"GRESKA: marker nije nadjen u {rel} -> {label}\n"
            f"  Taj deo fajla se promenio. Pogledaj rucno, ne pretpostavljaj."
        )
    if s.count(marker) != 1:
        raise SystemExit(f"GRESKA: marker nije jedinstven ({s.count(marker)}x) u {rel} -> {label}")
    p.write_text(s.replace(marker, replacement, 1), encoding='utf-8')
    applied.append(f"{rel}: {label}")

def copy(rel):
    src, dst = here / rel, root / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding='utf-8'), encoding='utf-8')
    applied.append(f"{rel}: kopiran")

# ── novi fajlovi ───────────────────────────────────────────────────────────
for f in [
    'src/components/ClaudeConnectorSection.tsx',
    'src/pages/UputstvoClaude.tsx',
    'supabase/functions/_shared/claudeScope.ts',
    'supabase/functions/claude-connector/index.ts',
    'supabase/functions/claude-connector-link/index.ts',
    'supabase/migrations/20261007000000_claude_connector_links.sql',
]:
    copy(f)

# ── sekcija na /integracije ────────────────────────────────────────────────
patch(
 'src/pages/Integrations.tsx',
 """import {
  Mail, Calendar, HardDrive, MessageSquare, FileText, Users, Zap,
  Link2, CheckCircle2, Loader2, Plug, KeyRound, ExternalLink,
} from "lucide-react";""",
 """import {
  Mail, Calendar, HardDrive, MessageSquare, FileText, Users, Zap,
  Link2, CheckCircle2, Loader2, Plug, KeyRound, ExternalLink,
} from "lucide-react";
import ClaudeConnectorSection from "@/components/ClaudeConnectorSection";""",
 "import sekcije")

patch(
 'src/pages/Integrations.tsx',
 """      </div>

      {!platformGoogle && (""",
 """      </div>

      {/* Claude konektor — korisnik svoj nalog povezuje sa claude.ai.
          Stoji prvi jer je jedina integracija koja ne traži tudji API kljuc. */}
      <ClaudeConnectorSection />

      {!platformGoogle && (""",
 "sekcija u telu stranice")

# ── javna ruta /uputstvo/claude ────────────────────────────────────────────
patch(
 'src/App.tsx',
 """import Docs from "./pages/Docs";""",
 """import Docs from "./pages/Docs";
import UputstvoClaude from "./pages/UputstvoClaude";""",
 "import strane uputstva")

# Uputstvo je javno - ide u zonu bez sidebar-a, da moze da se posalje i
# klijentu koji nije prijavljen.
patch(
 'src/App.tsx',
 """                    <Route path="/docs" element={<Docs />} />""",
 """                    <Route path="/docs" element={<Docs />} />
                    <Route path="/uputstvo/claude" element={<UputstvoClaude />} />""",
 "javna ruta /uputstvo/claude")

# Link preview za javno uputstvo - taj link se salje klijentima.
patch(
 'vite-plugins/route-meta.ts',
 """  "/brisanje-naloga": {""",
 """  "/uputstvo/claude": {
    title: "Poveži AiChatBot nalog sa Claude-om | aichatbot.rs",
    description: "Pitaj Claude-a o svojim razgovorima, leadovima i statistici običnim jezikom. Podešavanje traje 2 minuta, bez koda.",
  },

  "/brisanje-naloga": {""",
 "link preview za /uputstvo/claude")

# _redirects: konektor pod nasim domenom, iznad catch-all pravila.
rp = root / 'public/_redirects'
rtext = rp.read_text(encoding='utf-8')
RULE = '/mcp  https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/claude-connector  200'
if RULE in rtext:
    applied.append('public/_redirects: pravilo za /mcp vec postoji')
else:
    anchor = '/* /index.html 200'
    if anchor not in rtext:
        raise SystemExit('GRESKA: catch-all pravilo nije nadjeno u public/_redirects')
    block = (
        '# Claude konektor pod NASIM domenom. Bez ovoga klijent u svom Claude\n'
        '# podesavanju vidi supabase.co URL - tudji domen izgleda nepouzdano\n'
        '# i otkriva infrastrukturu.\n'
        '# Mora PRE catch-all pravila, inace ga /* pojede.\n'
        + RULE + '\n\n'
    )
    rp.write_text(rtext.replace(anchor, block + anchor, 1), encoding='utf-8')
    applied.append('public/_redirects: dodato pravilo za /mcp')

print("Primenjeno:")
for a in applied:
    print(f"  - {a}")
print("\nOstaje rucno: Supabase secrets MCP_SIGNING_SECRET i MCP_PUBLIC_URL,")
print("pa migracija iz supabase/migrations/ i deploy obe funkcije.")
print("Detalji: deploy/README.md")
