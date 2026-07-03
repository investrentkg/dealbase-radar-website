# DealBase Radar — backend (szkielet)

Status: **szkielet/scaffold**, zbudowany bez integracji z prawdziwą infrastrukturą — czeka na kilka decyzji/danych dostępowych, których nie da się zastąpić.

## Co jest gotowe

- Struktura projektu Express + TypeScript, wzorowana na konwencjach z `investrent-crm/backend` (Router per zasób, `middleware/auth.ts`, `lib/`)
- **Silnik Deal Score** (`src/lib/dealScoreEngine.ts`) — w pełni zaimplementowana logika: trzy punkty odniesienia liczone i pokazywane osobno, plus nowy wskaźnik "motywacji sprzedającego" (czas na rynku, liczba obniżek, tempo znikania ofert w okolicy) — to jedyny moduł, który realnie działa już teraz, bez żadnych zewnętrznych zależności
- Middleware autoryzacji z rozróżnieniem planów (basic/pro/vip) zamiast ról agent/manager z CRM
- Endpointy API (auth, search, deal-score, auctions, watchlist, alerts) — na razie zwracają `501 Not Implemented` z jasnym opisem czego brakuje, żeby struktura była gotowa do podłączenia
- Moduł `courtAuctions.ts` — typy i logika liczenia rabatu dla licytacji komorniczych, parser HTML do dopracowania w dedykowanej sesji
- Dwa schematy SQL: `schema-radar.sql` (konta/subskrypcje/watchlisty — z RLS) i `schema-market-intelligence.sql` (wspólna warstwa danych rynkowych, szkic do przedyskutowania z architekturą CRM)

## Czego NIE da się zrobić beze mnie/Ciebie razem

1. **Nowy projekt Supabase dla Radaru** (konta/subskrypcje) — wymaga założenia w Supabase dashboard, potem podania mi URL + service key
2. **Trzeci, neutralny projekt Supabase** (market intelligence layer) — jw., plus decyzja czy to migracja istniejącej `portal_listings_archive` z CRM, czy budowa równoległa z synchronizacją
3. **Nowe repozytorium GitHub** dla tego kodu (albo decyzja, żeby zostawić tymczasowo w folderze `backend/` w `dealbase-radar-website`, tak jak jest teraz) + nadanie tokenowi dostępu, jeśli osobne repo
4. **Token Apify** — reużyć istniejący z CRM, czy założyć osobny na start (wpływa na limity/koszty wspólne)
5. **Bramka SMS** — wybór dostawcy (SMSAPI.pl / Twilio / inny) i konto
6. **JWT_SECRET** i inne zmienne środowiskowe z `.env.example`

## Następny krok, jak wrócisz

Najmniejsza sensowna kolejność: (1) → (2) → uruchomienie `npm install` + wypełnienie `.env` → pierwszy realny test rejestracji/logowania → dopiero potem search/Apify/alerty.
