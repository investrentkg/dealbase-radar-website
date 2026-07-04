import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// Nieruchomosci-online.pl — scraping przez JSON API
const BASE = 'https://www.nieruchomosci-online.pl'

const CITY_MAP: Record<string,string> = {
  kolobrzeg:'kolobrzeg', kołobrzeg:'kolobrzeg',
  szczecin:'szczecin', warszawa:'warszawa',
  krakow:'krakow', kraków:'krakow',
  gdansk:'gdansk', gdańsk:'gdansk',
}

function buildUrl(p: PortalSearchParams): string {
  const trans = p.transaction_type === 'wynajem' ? 'wynajem' : 'sprzedaz'
  const prop = ({ mieszkanie:'mieszkania', dom:'domy', dzialka:'dzialki', lokal:'lokale' })[p.property_type||'mieszkanie'] || 'mieszkania'
  const city = CITY_MAP[(p.city||'').toLowerCase()] || ''
  const qp = new URLSearchParams({ strona: '1' })
  if (city) qp.set('lokalizacja', city)
  if (p.price_max) qp.set('cena_max', String(p.price_max))
  if (p.price_min) qp.set('cena_min', String(p.price_min))
  if (p.area_min)  qp.set('powierzchnia_min', String(p.area_min))
  if (p.area_max)  qp.set('powierzchnia_max', String(p.area_max))
  if (p.rooms_min) qp.set('pokoje_min', String(p.rooms_min))
  return `${BASE}/${trans}/${prop}/?${qp}`
}

export const nieruchomosciOnlineScraperAdapter: PortalAdapter = {
  name: 'nieruchomosci-online',
  label: 'Nieruchomości-online',
  isConfigured() { return true },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const url = buildUrl(params)
    console.log(`[N-online] Scraping: ${url}`)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pl-PL,pl;q=0.9',
        },
        signal: AbortSignal.timeout(12000)
      })
      if (!res.ok) throw new Error(`N-online HTTP ${res.status}`)
      const html = await res.text()

      // Nieruchomosci-online ma dane w JSON osadzonym w HTML
      const patterns = [
        /<script[^>]*type="application\/json"[^>]*>(\{[\s\S]*?"offers"[\s\S]*?\})<\/script>/,
        /__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/,
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
      ]

      let items: any[] = []
      for (const pattern of patterns) {
        const m = html.match(pattern)
        if (m) {
          try {
            const data = JSON.parse(m[1])
            const found = data?.offers || data?.listings || data?.items
              || data?.props?.pageProps?.offers || data?.props?.pageProps?.listings || []
            if (Array.isArray(found) && found.length > 0) {
              items = found
              break
            }
          } catch {}
        }
      }

      const listings: PortalListing[] = items
        .slice(0, params.limit || 20)
        .map((item: any) => ({
          portal: 'nieruchomosci-online',
          external_id: String(item.id || ''),
          url: item.url || (item.slug ? `${BASE}/oferta/${item.slug}` : ''),
          title: item.title || item.name || '',
          price: params.transaction_type !== 'wynajem' ? (item.price || null) : null,
          rent_price: params.transaction_type === 'wynajem' ? (item.price || null) : null,
          area: item.area || item.surface || null,
          rooms_count: item.rooms || null,
          address_city: item.city || item.location?.city || '',
          address_district: item.district || null,
          address_street: null,
          property_type: params.property_type || 'mieszkanie',
          transaction_type: params.transaction_type,
          thumbnail_url: item.photos?.[0] || item.thumbnail || null,
          description: item.description?.substring(0, 300) || null,
          posted_at: item.createdAt || null,
          agency_name: item.agency?.name || null,
          is_private: !item.agency
        }))
        .filter((l: PortalListing) => l.title)

      return { portal: 'nieruchomosci-online', listings, total: listings.length, source_url: url }
    } catch (err: any) {
      console.error('[N-online error]', err.message)
      return { portal: 'nieruchomosci-online', listings: [], total: 0, error: err.message }
    }
  }
}
