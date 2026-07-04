import { createClient } from '@supabase/supabase-js'

// ── Baza Radaru: konta, subskrypcje, watchlisty, alerty ─────────────────
// Osobny projekt Supabase od CRM (izolacja danych wrazliwych: klienci CRM
// vs konta/platnosci uzytkownikow indywidualnych Radaru).
// UWAGA: to jest ten sam fizyczny projekt co market_intel (patrz notatka
// architektury OPCJA A - limit 2 darmowych projektow na koncie), ale
// osobny SCHEMAT postgresa ('radar') z wlasnym RLS - logiczna izolacja
// zamiast fizycznej. Kazdy klient bindowany jest do jednego schematu.
export const radarDb = createClient(
  process.env.RADAR_SUPABASE_URL || '',
  process.env.RADAR_SUPABASE_SERVICE_KEY || '',
  { db: { schema: 'radar' } }
)

// ── Wspolny "market intelligence layer" ──────────────────────────────────
// Ten sam projekt co powyzej, ale osobny schemat ('market_intel') bez RLS -
// dostep tylko przez service-role (ten klient), nigdy z przegladarki.
export const marketIntelDb = createClient(
  process.env.MARKET_INTEL_SUPABASE_URL || '',
  process.env.MARKET_INTEL_SUPABASE_SERVICE_KEY || '',
  { db: { schema: 'market_intel' } }
)
