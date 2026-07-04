// ── Segmentacja rynkowa ofert ─────────────────────────────────────────
// Problem realny (odkryty na danych z Kolobrzegu): jedna, zlepiona
// mediana ceny dla calego miasta miesza dwa zupelnie inne rynki -
// zwykle osiedla mieszkaniowe vs luksusowe apartamenty inwestycyjne/
// kurortowe (widok na morze, basen, SPA). Dzielnica z danych portalu
// nie rozwiazuje tego (czesto null, a i tak "zwykle" i "luksusowe"
// budynki stoja czasem przy tej samej ulicy w miastach nadmorskich).
//
// Rozwiazanie: wykrywanie segmentu na podstawie TRESCI oferty (tytul +
// opis), nie geografii. Dziala dla kazdego miasta w Polsce, nie tylko
// tych ze stref uzdrowiskowych - ten sam mechanizm zlapie np. apartamenty
// premium w Zakopanem, Karpaczu, czy ekskluzywne inwestycje w Warszawie.
//
// To NIE jest ML/AI - to prosta, przejrzysta heurystyka slow kluczowych.
// Wystarczajaca do rozdzielenia dwoch grubych koszykow (standard/premium),
// nie probuje precyzyjnie wyceniac - to robi dopiero Deal Score na bazie
// PRAWIDLOWO dobranej grupy porownawczej.

const PREMIUM_KEYWORDS = [
  'apartament inwestycyjny', 'condohotel', 'condo-hotel', 'aparthotel',
  'widok na morze', 'pierwsza linia brzegowa', 'strefa uzdrowiskowa',
  'basen', 'spa', 'sauna', 'jacuzzi', 'recepcja', 'concierge',
  'najem krotkoterminowy', 'wynajem apartamentow', 'gwarantowany zysk',
  'zarobki rocznie', 'stopa zwrotu', 'kurort', 'resort',
  'penthouse', 'apartamenty premium', 'apartamenty wakacyjne',
  // rozszerzenie: dodatkowe sygnaly luksusu/inwestycji wykryte podczas
  // przegladu ogloszen w sesji dot. segmentacji
  'ekskluzywny', 'prestizowy', 'najwyzszy standard', 'design',
  'taras z widokiem', 'apartamentowiec', 'inwestycja pod wynajem',
  'obsluga hotelowa', 'siownia', 'strefa wellness', 'whirlpool',
]

export type MarketSegment = 'standard' | 'premium'

export interface SegmentDetection {
  segment: MarketSegment
  confidence: number // 0-1, ilosc trafien / znormalizowana
  matchedKeywords: string[]
}

// Zwraca pelny wynik z pewnoscia i lista trafionych slow (przydatne do
// debugowania i do przyszlego wazenia zamiast binarnej decyzji).
export function detectMarketSegmentDetailed(listing: { title?: string | null; description?: string | null }): SegmentDetection {
  const text = `${listing.title || ''} ${listing.description || ''}`.toLowerCase()
  const matched = PREMIUM_KEYWORDS.filter(kw => text.includes(kw))

  // Prosta normalizacja: 1 trafienie = srednia pewnosc, 3+ trafien = wysoka.
  // To nadal heurystyka, nie model ML - ale daje wiecej niz sztywne 0/1,
  // przydatne gdy w przyszlosci zechcemy np. odrzucac niskopewne decyzje
  // zamiast zawsze wrzucac do jednego z dwoch koszykow.
  const confidence = matched.length === 0 ? 0 : Math.min(1, 0.5 + matched.length * 0.15)

  return {
    segment: matched.length > 0 ? 'premium' : 'standard',
    confidence: matched.length > 0 ? confidence : 1, // "standard" przy braku trafien tez jest pewne (brak sygnalow premium)
    matchedKeywords: matched,
  }
}

export function detectMarketSegment(listing: { title?: string | null; description?: string | null }): MarketSegment {
  return detectMarketSegmentDetailed(listing).segment
}
