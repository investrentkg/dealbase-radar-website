// ── Licytacje komornicze i udziały - licytacje.komornik.pl ──────────────
// Zrodlo: oficjalny, publiczny portal Krajowej Rady Komorniczej.
// Jawnosc wynika z art. 955 k.p.c. - przegladanie ofert nie wymaga
// logowania (logowanie potrzebne dopiero do faktycznego udzialu w
// licytacji). Portal ma wbudowana wyszukiwarke:
// https://licytacje.komornik.pl/wyszukiwarka-licytacji
//
// "Ulamkowa czesc nieruchomosci" / udzialy pojawiaja sie jako naturalny
// podzbior wynikow tego samego rejestru - NIE jest to osobne zrodlo do
// integrowania, tylko filtr na tych samych danych.
//
// TODO (nastepna sesja, dedykowana): sprawdzic czy portal udostepnia
// jakikolwiek ustrukturyzowany feed (RSS/XML) zamiast parsowania HTML -
// KRK czasem oferuje to dla systemow kancelaryjnych. Jesli nie, potrzebny
// bedzie lekki, dobrze otagowany scraper (podobny wzorzec do Apify actora
// z CRM, ale to nie jest chronione Cloudflare jak Otodom, wiec mozliwe
// ze wystarczy prosty fetch + parser HTML bez Apify).

export interface CourtAuctionListing {
  sourceId: string
  title: string
  propertyType: 'mieszkanie' | 'dom' | 'dzialka' | 'udzial' | 'inne'
  isFractionalShare: boolean // "ulamkowa czesc nieruchomosci"
  voivodeship: string
  location: string
  callPrice: number // cena wywolania
  estimatedValue: number // suma oszacowania
  auctionDate: string // ISO date
  publishedAt: string
  auctionType: 'stacjonarna' | 'elektroniczna'
  sourceUrl: string
}

// Placeholder - implementacja parsera do dedykowanej sesji.
export async function fetchCourtAuctions(_filters: {
  voivodeship?: string
  propertyType?: string
  maxCallPrice?: number
}): Promise<CourtAuctionListing[]> {
  throw new Error('fetchCourtAuctions() nie jest jeszcze zaimplementowane - patrz TODO w tym pliku')
}

// Wskaznik "okazji" specyficzny dla licytacji: im wieksza roznica miedzy
// cena wywolania a suma oszacowania, tym potencjalnie wieksza okazja
// (choc trzeba to zderzyc z cenami transakcyjnymi z RCN dla pelnego obrazu,
// tak jak z normalnymi ofertami - patrz dealScoreEngine.ts).
export function auctionDiscountPercent(listing: CourtAuctionListing): number {
  if (listing.estimatedValue <= 0) return 0
  return Math.round(((listing.estimatedValue - listing.callPrice) / listing.estimatedValue) * 1000) / 10
}
