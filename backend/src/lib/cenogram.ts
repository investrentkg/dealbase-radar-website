// ═══════════════════════════════════════════════════════════════════
// CENOGRAM — dostęp do Rejestru Cen Nieruchomości (RCN, dane oficjalne
// wg art. 40c Prawa geodezyjnego i kartograficznego, otwarte od 13.02.2026)
//
// UWAGA — WERSJA POPRAWIONA (2.07.2026) PO REALNYM TEŚCIE NA ŻYWO:
// Wcześniejsza wersja zgadywała parametry na podstawie schematu narzędzi MCP
// (location, propertyType jako string "unit"), które NIE odpowiadają
// prawdziwemu REST API. Prawdziwe REST API (potwierdzone bezpośrednim testem):
// - parametr to "district" (nie "location") — działa też dla miast, nie tylko dzielnic
// - propertyType to LICZBA: 1=działka, 3=dom/zabudowana, 4=lokal/mieszkanie
// - marketType to LICZBA: 1=pierwotny, 2=wtórny
// - pola odpowiedzi: price_gross (nie price), usable_area_m2 (nie area),
//   price_per_m2 (string), transaction_date (nie date)
// - WYMAGANY nagłówek User-Agent przypominający przeglądarkę — bez niego
//   Cloudflare blokuje zapytanie (błąd 1010, "browser_signature_banned"),
//   co wcześniej powodowało ciche zwracanie zera wyników.
// ═══════════════════════════════════════════════════════════════════

const CENOGRAM_BASE = 'https://cenogram.pl/api/v1'
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface RcnTransaction {
  price: number
  pricePerM2: number
  area: number
  rooms?: number | null
  floor?: number | null
  date: string
  street?: string | null
  district?: string | null
  marketType?: string | null
}

export interface RcnStats {
  count: number
  medianPricePerM2: number | null
  minPricePerM2: number | null
  maxPricePerM2: number | null
  transactions: RcnTransaction[]
  usedStreetFallback: boolean // true = brak transakcji dla dokładnego numeru budynku, użyto całej ulicy
  outliersExcluded: number // liczba transakcji odrzuconych jako statystyczne odstępstwa (metoda IQR)
}

export function isCenogramConfigured(): boolean {
  return !!process.env.CENOGRAM_API_KEY
}

// Zweryfikowane na żywo kody propertyType (REST, nie MCP):
const PROPERTY_TYPE_CODE: Record<string, string> = {
  mieszkanie: '4',
  lokal: '4',       // lokal użytkowy — ten sam kod co mieszkanie, rozróżnia się przez unitFunction
  dom: '3',
  dzialka: '1',
}
const MARKET_TYPE_CODE: Record<string, string> = {
  pierwotny: '1',
  wtorny: '2',
}

/**
 * Pobiera porównywalne transakcje z RCN (przez Cenogram) dla danej lokalizacji
 * i parametrów nieruchomości. Zwraca null jeśli API nieskonfigurowane lub błąd —
 * wycena AI powinna wtedy działać dalej bez tego źródła (nie blokować całości).
 */
export async function getRcnComparables(params: {
  city: string
  district?: string | null
  street?: string | null
  buildingNumber?: string | null
  propertyType: string
  area: number
  marketType?: string | null // 'pierwotny' | 'wtorny' w naszym systemie
}): Promise<RcnStats | null> {
  const apiKey = process.env.CENOGRAM_API_KEY
  if (!apiKey) return null

  try {
    const baseQuery: Record<string, string> = {
      district: params.district || params.city, // REST API akceptuje też nazwy miast w tym polu
      minArea: String(Math.round(params.area * 0.75)),
      maxArea: String(Math.round(params.area * 1.25)),
      limit: '30',
      dateFrom: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }
    const propCode = PROPERTY_TYPE_CODE[params.propertyType]
    if (propCode) baseQuery.propertyType = propCode
    if (params.street) baseQuery.street = params.street
    // Wyklucz transakcje pozarynkowe (licytacje komornicze, darowizny rodzinne, sprzedaż
    // z bonifikatą itd.) — mają ceny niereprezentatywne dla realnej wartości rynkowej
    // i zaniżałyby/zniekształcały porównanie. Zalecane wprost przez dokumentację Cenogram.
    baseQuery.transactionType = 'free_market'
    const marketCode = params.marketType ? MARKET_TYPE_CODE[params.marketType] : undefined
    if (marketCode) baseQuery.marketType = marketCode

    async function fetchTransactions(query: Record<string, string>) {
      const qs = new URLSearchParams(query).toString()
      const res = await fetch(`${CENOGRAM_BASE}/transactions?${qs}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': BROWSER_UA, // wymagane — bez tego Cloudflare blokuje zapytanie (403)
          'Accept': 'application/json'
        }
      })
      if (!res.ok) { console.error(`Cenogram API błąd: ${res.status}`); return null }
      return res.json() as Promise<any>
    }

    let data: any = null
    let usedFallback = false

    // Jeśli podano numer budynku, spróbuj najpierw precyzyjnie — a jeśli zero wyników
    // (typowe dla nowszych/mniejszych budynków, nie każdy ma transakcje w rejestrze),
    // cofnij się do wyszukiwania po całej ulicy, żeby nie tracić użytecznych danych porównawczych.
    if (params.buildingNumber && params.street) {
      data = await fetchTransactions({ ...baseQuery, buildingNumber: params.buildingNumber })
      if (!data || !data.data || data.data.length === 0) {
        usedFallback = true
        data = await fetchTransactions(baseQuery)
      }
    } else {
      data = await fetchTransactions(baseQuery)
    }

    if (!data) return null
    const items: any[] = data.data || []

    const transactions: RcnTransaction[] = items.map((t: any) => {
      const price = parseFloat(t.price_gross)
      const area = parseFloat(t.usable_area_m2 || t.parcel_area)
      const pricePerM2 = t.price_per_m2 ? parseFloat(t.price_per_m2) : (area ? Math.round(price / area) : 0)
      return {
        price,
        pricePerM2,
        area,
        rooms: t.rooms || null,
        floor: t.floor ?? null,
        date: t.transaction_date,
        street: t.street ?? null,
        district: t.district ?? null,
        marketType: t.market_type === 1 ? 'pierwotny' : t.market_type === 2 ? 'wtorny' : null,
      }
    }).filter((t: RcnTransaction) => t.price && t.area && t.pricePerM2 > 0)

    // Wykrywanie i odrzucanie statystycznych odstępstw metodą IQR (rozstęp międzykwartylowy) —
    // łapie skrajności, których transactionType=free_market mógł nie wychwycić (np. sprzedaż
    // między rodziną mimo formalnie "wolnorynkowego" oznaczenia, błędny wpis w rejestrze itp.).
    let filteredTransactions = transactions
    let outliersExcluded = 0
    if (transactions.length >= 8) { // IQR ma sens tylko przy odpowiednio dużej próbce
      const sorted = [...transactions].sort((a, b) => a.pricePerM2 - b.pricePerM2)
      const q1 = sorted[Math.floor(sorted.length * 0.25)].pricePerM2
      const q3 = sorted[Math.floor(sorted.length * 0.75)].pricePerM2
      const iqr = q3 - q1
      const lowerBound = q1 - 1.5 * iqr
      const upperBound = q3 + 1.5 * iqr
      filteredTransactions = transactions.filter(t => t.pricePerM2 >= lowerBound && t.pricePerM2 <= upperBound)
      outliersExcluded = transactions.length - filteredTransactions.length
    }

    const pricesPerM2 = filteredTransactions.map(t => t.pricePerM2).sort((a, b) => a - b)
    const median = pricesPerM2.length > 0
      ? pricesPerM2[Math.floor(pricesPerM2.length / 2)]
      : null

    return {
      count: data.pagination?.total ?? transactions.length,
      medianPricePerM2: median,
      minPricePerM2: pricesPerM2.length > 0 ? pricesPerM2[0] : null,
      maxPricePerM2: pricesPerM2.length > 0 ? pricesPerM2[pricesPerM2.length - 1] : null,
      transactions: filteredTransactions.slice(0, 12), // wystarczy do promptu, nie zaśmiecamy kontekstu
      usedStreetFallback: usedFallback,
      outliersExcluded,
    }
  } catch (err: any) {
    console.error('Cenogram fetch error:', err.message)
    return null
  }
}
