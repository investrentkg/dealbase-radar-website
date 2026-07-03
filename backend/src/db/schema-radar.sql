-- ══════════════════════════════════════════════════════════════════════
-- DealBase Radar — schemat bazy "radar" (osobny projekt Supabase od CRM)
-- Dane wrazliwe: konta indywidualnych inwestorow, subskrypcje, platnosci.
-- Twardo odizolowane od danych klientow CRM (inny kontekst prawny: B2C
-- vs B2B, inne ryzyko w razie wycieku). Patrz notatka architektury sesji
-- brandingowej: "trzeci, neutralny projekt Supabase jako wspolny market
-- intelligence layer" - TA baza to NIE ten trzeci projekt, tylko warstwa
-- kont/platnosci samego Radaru.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── Uzytkownicy ──────────────────────────────────────────────────────────
create table radar_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  password_hash text not null,
  plan text not null default 'basic' check (plan in ('basic', 'pro', 'vip')),
  trial_ends_at timestamptz,
  referred_by uuid references radar_users(id),
  referral_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table radar_users enable row level security;
create policy "users manage own account" on radar_users
  for all using (auth.uid() = id);

-- ── Subskrypcje / platnosci ──────────────────────────────────────────────
create table radar_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references radar_users(id) on delete cascade,
  plan text not null check (plan in ('basic', 'pro', 'vip')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz not null,
  -- Limit wizyt weryfikacyjnych na miejscu - VIP ma 1 gratis/kwartal,
  -- kazda kolejna plus dodatek dla nizszych planow placony osobno
  -- (WAZNA decyzja o marzy z sesji cennikowej - NIE zmieniac na
  -- "unlimited" bez ponownej analizy kosztu krancowego)
  site_visits_used_this_quarter int not null default 0,
  created_at timestamptz not null default now()
);

alter table radar_subscriptions enable row level security;
create policy "users view own subscription" on radar_subscriptions
  for select using (auth.uid() = user_id);

-- ── Obserwowane wyszukiwania (watchlisty) ─────────────────────────────────
create table watchlists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references radar_users(id) on delete cascade,
  name text,
  criteria jsonb not null, -- {city, propertyType, priceMin, priceMax, includeAuctions, ...}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table watchlists enable row level security;
create policy "users manage own watchlists" on watchlists
  for all using (auth.uid() = user_id);

-- ── Log wyslanych alertow (do debugowania + limitow planu) ────────────────
create table alerts_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references radar_users(id) on delete cascade,
  watchlist_id uuid references watchlists(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  listing_reference text, -- id/url oferty ktorej dotyczy alert
  sent_at timestamptz not null default now()
);

alter table alerts_log enable row level security;
create policy "users view own alerts log" on alerts_log
  for select using (auth.uid() = user_id);

-- ── Preferencje powiadomien ────────────────────────────────────────────
create table notification_preferences (
  user_id uuid primary key references radar_users(id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false, -- wymaga planu pro+
  push_enabled boolean not null default false, -- wymaga planu pro+
  frequency text not null default 'instant' check (frequency in ('instant', 'daily_digest')),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;
create policy "users manage own preferences" on notification_preferences
  for all using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- AUDYT RLS (uruchomic po kazdej zmianie w tym pliku, zgodnie z procedura
-- obowiazujaca przy pracach nad CRM - ta sama zasada dotyczy Radaru):
--
-- select tablename, rowsecurity, count(policyname) as policy_count
-- from pg_tables
-- left join pg_policies using (schemaname, tablename)
-- where schemaname = 'public'
-- group by tablename, rowsecurity;
--
-- Upewnic sie ze ZADNA tabela nie ma rowsecurity=true i policy_count=0.
-- ══════════════════════════════════════════════════════════════════════
