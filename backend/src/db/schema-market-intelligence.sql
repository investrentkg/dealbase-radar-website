-- ══════════════════════════════════════════════════════════════════════
-- Wspolny "market intelligence layer" — trzeci, neutralny projekt Supabase
-- Czytaja i dokladaja dane: CRM (investrent-crm) oraz Radar (ten projekt).
-- ZADEN produkt nie ma bezposredniego dostepu do bazy drugiego produktu -
-- tylko przez to wspolne API/baze. Zero danych osobowych klientow ani
-- kont uzytkownikow tutaj - wylacznie dane o nieruchomosciach i rynku.
--
-- To jest SZKIC do przedyskutowania z kontekstem istniejacej tabeli
-- portal_listings_archive w CRM - docelowo to prawdopodobnie migracja/
-- rozszerzenie tamtej tabeli do wlasnego projektu, a nie budowa od zera.
-- Do potwierdzenia w dedykowanej sesji laczacej CRM + Radar.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── Zarchiwizowane oferty ze wszystkich portali ──────────────────────────
-- (odpowiednik/rozszerzenie portal_listings_archive z CRM)
create table portal_listings_archive (
  id uuid primary key default uuid_generate_v4(),
  source_portal text not null, -- otodom, olx, gratka, morizon, nieruchomosci-online, adresowo, domiporta
  source_listing_id text not null,
  property_type text not null,
  transaction_type text not null check (transaction_type in ('sprzedaz', 'wynajem')),
  city text,
  district text,
  street text,
  area_m2 numeric,
  rooms_count int,
  price numeric,
  price_per_m2 numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz, -- null = nadal aktywna; wypelnione = zniknela (sprzedana/wygasla)
  price_history jsonb not null default '[]', -- [{date, price}, ...] do wykresu trendu
  raw_data jsonb,
  unique (source_portal, source_listing_id)
);

create index idx_archive_location on portal_listings_archive (city, district);
create index idx_archive_active on portal_listings_archive (removed_at) where removed_at is null;

-- ── Licytacje komornicze i udzialy (nowa kategoria, sesja lipcowa) ────────
create table court_auctions (
  id uuid primary key default uuid_generate_v4(),
  source_id text unique not null, -- id z licytacje.komornik.pl
  title text not null,
  property_type text not null,
  is_fractional_share boolean not null default false,
  voivodeship text,
  location text,
  call_price numeric not null, -- cena wywolania
  estimated_value numeric not null, -- suma oszacowania
  auction_date timestamptz not null,
  auction_type text check (auction_type in ('stacjonarna', 'elektroniczna')),
  published_at timestamptz,
  source_url text,
  fetched_at timestamptz not null default now()
);

create index idx_auctions_date on court_auctions (auction_date);
create index idx_auctions_location on court_auctions (voivodeship, location);

-- ── Rejestr transakcji (RCN/Cenogram - agregacja, nie surowe dane osobowe) ─
-- Tylko zagregowane statystyki per lokalizacja, NIE pojedyncze transakcje
-- z danymi stron - to jest publiczna/agregowana informacja rynkowa.
create table transaction_price_stats (
  id uuid primary key default uuid_generate_v4(),
  city text not null,
  district text,
  property_type text not null,
  market_type text not null check (market_type in ('pierwotny', 'wtorny')),
  avg_price_per_m2 numeric not null,
  median_price_per_m2 numeric,
  sample_size int not null,
  period_start date not null,
  period_end date not null,
  fetched_at timestamptz not null default now(),
  unique (city, district, property_type, market_type, period_start, period_end)
);

-- Ta baza NIE ma RLS wlaczonego na start, bo docelowo dostep jest
-- wylacznie przez service-role API (backend CRM i backend Radar), nie
-- bezposrednio z frontendu zadnego z produktow. Do potwierdzenia przy
-- zakladaniu projektu czy to wystarczajace, czy dodac RLS + role serwisowe.
