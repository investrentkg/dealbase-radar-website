import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════
// GRATKA ADAPTER
// Wymaga: GRATKA_API_KEY w .env
// API Wirtualna Polska — kontakt: api@gratka.pl
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://api.gratka.pl/v1'

function parseListing(raw: any, transType: string): PortalListing {
  return {
    portal: 'gratka',
    external_id: String(raw.id),
    url: raw.url || `https://gratka.pl/nieruchomosci/${raw.id}`,
    title: raw.title || '',
    price: raw.price?.gross ?? raw.price ?? null,
    rent_price: transType === 'wynajem' ? (raw.price?.gross ?? null) : null,
    area: raw.parameters?.area ?? null,
    rooms_count: raw.parameters?.rooms_count ?? null,
    address_city: raw.location?.city || '',
    address_district: raw.location?.district || null,
    address_street: raw.location?.street || null,
    property_type: raw.category || '',
    transaction_type: transType,
    thumbnail_url: raw.images?.[0]?.url || null,
    description: raw.description?.substring(0, 300) || null,
    posted_at: raw.publication_date || null,
    agency_name: raw.office?.name || null,
    is_private: raw.offer_type === 'private'
  }
}

export const gratkaAdapter: PortalAdapter = {
  name: 'gratka',
  label: 'Gratka',

  isConfigured() {
    return !!process.env.GRATKA_API_KEY
  },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    try {
      const apiKey = process.env.GRATKA_API_KEY
      if (!apiKey) throw new Error('Brak klucza API Gratka')

      const body = {
        transaction_type: params.transaction_type === 'wynajem' ? 'rent' : 'sell',
        category: params.property_type || 'apartment',
        location: { city: params.city, district: params.district },
        price: { min: params.price_min, max: params.price_max },
        area: { min: params.area_min, max: params.area_max },
        rooms: { min: params.rooms_min, max: params.rooms_max },
        pagination: { page: 1, per_page: params.limit || 20 }
      }

      const res = await fetch(`${BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!res.ok) throw new Error(`Gratka search failed: ${res.status}`)
      const data = await res.json() as any

      const listings = (data.offers || data.items || [])
        .map((item: any) => parseListing(item, params.transaction_type))

      return { portal: 'gratka', listings, total: data.total || listings.length }
    } catch (err: any) {
      return { portal: 'gratka', listings: [], total: 0, error: err.message }
    }
  }
}
