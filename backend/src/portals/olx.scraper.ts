import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════════════
// OLX SCRAPER — używa JSON API OLX (api.olx.pl/v1/offers)
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_MAP: Record<string, number> = {
  mieszkanie: 15,
  dom: 16,
  dzialka: 17,
  lokal: 18,
  garaz: 19,
}

const CITY_IDS: Record<string, number> = {
  kolobrzeg: 50117, kołobrzeg: 50117,
  szczecin: 60,     warszawa: 10,
  krakow: 30,       kraków: 30,
  wroclaw: 40,      wrocław: 40,
  gdansk: 50,       gdańsk: 50,
  poznan: 70,       poznań: 70,
}

function parseListing(item: any, transType: string): PortalListing {
  const price = item.params?.find((p: any) => p.key === 'price')?.value?.converted_value?.value
    ?? item.params?.find((p: any) => p.key === 'price')?.value?.value

  const area = parseFloat(
    item.params?.find((p: any) => p.key === 'surface')?.value?.value || '0'
  ) || null

  const rooms = parseInt(
    item.params?.find((p: any) => p.key === 'rooms')?.value?.value || '0'
  ) || null

  return {
    portal: 'olx',
    external_id: String(item.id),
    url: item.url || `https://www.olx.pl/d/oferta/${item.id}.html`,
    title: item.title || '',
    price: transType !== 'wynajem' ? (price || null) : null,
    rent_price: transType === 'wynajem' ? (price || null) : null,
    area,
    rooms_count: rooms,
    address_city: item.location?.city?.name || item.location?.region?.name || '',
    address_district: item.location?.district?.name || null,
    address_street: null,
    property_type: 'mieszkanie',
    transaction_type: transType,
    thumbnail_url: item.photos?.[0]?.link?.replace('{width}', '400').replace('{height}', '300') || null,
    description: item.description?.substring(0, 300) || null,
    posted_at: item.created_at || null,
    agency_name: item.user?.name !== item.contact?.name ? item.user?.name : null,
    is_private: item.business === false
  }
}

export const olxScraperAdapter: PortalAdapter = {
  name: 'olx',
  label: 'OLX',

  isConfigured() { return true },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    const cityKey = (params.city || '').toLowerCase()
    const cityId = CITY_IDS[cityKey]
    const categoryId = CATEGORY_MAP[params.property_type || 'mieszkanie'] || 15
    const transFilter = params.transaction_type === 'wynajem' ? 'najom' : 'sprzedaz'

    const qp = new URLSearchParams({
      category_id: String(categoryId),
      offset: '0',
      limit: String(Math.min(params.limit || 20, 40)),
      sort_by: 'created_at:desc',
      filter_refiners: 'spell_checker',
      suggest_filters: '1',
      [`filter_enum_type[0]`]: transFilter,
    })

    if (cityId) qp.set('city_id', String(cityId))
    if (params.price_min) qp.set('filter_float_price:from', String(params.price_min))
    if (params.price_max) qp.set('filter_float_price:to', String(params.price_max))
    if (params.area_min)  qp.set('filter_float_surface:from', String(params.area_min))
    if (params.area_max)  qp.set('filter_float_surface:to',   String(params.area_max))
    if (params.rooms_min) qp.set('filter_float_rooms:from', String(params.rooms_min))

    const url = `https://api.olx.pl/api/v1/offers/?${qp.toString()}`
    console.log(`[OLX] Fetching: ${url}`)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestRent/1.0)',
          'Accept': 'application/json',
          'x-platform': 'web',
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!res.ok) throw new Error(`OLX API HTTP ${res.status}`)
      const data = await res.json() as any
      const items = data.data || []

      const listings = items.map((item: any) =>
        parseListing(item, params.transaction_type)
      )

      return {
        portal: 'olx',
        listings,
        total: data.metadata?.total_elements || listings.length,
        source_url: url
      }
    } catch (err: any) {
      console.error('[OLX scraper error]', err.message)
      return { portal: 'olx', listings: [], total: 0, error: err.message }
    }
  }
}
