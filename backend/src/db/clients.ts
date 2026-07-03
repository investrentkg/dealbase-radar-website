import { createClient } from '@supabase/supabase-js'

// ── Baza Radaru: konta, subskrypcje, watchlisty, alerty ─────────────────
// Osobny projekt Supabase od CRM (izolacja danych wrazliwych: klienci CRM
// vs konta/platnosci uzytkownikow indywidualnych Radaru - patrz notatka
// architektury: "Dane wrazliwe trzymane w osobnych projektach Supabase").
export const radarDb = createClient(
  process.env.RADAR_SUPABASE_URL || '',
  process.env.RADAR_SUPABASE_SERVICE_KEY || ''
)

// ── Wspolny "market intelligence layer" ──────────────────────────────────
// Trzeci, neutralny projekt Supabase. Zarowno CRM jak i Radar czerpia
// z niego i dokladaja dane przez kontrolowane API - zaden produkt nie ma
// bezposredniego dostepu do bazy drugiego produktu.
// Docelowo to bedzie rozszerzenie istniejacej tabeli portal_listings_archive
// z CRM, wyniesione do wlasnego projektu.
export const marketIntelDb = createClient(
  process.env.MARKET_INTEL_SUPABASE_URL || '',
  process.env.MARKET_INTEL_SUPABASE_SERVICE_KEY || ''
)
