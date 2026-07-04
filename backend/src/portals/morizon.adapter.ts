import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════
// MORIZON ADAPTER
// Wymaga: MORIZON_API_KEY w .env
// Ringier Axel Springer — kontakt: api@morizon.pl
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://api.morizon.pl/v2'

function parseListing(raw: any, transType: string): PortalListing {
  return {
    portal: 'morizon',
    external_id: String(raw.id || raw.externalId),
    url: raw.canonicalUrl || raw.url || `https://www.morizon.pl/oferta/${raw.id}`,
    title: raw.title || raw.headline || '',
    price: raw.price?.amount ?? raw.salePrice ?? null,
    rent_price: transType === 'wynajem' ? (raw.price?.amount ?? null) : null,
    area: raw.totalArea ?? raw.usableArea ?? null,
    rooms_count: raw.roomsCount ?? null,
    address_city: raw.location?.city?.name || raw.cityName || '',
    address_district: raw.location?.district?.name || null,
    address_street: raw.location?.street?.name || null,
    property_type: raw.propertyType?.toLowerCase() || '',
    transaction_type: transType,
    thumbnail_url: raw.coverPhoto?.url || raw.mainPhoto || null,
    description: raw.description?.substring(0, 300) || null,
    posted_at: raw.publishedAt || raw.addedAt || null,
    agency_name: raw.agency?.name || null,
    is_private: raw.sellerType === 'PRIVATE'
  }
}

export const morizonAdapter: PortalAdapter = {
  name: 'morizon',
  label: 'Morizon',

  isConfigured() {
    return !!process.env.MORIZON_API_KEY
  },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    try {
      const apiKey = process.env.MORIZON_API_KEY
      if (!apiKey) throw new Error('Brak klucza API Morizon')

      const query = new URLSearchParams({
        dealType: params.transaction_type === 'wynajem' ? 'RENT' : 'SELL',
        ...(params.city && { cityName: params.city }),
        ...(params.price_min && { priceFrom: String(params.price_min) }),
        ...(params.price_max && { priceTo: String(params.price_max) }),
        ...(params.area_min && { areaFrom: String(params.area_min) }),
        ...(params.area_max && { areaTo: String(params.area_max) }),
        ...(params.rooms_min && { roomsFrom: String(params.rooms_min) }),
        pageSize: String(params.limit || 20),
        page: '0'
      })

      const res = await fetch(`${BASE_URL}/listings?${query}`, {
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        }
      })

      if (!res.ok) throw new Error(`Morizon search failed: ${res.status}`)
      const data = await res.json() as any

      const listings = (data.content || data.items || [])
        .map((item: any) => parseListing(item, params.transaction_type))

      return { portal: 'morizon', listings, total: data.totalElements || listings.length }
    } catch (err: any) {
      return { portal: 'morizon', listings: [], total: 0, error: err.message }
    }
  }
}
