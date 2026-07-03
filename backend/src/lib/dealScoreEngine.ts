// ── Silnik Deal Score dla DealBase Radar ─────────────────────────────────
// Logika oceny oferty na tle trzech niezaleznych punktow odniesienia,
// zgodnie z ustalona architektura (patrz notatki sesji brandingowej/MVP):
//   1) Rejestr transakcji (RCN/Cenogram) - ile REALNIE zaplacono
//   2) Oferty porownawcze z portali - aktualny poziom cen ofertowych
//   3) Rosnaca wlasna baza (portal_listings_archive) - trendy w czasie
//
// WAZNE: te trzy punkty pokazujemy OSOBNO uzytkownikowi (nie mieszamy
// w jedna liczbe) - to ustalenie z sesji o module wyceny AI. Deal Score
// ponizej to zagregowana ocena 0-100 do sortowania/filtrowania, ale
// pelne uzasadnienie w UI musi cytowac wszystkie trzy zrodla osobno.

export interface PriceReferencePoints {
  transactionAvgPricePerM2: number | null   // punkt 1: RCN/Cenogram
  listingsAvgPricePerM2: number | null      // punkt 2: srednia z portali
  archiveTrendPricePerM2: number | null     // punkt 3: wlasna rosnaca baza
}

export interface MarketDynamics {
  daysOnMarket: number
  priceDropCount: number
  priceDropTotalPercent: number
  similarListingsDisappearedLast30d: number
  similarListingsAddedLast30d: number
}

export interface DealScoreInput {
  offerPricePerM2: number
  references: PriceReferencePoints
  dynamics?: MarketDynamics
}

export interface DealScoreResult {
  score: number // 0-100
  referenceAverage: number | null
  percentBelowMarket: number | null
  sellerMotivationScore: number | null // 0-100, wyzszy = bardziej zmotywowany sprzedajacy
  usedReferences: string[]
}

// ── Krok 1: usredniona referencja z dostepnych punktow ───────────────────
// Nie kazda oferta bedzie miala wszystkie 3 zrodla (np. nowa lokalizacja
// bez historii RCN) - liczymy z tego, co jest dostepne, ale odnotowujemy
// ktorych zrodel uzylismy (przejrzystosc dla uzytkownika).
function averageReferences(refs: PriceReferencePoints): { avg: number | null; used: string[] } {
  const entries: [string, number | null][] = [
    ['rejestr_transakcji', refs.transactionAvgPricePerM2],
    ['oferty_portalowe', refs.listingsAvgPricePerM2],
    ['wlasna_baza_trendow', refs.archiveTrendPricePerM2],
  ]
  const available = entries.filter(([, v]) => v !== null) as [string, number][]
  if (available.length === 0) return { avg: null, used: [] }

  const avg = available.reduce((sum, [, v]) => sum + v, 0) / available.length
  return { avg, used: available.map(([k]) => k) }
}

// ── Krok 2: wskaznik motywacji sprzedajacego (roadmap - nowa funkcja) ────
// Liczony WYLACZNIE z danych, ktore i tak zbieramy (bez nowych zrodel
// zewnetrznych): czas na rynku, liczba/skala obnizek, tempo znikania
// podobnych ofert w okolicy vs tempo pojawiania sie nowych.
export function calculateSellerMotivation(dynamics: MarketDynamics): number {
  let score = 30 // baza

  // Dluzszy czas na rynku = wiekszy nacisk na sprzedaz
  if (dynamics.daysOnMarket > 90) score += 25
  else if (dynamics.daysOnMarket > 45) score += 15
  else if (dynamics.daysOnMarket > 21) score += 5

  // Obnizki ceny - im wiecej i wieksze, tym wyzsza motywacja
  score += Math.min(25, dynamics.priceDropCount * 8)
  score += Math.min(20, dynamics.priceDropTotalPercent * 2)

  // Rynek "goracy" w okolicy (duzo ofert znika, malo nowych) obniza
  // pozorna motywacje TEJ oferty - bo mogla po prostu jeszcze nie zdazyc
  // sie sprzedac, a nie dlatego ze cos z nia nie tak
  const marketPressure = dynamics.similarListingsDisappearedLast30d - dynamics.similarListingsAddedLast30d
  if (marketPressure > 5) score -= 10

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ── Krok 3: glowna funkcja Deal Score ─────────────────────────────────────
export function calculateDealScore(input: DealScoreInput): DealScoreResult {
  const { avg, used } = averageReferences(input.references)

  if (avg === null) {
    return {
      score: 50, // brak danych porownawczych - neutralna ocena, nie zerowa
      referenceAverage: null,
      percentBelowMarket: null,
      sellerMotivationScore: input.dynamics ? calculateSellerMotivation(input.dynamics) : null,
      usedReferences: [],
    }
  }

  const percentBelowMarket = ((avg - input.offerPricePerM2) / avg) * 100

  // Baza: 50 punktow = dokladnie na poziomie rynku. Kazdy % ponizej rynku
  // to +2 punkty, kazdy % powyzej to -2 punkty (do granic 0-100).
  let score = 50 + percentBelowMarket * 2

  const sellerMotivationScore = input.dynamics ? calculateSellerMotivation(input.dynamics) : null

  // Wysoka motywacja sprzedajacego = dodatkowy sygnal ze cena moze
  // jeszcze spasc / ze warto negocjowac - lekki bonus do score
  if (sellerMotivationScore !== null && sellerMotivationScore > 60) {
    score += 5
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    referenceAverage: Math.round(avg),
    percentBelowMarket: Math.round(percentBelowMarket * 10) / 10,
    sellerMotivationScore,
    usedReferences: used,
  }
}
