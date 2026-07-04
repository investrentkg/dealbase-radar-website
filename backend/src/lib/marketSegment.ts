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
]

export type MarketSegment = 'standard' | 'premium'

export function detectMarketSegment(listing: { title?: string | null; description?: string | null }): MarketSegment {
  const text = `${listing.title || ''} ${listing.description || ''}`.toLowerCase()
  const isPremium = PREMIUM_KEYWORDS.some(kw => text.includes(kw))
  return isPremium ? 'premium' : 'standard'
}
