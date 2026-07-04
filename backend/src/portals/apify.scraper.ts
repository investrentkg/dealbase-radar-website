import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════════════════
// APIFY SCRAPER — polska suite nieruchomości (trev0n actors)
// Wszystkie 5 portali: Otodom, OLX, Gratka, Morizon, Nieruchomości-online
// Actor IDs potwierdzone w Apify Store (maj 2026)
// ═══════════════════════════════════════════════════════════════════════

const APIFY_BASE = 'https://api.apify.com/v2'

const ACTOR_OTODOM      = 'trev0n~otodom-scraper'
const ACTOR_OLX         = 'trev0n~olx-scraper'
const ACTOR_GRATKA      = 'trev0n~gratka-scraper'
const ACTOR_MORIZON     = 'trev0n~morizon-scraper'
const ACTOR_NIERO_ONLINE= 'trev0n~nieruchomosci-online-scraper'
const ACTOR_DOMIPORTA   = 'trev0n~domiporta-scraper'
const ACTOR_ADRESOWO    = 'trev0n~adresowo-scraper'

// Budowanie URL wyszukiwania dla każdego portalu
const CITY_MAP_SLUG: Record<string, string> = {
  kolobrzeg: 'kolobrzeg', kołobrzeg: 'kolobrzeg',
  szczecin: 'szczecin',   warszawa: 'warszawa',
  krakow: 'krakow',       kraków: 'krakow',
  wroclaw: 'wroclaw',     wrocław: 'wroclaw',
  gdansk: 'gdansk',       gdańsk: 'gdansk',
  poznan: 'poznan',       poznań: 'poznan',
}

function citySlug(city: string): string {
  const key = city.toLowerCase()
  return CITY_MAP_SLUG[key] || city.toLowerCase()
    .replace(/ó/g,'o').replace(/ą/g,'a').replace(/ę/g,'e')
    .replace(/ł/g,'l').replace(/ń/g,'n').replace(/ź|ż/g,'z')
    .replace(/ć/g,'c').replace(/ś/g,'s').replace(/\s+/g,'-')
}

// ── Apify runner (wspólny dla wszystkich portali) ─────────────────────
async function runApifyActor(actorId: string, input: any, maxItems: number): Promise<any[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('Brak APIFY_TOKEN')

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${token}&maxItems=${maxItems}&timeout=90&memory=512`

  console.log(`[Apify] ${actorId} | input: ${JSON.stringify(input).substring(0, 150)}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(95000)
  })

  const text = await res.text()
  console.log(`[Apify] ${actorId} → HTTP ${res.status} | ${text.substring(0, 200)}`)

  if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${text.substring(0, 300)}`)
  const data = JSON.parse(text)
  return Array.isArray(data) ? data : (data.items || [])
}

// ── OTODOM ─────────────────────────────────────────────────────────────
// ── Normalizacja polskich znaków do slugów URL (usuwa diakrytyki, spacje→myślniki) ──
function slugifyPl(text: string): string {
  return text.toLowerCase().trim()
    .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e').replace(/ł/g,'l')
    .replace(/ń/g,'n').replace(/ó/g,'o').replace(/ś/g,'s').replace(/ź|ż/g,'z')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
}

// ── Cache w pamięci procesu: miasto → zwycięski wariant ścieżki (uniknij podwójnego kosztu Apify przy kolejnych wyszukaniach) ──
const otodomPathCache = new Map<string, string>()

interface OtodomLocation {
  wojewodztwoSlug: string
  powiatSlug: string | null   // null = miasto na prawach powiatu (Kraków, Warszawa, Szczecin, ...)
  citySlug: string
}

// ── Rozpoznaje lokalizację przez oficjalne API geo-autosuggest Otodom (to samo, którego
// używa wyszukiwarka na ich własnej stronie) — działa dla KAŻDEGO miasta w Polsce,
// bez potrzeby ręcznego mapowania. ──
async function resolveOtodomLocation(city: string): Promise<OtodomLocation | null> {
  try {
    const url = `https://www.otodom.pl/ajax/geo6/autosuggest/?data=${encodeURIComponent(city)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const data = await res.json() as any[]
    const match = data.find(d => d.level === 'CITY')
    if (!match) return null

    // text wygląda jak "Kołobrzeg, kołobrzeski, zachodniopomorskie" (miasto z własnym powiatem)
    // lub "Szczecin, zachodniopomorskie" (miasto na prawach powiatu — brak osobnego powiatu)
    const parts = String(match.text || '').split(',').map((s: string) => s.trim())
    const citySlug = slugifyPl(match.name || parts[0] || city)

    if (parts.length >= 3) {
      return { wojewodztwoSlug: slugifyPl(parts[2]), powiatSlug: slugifyPl(parts[1]), citySlug }
    }
    // Miasto na prawach powiatu — brak osobnego segmentu powiatu
    return { wojewodztwoSlug: slugifyPl(parts[1] || ''), powiatSlug: null, citySlug }
  } catch {
    return null
  }
}

// ── Buduje listę kandydackich ścieżek URL do wypróbowania w kolejności malejącego
// prawdopodobieństwa trafienia (na podstawie typu miasta) ──
function buildOtodomPathCandidates(loc: OtodomLocation): string[] {
  if (!loc.powiatSlug) {
    // Miasto na prawach powiatu (Kraków, Warszawa, Wrocław, Szczecin...)
    return [
      `${loc.wojewodztwoSlug}/${loc.citySlug}/${loc.citySlug}/${loc.citySlug}`,
      `${loc.wojewodztwoSlug}/${loc.citySlug}/${loc.citySlug}`,
    ]
  }
  // Miasto w obrębie powiatu ziemskiego (Kołobrzeg, Koszalin...) — wymaga segmentu gminy
  return [
    `${loc.wojewodztwoSlug}/${loc.powiatSlug}/gmina-miejska--${loc.citySlug}/${loc.citySlug}`,
    `${loc.wojewodztwoSlug}/${loc.powiatSlug}/${loc.citySlug}`,
  ]
}

function buildOtodomQueryParams(p: PortalSearchParams): URLSearchParams {
  const qp = new URLSearchParams({ page: '1', limit: '25' })
  if (p.price_min) qp.set('priceMin', String(p.price_min))
  if (p.price_max) qp.set('priceMax', String(p.price_max))
  if (p.area_min)  qp.set('areaMin',  String(p.area_min))
  if (p.area_max)  qp.set('areaMax',  String(p.area_max))
  if (p.rooms_min) {
    // roomsNumber to filtr DOKŁADNYCH wartości (nie zakres) — żeby zaimplementować
    // "X lub więcej" trzeba wysłać wszystkie wartości od X w górę, włącznie z MORE (6+)
    const ALL_ROOMS = ['ONE','TWO','THREE','FOUR','FIVE','MORE']
    const startIdx = Math.min(p.rooms_min, 6) - 1
    const selected = ALL_ROOMS.slice(Math.max(0, startIdx))
    for (const val of selected) qp.append('roomsNumber', val)
  }
  return qp
}

// Zwraca listę gotowych URLi-kandydatów do wypróbowania po kolei (pierwszy trafiony wynik wygrywa).
// Działa dla DOWOLNEGO miasta w Polsce — nie tylko tych z ręcznie wpisanej listy.
async function buildOtodomUrlCandidates(p: PortalSearchParams): Promise<string[]> {
  const trans = p.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const prop = ({ mieszkanie:'mieszkanie', dom:'dom', dzialka:'dzialka', lokal:'lokal' }
    )[p.property_type || 'mieszkanie'] || 'mieszkanie'
  const qp = buildOtodomQueryParams(p)
  const cityKey = (p.city || '').toLowerCase().trim()

  if (!cityKey) {
    return [`https://www.otodom.pl/pl/wyniki/${trans}/${prop}/cala-polska?${qp}`]
  }

  // Jeśli mamy już zapamiętany zwycięski wariant dla tego miasta — użyj go jako pierwszego
  const cacheKey = `${cityKey}`
  const cachedPath = otodomPathCache.get(cacheKey)
  if (cachedPath) {
    return [`https://www.otodom.pl/pl/wyniki/${trans}/${prop}/${cachedPath}?${qp}`]
  }

  const loc = await resolveOtodomLocation(p.city || '')
  if (!loc) {
    return [`https://www.otodom.pl/pl/wyniki/${trans}/${prop}/cala-polska?${qp}`]
  }

  const candidates = buildOtodomPathCandidates(loc)
  return candidates.map(path => `https://www.otodom.pl/pl/wyniki/${trans}/${prop}/${path}?${qp}`)
}

function rememberOtodomPath(city: string, url: string) {
  try {
    const cityKey = city.toLowerCase().trim()
    const match = url.match(/\/wyniki\/[^/]+\/[^/]+\/(.+)\?/)
    if (match) otodomPathCache.set(cityKey, match[1])
  } catch { /* best-effort, nie krytyczne */ }
}

function mapOtodomItem(item: any, transType: string): PortalListing {
  // Realny schemat trev0n~otodom-scraper: pola płaskie (price, area, rooms, city, mainImage)
  const price = typeof item.price === 'number' ? item.price : (item.price?.value ?? item.totalPrice ?? null)
  return {
    portal: 'otodom',
    external_id: String(item.id || item.slug || ''),
    url: item.propertyUrl || item.url || `https://www.otodom.pl/pl/oferta/${item.slug || item.id}`,
    title: item.title || item.name || '',
    price: transType !== 'wynajem' ? price : null,
    rent_price: transType === 'wynajem' ? (item.rentPrice ?? price) : null,
    area: item.area || item.areaInSquareMeters || null,
    rooms_count: item.rooms || (item.roomsNumber
      ? ({ ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5,MORE:6 } as Record<string,number>)[item.roomsNumber as string]
      : null) || null,
    address_city: item.city || item.location?.address?.city?.name || '',
    address_district: item.district || item.subdistrict || item.location?.address?.district?.name || null,
    address_street: item.street || null,
    property_type: item.estate || 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: item.mainImage || item.images?.[0]?.large || item.images?.[0]?.medium || item.mainPhoto || null,
    // Pełny opis (do 2000 znaków) — do wstępnego podglądu w CRM bez wychodzenia na portal
    description: (item.description || item.shortDescription || '').substring(0, 2000) || null,
    posted_at: item.dateModified || item.dateCreated || item.dateCreatedFirst || item.createdAt || null,
    floor: item.floor ?? null,
    floors_total: item.totalFloors ?? null,
    build_year: item.buildYear ?? null,
    building_type: item.buildingType ?? null,
    heating_type: item.heating ?? null,
    condition: item.condition ?? null,
    market_type: item.market ?? null,
    ownership_type: item.ownershipType ?? null,
    has_elevator: typeof item.elevator === 'boolean' ? item.elevator : null,
    agency_name: item.agencyName || item.agency?.name || item.agencyName || null,
    // sellerType to najbardziej wiarygodne pole ("private" / "business") — dokładniejsze niż zgadywanie z obecności agencyName
    is_private: item.sellerType === 'private' || (!item.sellerType && !item.agency && !item.agencyName),
    lat: item.latitude ?? null,
    lng: item.longitude ?? null
  }
}

export const apifyOtodomAdapter: PortalAdapter = {
  name: 'otodom', label: 'Otodom',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    try {
      const candidates = await buildOtodomUrlCandidates(params)
      let lastError = ''

      for (let i = 0; i < candidates.length; i++) {
        const searchUrl = candidates[i]
        const input = { startUrls: [{ url: searchUrl }], maxItems: params.limit || 20, proxy: { useApifyProxy: true } }
        try {
          const items = await runApifyActor(ACTOR_OTODOM, input, params.limit || 20)
          const listings = items.map(i => mapOtodomItem(i, params.transaction_type)).filter((l: PortalListing) => l.title)
          if (listings.length > 0 || i === candidates.length - 1) {
            // Trafienie (lub ostatnia próba) — zapamiętaj zwycięski wariant dla przyszłych wyszukań tego miasta
            if (listings.length > 0 && params.city) rememberOtodomPath(params.city, searchUrl)
            return { portal: 'otodom', listings, total: listings.length }
          }
          // 0 wyników i jeszcze są kandydaci do wypróbowania — spróbuj kolejnego wariantu ścieżki
        } catch (err: any) {
          lastError = err.message
        }
      }
      return { portal: 'otodom', listings: [], total: 0, error: lastError || undefined }
    } catch (err: any) {
      return { portal: 'otodom', listings: [], total: 0, error: err.message }
    }
  }
}

// ── OLX ────────────────────────────────────────────────────────────────
function buildOlxUrl(p: PortalSearchParams): string {
  const city = citySlug(p.city || '')
  const trans = p.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const qp = new URLSearchParams()
  if (p.price_max) qp.set('search[filter_float_price:to]', String(p.price_max))
  if (p.price_min) qp.set('search[filter_float_price:from]', String(p.price_min))
  if (p.area_min)  qp.set('search[filter_float_surface:from]', String(p.area_min))
  if (p.rooms_min) qp.set('search[filter_float_rooms:from]', String(p.rooms_min))
  const cityPath = city ? `/${city}` : ''
  return `https://www.olx.pl/nieruchomosci/mieszkania/${trans}${cityPath}/?${qp}`
}

function mapOlxItem(item: any, transType: string): PortalListing {
  // trev0n~olx-scraper: price jest top-level numeric, params to dict (nie tablica)
  const price = typeof item.price === 'number' ? item.price
    : item.price?.value || null

  // params to dict: { 'Powierzchnia': '34.5 m²', 'Liczba pokoi': '2', ... }
  const paramsDict: Record<string, string> = (item.params && typeof item.params === 'object' && !Array.isArray(item.params))
    ? item.params : {}

  const areaStr = paramsDict['Powierzchnia'] || paramsDict['powierzchnia'] || ''
  const area = areaStr ? (parseFloat(areaStr.replace(',', '.').replace(/[^0-9.]/g, '')) || null) : null

  const roomsStr = paramsDict['Liczba pokoi'] || paramsDict['Pokoje'] || paramsDict['pokoje'] || ''
  const rooms = roomsStr ? (parseInt(roomsStr) || null) : null

  // images: tablica URL stringów (nie obiektów)
  const thumbnail = Array.isArray(item.images) && item.images[0]
    ? (typeof item.images[0] === 'string' ? item.images[0]
       : item.images[0]?.link?.replace('{width}','400').replace('{height}','300') || null)
    : null

  return {
    portal: 'olx',
    external_id: String(item.id || ''),
    url: item.url || '',
    title: item.title || '',
    price: transType !== 'wynajem' ? (price || null) : null,
    rent_price: transType === 'wynajem' ? (price || null) : null,
    area, rooms_count: rooms,
    address_city: item.city || item.location?.city?.name || '',
    address_district: item.district || item.location?.district?.name || null,
    address_street: null,
    property_type: 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: thumbnail,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: item.datePosted || item.createdAt || item.created_at || null,
    agency_name: item.sellerType === 'business' ? (item.sellerName || null) : null,
    is_private: item.sellerType === 'private'
  }
}

export const apifyOlxAdapter: PortalAdapter = {
  name: 'olx', label: 'OLX',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const searchUrl = buildOlxUrl(params)
    const input = { startUrls: [{ url: searchUrl }], maxItems: params.limit || 20, proxy: { useApifyProxy: true } }
    try {
      const items = await runApifyActor(ACTOR_OLX, input, params.limit || 20)
      const listings = items.map((i: any) => mapOlxItem(i, params.transaction_type)).filter((l: PortalListing) => l.title)
      return { portal: 'olx', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'olx', listings: [], total: 0, error: err.message }
    }
  }
}

// ── GRATKA ─────────────────────────────────────────────────────────────
function buildGratkaUrl(p: PortalSearchParams): string {
  // Gratka URL format: /nieruchomosci/mieszkania/kolobrzeg (sprzedaz)
  //                    /nieruchomosci/wynajem/mieszkania/kolobrzeg (wynajem)
  const isWynajem = p.transaction_type === 'wynajem'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale' }
    )[p.property_type || 'mieszkanie'] || 'mieszkania'
  const city = citySlug(p.city || '')
  const cityPath = city ? `/${city}` : ''
  const base = isWynajem
    ? `https://gratka.pl/nieruchomosci/wynajem/${prop}${cityPath}`
    : `https://gratka.pl/nieruchomosci/${prop}${cityPath}`
  const qp = new URLSearchParams()
  if (p.price_min) qp.set('cena_od', String(p.price_min))
  if (p.price_max) qp.set('cena_do', String(p.price_max))
  if (p.area_min)  qp.set('powierzchnia_od', String(p.area_min))
  if (p.rooms_min) qp.set('liczba_pokoi_od', String(p.rooms_min))
  const qs = qp.toString()
  return qs ? `${base}?${qs}` : base
}

function mapGratkaItem(item: any, transType: string): PortalListing {
  // Ten sam silnik/schemat co Morizon: city = WOJEWÓDZTWO, prawdziwe miasto w location,
  // numberOfRooms = string "3 pokoje", mainImage = miniatura
  const locationParts = String(item.location || '').split(',').map((s: string) => s.trim())
  const realCity = locationParts[2] || item.district || item.city || ''

  const roomsMatch = String(item.numberOfRooms || '').match(/\d+/)
  const roomsCount = roomsMatch ? parseInt(roomsMatch[0]) : (typeof item.rooms === 'number' ? item.rooms : null)

  return {
    portal: 'gratka',
    external_id: String(item.id || item.offerId || ''),
    url: item.propertyUrl || item.url || item.href || '',
    title: item.title || item.name || '',
    price: transType !== 'wynajem' ? (typeof item.price === 'number' ? item.price : (item.price?.value || item.totalPrice || null)) : null,
    rent_price: transType === 'wynajem' ? (typeof item.price === 'number' ? item.price : (item.price?.value || null)) : null,
    area: item.area || item.surface || item.areaInSquareMeters || null,
    rooms_count: roomsCount,
    address_city: realCity,
    address_district: item.district || null,
    address_street: item.street || null,
    property_type: 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: item.mainImage || item.photos?.[0] || item.mainPhoto || item.thumbnail || null,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: item.addedAt || item.createdAt || null,
    agency_name: item.agencyName || item.agency?.name || null,
    is_private: item.sellerType === 'private' || (!item.agencyName && !item.agency),
    lat: item.latitude ?? null,
    lng: item.longitude ?? null
  }
}

export const apifyGratkaAdapter: PortalAdapter = {
  name: 'gratka', label: 'Gratka',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const searchUrl = buildGratkaUrl(params)
    const input = { startUrls: [{ url: searchUrl }], maxItems: params.limit || 20, proxy: { useApifyProxy: true } }
    try {
      const items = await runApifyActor(ACTOR_GRATKA, input, params.limit || 20)
      const listings = items.map(i => mapGratkaItem(i, params.transaction_type)).filter((l: PortalListing) => l.title)
      return { portal: 'gratka', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'gratka', listings: [], total: 0, error: err.message }
    }
  }
}

// ── MORIZON ─────────────────────────────────────────────────────────────
function buildMorizonUrl(p: PortalSearchParams): string {
  // Morizon URL format: /mieszkania/kolobrzeg/ (sprzedaz, bez /sprzedaz/)
  //                     /wynajem/mieszkania/kolobrzeg/ (wynajem)
  const isWynajem = p.transaction_type === 'wynajem'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale-uzytkowe' }
    )[p.property_type || 'mieszkanie'] || 'mieszkania'
  const city = citySlug(p.city || '')
  const cityPath = city ? `/${city}/` : '/'
  const base = isWynajem
    ? `https://www.morizon.pl/wynajem/${prop}${cityPath}`
    : `https://www.morizon.pl/${prop}${cityPath}`
  const qp = new URLSearchParams()
  if (p.price_max) qp.set('ps[price_to]',     String(p.price_max))
  if (p.price_min) qp.set('ps[price_from]',   String(p.price_min))
  if (p.area_min)  qp.set('ps[living_size_from]', String(p.area_min))
  if (p.rooms_min) qp.set('ps[number_of_rooms_from]', String(p.rooms_min))
  const qs = qp.toString()
  return qs ? `${base}?${qs}` : base
}

function mapMorizonItem(item: any, transType: string): PortalListing {
  // Realny schemat trev0n~morizon-scraper:
  // city = WOJEWÓDZTWO (błędna nazwa pola), prawdziwe miasto jest w location: "woj, powiat, Miasto, ul. ..."
  // numberOfRooms = string "3 pokoje" (nie liczba)
  // mainImage = miniatura (nie photos[])
  const locationParts = String(item.location || '').split(',').map((s: string) => s.trim())
  const realCity = locationParts[2] || item.district || item.city || ''

  const roomsMatch = String(item.numberOfRooms || '').match(/\d+/)
  const roomsCount = roomsMatch ? parseInt(roomsMatch[0]) : (typeof item.rooms === 'number' ? item.rooms : null)

  return {
    portal: 'morizon',
    external_id: String(item.id || item.hashId || ''),
    url: item.propertyUrl || (item.url ? (item.url.startsWith('http') ? item.url : `https://www.morizon.pl${item.url}`) : (item.absoluteUrl || '')),
    title: item.title || item.name || '',
    price: transType !== 'wynajem' ? (item.price || null) : null,
    rent_price: transType === 'wynajem' ? (item.price || null) : null,
    area: item.livingSize || item.usableArea || item.area || null,
    rooms_count: roomsCount,
    address_city: realCity,
    address_district: item.district || null,
    address_street: item.street || null,
    property_type: 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: item.mainImage || item.photos?.[0] || item.thumbnail || null,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: item.addedAt || item.createdAt || null,
    agency_name: item.agencyName || item.agency?.name || null,
    is_private: item.sellerType === 'private' || (!item.agencyName && !item.agency),
    lat: item.latitude ?? null,
    lng: item.longitude ?? null
  }
}

export const apifyMorizonAdapter: PortalAdapter = {
  name: 'morizon', label: 'Morizon',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const searchUrl = buildMorizonUrl(params)
    const input = { startUrls: [{ url: searchUrl }], maxItems: params.limit || 20, proxy: { useApifyProxy: true } }
    try {
      const items = await runApifyActor(ACTOR_MORIZON, input, params.limit || 20)
      const listings = items.map(i => mapMorizonItem(i, params.transaction_type)).filter((l: PortalListing) => l.title)
      return { portal: 'morizon', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'morizon', listings: [], total: 0, error: err.message }
    }
  }
}

// ── NIERUCHOMOŚCI-ONLINE ───────────────────────────────────────────────
function buildNieroOnlineUrl(p: PortalSearchParams): string {
  const trans = p.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale' }
    )[p.property_type || 'mieszkanie'] || 'mieszkania'
  const city = citySlug(p.city || '')
  const qp = new URLSearchParams({ t: prop, o: trans })
  if (city) qp.set('q', city)
  if (p.price_min) qp.set('cena_od', String(p.price_min))
  if (p.price_max) qp.set('cena_do', String(p.price_max))
  if (p.area_min)  qp.set('pow_od', String(p.area_min))
  if (p.rooms_min) qp.set('l_pokoi_od', String(p.rooms_min))
  return `https://nieruchomosci-online.pl/szukaj.html?${qp}`
}

function mapNieroOnlineItem(item: any, transType: string): PortalListing {
  return {
    portal: 'nieruchomosci-online',
    external_id: String(item.id || ''),
    url: item.url || item.href || '',
    title: item.title || item.name || '',
    price: transType !== 'wynajem' ? (item.price || null) : null,
    rent_price: transType === 'wynajem' ? (item.price || null) : null,
    area: item.area || item.surface || null,
    rooms_count: item.rooms || item.numberOfRooms || null,
    address_city: item.city || item.location?.city || '',
    address_district: item.district || null,
    address_street: null,
    property_type: 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: item.photos?.[0] || item.thumbnail || null,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: item.createdAt || null,
    agency_name: item.agency?.name || null,
    is_private: !item.agency
  }
}

export const apifyNieroOnlineAdapter: PortalAdapter = {
  name: 'nieruchomosci-online', label: 'Nieruchomości-online',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const searchUrl = buildNieroOnlineUrl(params)
    const input = { startUrls: [{ url: searchUrl }], maxItems: params.limit || 20, proxy: { useApifyProxy: true } }
    try {
      const items = await runApifyActor(ACTOR_NIERO_ONLINE, input, params.limit || 20)
      const listings = items.map(i => mapNieroOnlineItem(i, params.transaction_type)).filter((l: PortalListing) => l.title)
      return { portal: 'nieruchomosci-online', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'nieruchomosci-online', listings: [], total: 0, error: err.message }
    }
  }
}

// ── DOMIPORTA — od Pawła (trev0n), tryb Discovery: strukturalne parametry, ──
// nie trzeba budować URL ręcznie (inaczej niż pozostałe 5 portali) ──────
// Property types wspierane przez aktora: mieszkanie, dom, dzialka, lokal
function mapDomiportaItem(item: any, transType: string, propType: string): PortalListing {
  return {
    portal: 'domiporta',
    external_id: String(item.id || item.offerId || ''),
    url: item.propertyUrl || '',
    title: item.title || '',
    price: transType !== 'wynajem' ? (item.price || null) : null,
    rent_price: transType === 'wynajem' ? (item.price || null) : null,
    area: item.area || null,
    rooms_count: item.numberOfRooms || null,
    address_city: item.city || '',
    address_district: null, // aktor nie zwraca dzielnicy osobno (tylko city + province)
    address_street: item.street || null,
    property_type: propType,
    transaction_type: transType,
    thumbnail_url: item.mainImage || item.images?.[0] || null,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: item.datePosted || null,
    agency_name: null, // aktor nie zwraca nazwy agencji, tylko typ sprzedającego
    is_private: item.sellerType === 'prywatny',
    lat: item.latitude ?? null,
    lng: item.longitude ?? null,
    floor: item.floor ?? null,
    build_year: item.buildYear ?? null,
    market_type: item.marketType === 'pierwotny' ? 'pierwotny' : item.marketType === 'wtorny' ? 'wtorny' : null,
  }
}

export const apifyDomiportaAdapter: PortalAdapter = {
  name: 'domiporta', label: 'Domiporta',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const propType = params.property_type || 'mieszkanie'
    const input: any = {
      searchType: params.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz',
      propertyType: propType,
      city: params.city || undefined,
      priceMin: params.price_min || undefined,
      priceMax: params.price_max || undefined,
      areaMin: params.area_min || undefined,
      areaMax: params.area_max || undefined,
      roomsMin: params.rooms_min || undefined,
      roomsMax: params.rooms_max || undefined,
      maxItems: params.limit || 20,
      extractDetails: true,
    }
    try {
      const items = await runApifyActor(ACTOR_DOMIPORTA, input, params.limit || 20)
      const listings = items.map(i => mapDomiportaItem(i, params.transaction_type, propType)).filter((l: PortalListing) => l.title)
      return { portal: 'domiporta', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'domiporta', listings: [], total: 0, error: err.message }
    }
  }
}

// ── ADRESOWO — od Pawła (trev0n), tryb Discovery, oferty bez pośredników ──
// Property types wspierane przez aktora: mieszkanie, dom, dzialka (BEZ lokal)
function mapAdresowoItem(item: any, transType: string, propType: string, searchCity: string): PortalListing {
  // "location" ma format "ul. Strycharska, Kraków Podgórze, małopolskie" — miasto i dzielnica
  // są razem w drugim segmencie, więc jako address_city bierzemy miasto z zapytania (pewne),
  // a cały drugi segment zostawiamy jako district (najlepsze dostępne przybliżenie)
  const locationParts = String(item.location || '').split(',').map((s: string) => s.trim())
  return {
    portal: 'adresowo',
    external_id: String(item.id || item.offerId || ''),
    url: item.propertyUrl || '',
    title: item.title || '',
    price: transType !== 'wynajem' ? (item.price || null) : null,
    rent_price: transType === 'wynajem' ? (item.price || null) : null,
    area: item.area || null,
    rooms_count: item.numberOfRooms || null,
    address_city: searchCity,
    address_district: locationParts[1] || null,
    address_street: item.street || locationParts[0] || null,
    property_type: propType,
    transaction_type: transType,
    thumbnail_url: item.mainImage || item.images?.[0] || null,
    description: (item.description || '').substring(0, 300) || null,
    posted_at: null, // aktor nie zwraca daty publikacji
    agency_name: null,
    is_private: item.sellerType === 'private',
    lat: item.latitude ?? null,
    lng: item.longitude ?? null,
    floor: item.floor ?? null,
  }
}

export const apifyAdresowoAdapter: PortalAdapter = {
  name: 'adresowo', label: 'Adresowo',
  isConfigured() { return !!process.env.APIFY_TOKEN },
  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    // Adresowo nie obsługuje lokali użytkowych ani garaży — unikamy marnowania kredytów
    // Apify na zapytanie, które i tak nic sensownego nie zwróci
    if (params.property_type === 'lokal' || params.property_type === 'garaz') {
      return { portal: 'adresowo', listings: [], total: 0, error: 'Adresowo nie obsługuje tego typu nieruchomości' }
    }
    const propType = params.property_type || 'mieszkanie'
    const input: any = {
      searchType: params.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz',
      propertyType: propType,
      city: params.city || undefined,
      priceMin: params.price_min || undefined,
      priceMax: params.price_max || undefined,
      areaMin: params.area_min || undefined,
      areaMax: params.area_max || undefined,
      roomsMin: params.rooms_min || undefined,
      roomsMax: params.rooms_max || undefined,
      maxItems: params.limit || 20,
      extractDetails: true,
    }
    try {
      const items = await runApifyActor(ACTOR_ADRESOWO, input, params.limit || 20)
      const listings = items.map(i => mapAdresowoItem(i, params.transaction_type, propType, params.city || '')).filter((l: PortalListing) => l.title)
      return { portal: 'adresowo', listings, total: listings.length }
    } catch (err: any) {
      return { portal: 'adresowo', listings: [], total: 0, error: err.message }
    }
  }
}

// ── Export do debugowania surowych danych z aktora ────────────────────
export async function runApifyRaw(
  portal: string, city: string, trans: string, prop: string, limit: number
): Promise<any[]> {
  const urlMap: Record<string, () => string | Promise<string>> = {
    otodom: async () => (await buildOtodomUrlCandidates({ transaction_type: trans, property_type: prop, city, limit }))[0],
    olx:    () => buildOlxUrl({ transaction_type: trans, property_type: prop, city, limit }),
    gratka: () => buildGratkaUrl({ transaction_type: trans, property_type: prop, city, limit }),
    morizon:() => buildMorizonUrl({ transaction_type: trans, property_type: prop, city, limit }),
    'nieruchomosci-online': () => buildNieroOnlineUrl({ transaction_type: trans, property_type: prop, city, limit }),
  }
  const actorMap: Record<string, string> = {
    otodom: ACTOR_OTODOM,
    olx: ACTOR_OLX,
    gratka: ACTOR_GRATKA,
    morizon: ACTOR_MORIZON,
    'nieruchomosci-online': ACTOR_NIERO_ONLINE,
  }
  const urlBuilder = urlMap[portal]
  const actorId = actorMap[portal]
  if (!urlBuilder || !actorId) throw new Error(`Nieznany portal: ${portal}`)
  const searchUrl = await urlBuilder()
  const input = { startUrls: [{ url: searchUrl }], maxItems: limit, proxy: { useApifyProxy: true } }
  return runApifyActor(actorId, input, limit)
}

