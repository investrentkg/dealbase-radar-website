import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════════════
// OTODOM SCRAPER — pobiera dane z __NEXT_DATA__ Next.js (jak nbot)
// Nie wymaga API keys. Działa identycznie jak wszystkie agregatory PL.
// ═══════════════════════════════════════════════════════════════════

const CITY_SLUGS: Record<string, string> = {
  'kolobrzeg': 'zachodniopomorskie/kolobrzeg/kolobrzeg/kolobrzeg',
  'kołobrzeg': 'zachodniopomorskie/kolobrzeg/kolobrzeg/kolobrzeg',
  'ustronie morskie': 'zachodniopomorskie/kolobrzeg/ustronie-morskie',
  'sianozety': 'zachodniopomorskie/kolobrzeg/sianozety',
  'dziwnow': 'zachodniopomorskie/kamienski/dziwnow/dziwnow',
  'mielno': 'zachodniopomorskie/koszalinski/mielno/mielno',
  'szczecin': 'zachodniopomorskie/szczecin/szczecin/szczecin',
  'warszawa': 'mazowieckie/warszawa/warszawa/warszawa',
  'krakow': 'malopolskie/krakow/krakow/krakow',
  'kraków': 'malopolskie/krakow/krakow/krakow',
  'gdansk': 'pomorskie/gdansk/gdansk/gdansk',
  'gdańsk': 'pomorskie/gdansk/gdansk/gdansk',
  'wroclaw': 'dolnoslaskie/wroclaw/wroclaw/wroclaw',
  'wrocław': 'dolnoslaskie/wroclaw/wroclaw/wroclaw',
  'poznan': 'wielkopolskie/poznan/poznan/poznan',
  'poznań': 'wielkopolskie/poznan/poznan/poznan',
}

function buildOtodomUrl(params: PortalSearchParams): string {
  const trans = params.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const propType = ({
    mieszkanie: 'mieszkanie', dom: 'dom', dzialka: 'dzialka',
    lokal: 'lokal', garaz: 'garaz'
  })[params.property_type || 'mieszkanie'] || 'mieszkanie'

  const cityKey = (params.city || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  const cityPath = CITY_SLUGS[cityKey] || CITY_SLUGS[(params.city || '').toLowerCase()] || 'cala-polska'

  const base = `https://www.otodom.pl/pl/wyniki/${trans}/${propType}/${cityPath}`
  const qp = new URLSearchParams({ limit: '25', page: '1', by: 'DEFAULT', direction: 'DESC' })
  if (params.price_min) qp.set('priceMin', String(params.price_min))
  if (params.price_max) qp.set('priceMax', String(params.price_max))
  if (params.area_min)  qp.set('areaMin',  String(params.area_min))
  if (params.area_max)  qp.set('areaMax',  String(params.area_max))
  if (params.rooms_min) {
    const roomMap: Record<number, string> = {1:'ONE',2:'TWO',3:'THREE',4:'FOUR',5:'FIVE'}
    const r = roomMap[params.rooms_min]
    if (r) qp.set('roomsNumber', r)
  }
  return `${base}?${qp.toString()}`
}

function roomsToNumber(r: string | null): number | null {
  if (!r) return null
  const m: Record<string, number> = {ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5,MORE:6}
  return m[r] ?? null
}

function parseListing(raw: any, transType: string): PortalListing {
  const price = raw.totalPrice?.value ?? raw.prices?.sale?.value ?? null
  const rentPrice = transType === 'wynajem' ? price : null
  const img = raw.images?.[0]?.large || raw.images?.[0]?.medium || null

  return {
    portal: 'otodom',
    external_id: String(raw.id),
    url: `https://www.otodom.pl/pl/oferta/${raw.slug || raw.id}`,
    title: raw.title || '',
    price: transType !== 'wynajem' ? price : null,
    rent_price: rentPrice,
    area: raw.areaInSquareMeters ?? null,
    rooms_count: roomsToNumber(raw.roomsNumber ?? null),
    address_city: raw.location?.address?.city?.name || '',
    address_district: raw.location?.address?.district?.name || null,
    address_street: null,
    property_type: raw.estate || transType,
    transaction_type: transType,
    thumbnail_url: img,
    description: raw.shortDescription?.substring(0, 300) || null,
    posted_at: raw.dateCreatedFirst || raw.pushedUpAt || null,
    agency_name: raw.agency?.name || null,
    is_private: !raw.agency
  }
}

async function fetchOtodomPage(url: string): Promise<any[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(12000)
  })

  if (!res.ok) throw new Error(`Otodom HTTP ${res.status}`)
  const html = await res.text()

  // Wyciągnij __NEXT_DATA__ z HTML
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('Brak __NEXT_DATA__ w odpowiedzi Otodom')

  const nextData = JSON.parse(match[1])
  const items = nextData?.props?.pageProps?.data?.searchAds?.items
  if (!Array.isArray(items)) throw new Error('Nieoczekiwana struktura danych Otodom')
  return items
}

export const otodomScraperAdapter: PortalAdapter = {
  name: 'otodom',
  label: 'Otodom',

  isConfigured() { return true }, // Nie wymaga konfiguracji

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const url = buildOtodomUrl(params)
    console.log(`[Otodom] Scraping: ${url}`)

    try {
      const items = await fetchOtodomPage(url)
      const listings = items
        .slice(0, params.limit || 20)
        .map(raw => parseListing(raw, params.transaction_type))

      return {
        portal: 'otodom',
        listings,
        total: listings.length,
        source_url: url
      }
    } catch (err: any) {
      console.error('[Otodom scraper error]', err.message)
      return { portal: 'otodom', listings: [], total: 0, error: err.message, source_url: url }
    }
  }
}
