import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// Morizon.pl — Ringier Axel Springer, Next.js app z __NEXT_DATA__
const BASE = 'https://www.morizon.pl'

const CITY_MAP: Record<string,string> = {
  kolobrzeg:'kolobrzeg', kołobrzeg:'kolobrzeg',
  szczecin:'szczecin', warszawa:'warszawa',
  krakow:'krakow', kraków:'krakow',
  wroclaw:'wroclaw', wrocław:'wroclaw',
  gdansk:'gdansk', gdańsk:'gdansk',
  poznan:'poznan', poznań:'poznan',
}

function buildUrl(p: PortalSearchParams): string {
  const trans = p.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale-uzytkowe' })[p.property_type||'mieszkanie'] || 'mieszkania'
  const city = CITY_MAP[(p.city||'').toLowerCase()] || ''
  const cityPath = city ? `/${city}` : ''
  const qp = new URLSearchParams({ page: '1', limit: '24' })
  if (p.price_max) qp.set('price_max', String(p.price_max))
  if (p.price_min) qp.set('price_min', String(p.price_min))
  if (p.area_min)  qp.set('living_size_from', String(p.area_min))
  if (p.area_max)  qp.set('living_size_to',   String(p.area_max))
  if (p.rooms_min) qp.set('number_of_rooms_from', String(p.rooms_min))
  return `${BASE}/${trans}/${prop}${cityPath}/?${qp}`
}

export const morizonScraperAdapter: PortalAdapter = {
  name: 'morizon',
  label: 'Morizon',
  isConfigured() { return true },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const url = buildUrl(params)
    console.log(`[Morizon] Scraping: ${url}`)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pl-PL,pl;q=0.9',
        },
        signal: AbortSignal.timeout(12000)
      })
      if (!res.ok) throw new Error(`Morizon HTTP ${res.status}`)
      const html = await res.text()

      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (!m) throw new Error('Brak __NEXT_DATA__ Morizon')

      const nd = JSON.parse(m[1])
      const raw = nd?.props?.pageProps?.offers
        || nd?.props?.pageProps?.listings
        || nd?.props?.pageProps?.initialData?.offers
        || []

      const listings: PortalListing[] = (Array.isArray(raw) ? raw : [])
        .slice(0, params.limit || 20)
        .map((item: any) => ({
          portal: 'morizon',
          external_id: String(item.id || item.hashId || ''),
          url: item.url ? `${BASE}${item.url}` : item.absoluteUrl || '',
          title: item.title || item.name || '',
          price: params.transaction_type !== 'wynajem' ? (item.price || null) : null,
          rent_price: params.transaction_type === 'wynajem' ? (item.price || null) : null,
          area: item.livingSize || item.usableArea || item.area || null,
          rooms_count: item.numberOfRooms || item.rooms || null,
          address_city: item.city?.name || item.cityName || '',
          address_district: item.district?.name || null,
          address_street: null,
          property_type: params.property_type || 'mieszkanie',
          transaction_type: params.transaction_type,
          thumbnail_url: item.mainPhoto?.url || item.photos?.[0]?.url || null,
          description: item.shortDescription?.substring(0, 300) || null,
          posted_at: item.createdAt || null,
          agency_name: item.agency?.name || null,
          is_private: item.offerType === 'PRIVATE'
        }))
        .filter((l: PortalListing) => l.title)

      return { portal: 'morizon', listings, total: listings.length, source_url: url }
    } catch (err: any) {
      console.error('[Morizon error]', err.message)
      return { portal: 'morizon', listings: [], total: 0, error: err.message }
    }
  }
}
