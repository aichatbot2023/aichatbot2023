-- Linkovi za Claude konektor.
-- Cuva se SAMO sha256 hash tokena - sam token ne postoji u bazi,
-- pa ni curenje baze ne daje nikome pristup. Hash sluzi za opoziv.

create table if not exists public.claude_connector_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null unique,
  role          text not null default 'client',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);

-- Konektor na svaki zahtev proverava hash; indeks drzi tu proveru brzom.
create index if not exists claude_connector_links_hash_idx
  on public.claude_connector_links (token_hash) where revoked_at is null;

create index if not exists claude_connector_links_user_idx
  on public.claude_connector_links (user_id);

alter table public.claude_connector_links enable row level security;

-- Korisnik vidi svoje linkove (bez tokena - njega i nema u tabeli).
create policy "vlasnik vidi svoje linkove"
  on public.claude_connector_links for select
  using (auth.uid() = user_id);

-- Upis i opoziv idu kroz claude-connector-link funkciju (service role),
-- koja zaobilazi RLS. Klijent ne upisuje direktno.
