import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// Gratka.pl — scraping strony HTML, dane w window.__INITIAL_STATE__ lub JSON w script tag
const BASE = 'https://gratka.pl'

const CITY_MAP: Record<string,string> = {
  kolobrzeg:'kolobrzeg', kołobrzeg:'kolobrzeg',
  szczecin:'szczecin', warszawa:'warszawa',
  krakow:'krakow', kraków:'krakow',
  wroclaw:'wroclaw', wrocław:'wroclaw',
  gdansk:'gdansk', gdańsk:'gdansk',
  poznan:'poznan', poznań:'poznan',
}

function buildUrl(p: PortalSearchParams): string {
  const trans = p.transaction_type === 'wynajem' ? 'nieruchomosci/wynajem' : 'nieruchomosci'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale' })[p.property_type||'mieszkanie'] || 'mieszkania'
  const city = CITY_MAP[(p.city||'').toLowerCase()] || ''
  const cityPath = city ? `/${city}` : ''
  const qp = new URLSearchParams({ page: '1' })
  if (p.price_min) qp.set('cena_od', String(p.price_min))
  if (p.price_max) qp.set('cena_do', String(p.price_max))
  if (p.area_min)  qp.set('powierzchnia_od', String(p.area_min))
  if (p.area_max)  qp.set('powierzchnia_do', String(p.area_max))
  if (p.rooms_min) qp.set('liczba_pokoi_od', String(p.rooms_min))
  return `${BASE}/${trans}/${prop}${cityPath}?${qp}`
}

function parseListingFromHtml(item: any, trans: string): PortalListing {
  return {
    portal: 'gratka',
    external_id: String(item.id || item.offerId || ''),
    url: item.url || item.href || '',
    title: item.title || item.name || '',
    price: trans !== 'wynajem' ? (item.price?.value || item.totalPrice || null) : null,
    rent_price: trans === 'wynajem' ? (item.price?.value || null) : null,
    area: item.area || item.surface || null,
    rooms_count: item.rooms || item.roomsCount || null,
    address_city: item.location?.city || item.city || '',
    address_district: item.location?.district || null,
    address_street: null,
    property_type: item.category || 'mieszkanie',
    transaction_type: trans,
    thumbnail_url: item.photos?.[0] || item.mainPhoto || item.thumbnail || null,
    description: item.description?.substring(0, 300) || null,
    posted_at: item.createdAt || item.addedAt || null,
    agency_name: item.agency?.name || null,
    is_private: !item.agency
  }
}

export const gratkaScraperAdapter: PortalAdapter = {
  name: 'gratka',
  label: 'Gratka',
  isConfigured() { return true },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const url = buildUrl(params)
    console.log(`[Gratka] Scraping: ${url}`)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pl-PL,pl;q=0.9',
        },
        signal: AbortSignal.timeout(12000)
      })
      if (!res.ok) throw new Error(`Gratka HTTP ${res.status}`)
      const html = await res.text()

      // Gratka osadza dane w <script type="application/json" id="offer-list-data">
      const m1 = html.match(/<script[^>]+id="offer-list-data"[^>]*>([\s\S]*?)<\/script>/)
      // Lub w window.__PRELOADED_STATE__ = {...}
      const m2 = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/)
      // Lub __NEXT_DATA__
      const m3 = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)

      let items: any[] = []

      if (m1) {
        const data = JSON.parse(m1[1])
        items = data.offers || data.items || data.listings || []
      } else if (m3) {
        const nd = JSON.parse(m3[1])
        items = nd?.props?.pageProps?.offers || nd?.props?.pageProps?.listings || []
      } else if (m2) {
        const state = JSON.parse(m2[1])
        items = state?.listings?.items || state?.offers?.items || []
      } else {
        // Fallback: szukaj JSON array z ofertami
        const jsonMatch = html.match(/"offers":\s*(\[[\s\S]{100,}?\])/m)
        if (jsonMatch) items = JSON.parse(jsonMatch[1])
      }

      const listings = items.slice(0, params.limit || 20)
        .map((i: any) => parseListingFromHtml(i, params.transaction_type))
        .filter((l: PortalListing) => l.title)

      return { portal: 'gratka', listings, total: listings.length, source_url: url }
    } catch (err: any) {
      console.error('[Gratka error]', err.message)
      return { portal: 'gratka', listings: [], total: 0, error: err.message, source_url: url }
    }
  }
}
