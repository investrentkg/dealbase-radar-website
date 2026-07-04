import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════
// NIERUCHOMOŚCI-ONLINE ADAPTER
// Dokumentacja: https://api.nieruchomosci-online.pl/docs
// Wymaga: NO_API_KEY w .env
// REST API z kluczem w nagłówku X-API-Key
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://api.nieruchomosci-online.pl/v2'

function mapTransactionType(type: string): string {
  return type === 'wynajem' ? 'rent' : 'sell'
}

function mapPropertyType(type?: string): string {
  const map: Record<string, string> = {
    mieszkanie: 'apartment', dom: 'house', dzialka: 'land',
    lokal: 'commercial', magazyn: 'warehouse', garaz: 'garage'
  }
  return type ? (map[type] || 'apartment') : 'apartment'
}

function parseListing(raw: any, transType: string): PortalListing {
  return {
    portal: 'nieruchomosci_online',
    external_id: String(raw.id),
    url: raw.url || `https://www.nieruchomosci-online.pl/oferta/${raw.id}`,
    title: raw.title || raw.name || '',
    price: raw.price ?? raw.total_price ?? null,
    rent_price: transType === 'wynajem' ? (raw.price ?? null) : null,
    area: raw.area ?? raw.total_area ?? null,
    rooms_count: raw.rooms ?? raw.rooms_count ?? null,
    address_city: raw.city || raw.location?.city || '',
    address_district: raw.district || raw.location?.district || null,
    address_street: raw.street || raw.location?.street || null,
    property_type: raw.type || '',
    transaction_type: transType,
    thumbnail_url: raw.photos?.[0]?.url || raw.images?.[0] || null,
    description: raw.description?.substring(0, 300) || null,
    posted_at: raw.date_added || raw.created_at || null,
    agency_name: raw.agency?.name || raw.office?.name || null,
    is_private: raw.is_private ?? !raw.agency
  }
}

export const nieruchomosciOnlineAdapter: PortalAdapter = {
  name: 'nieruchomosci_online',
  label: 'Nieruchomości-Online',

  isConfigured() {
    return !!process.env.NO_API_KEY
  },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    try {
      const apiKey = process.env.NO_API_KEY
      if (!apiKey) throw new Error('Brak klucza API Nieruchomości-Online')

      const query: Record<string, string> = {
        transaction: mapTransactionType(params.transaction_type),
        type: mapPropertyType(params.property_type),
        page: '1',
        per_page: String(params.limit || 20),
      }

      if (params.city) query['city'] = params.city
      if (params.district) query['district'] = params.district
      if (params.price_min) query['price_from'] = String(params.price_min)
      if (params.price_max) query['price_to'] = String(params.price_max)
      if (params.area_min) query['area_from'] = String(params.area_min)
      if (params.area_max) query['area_to'] = String(params.area_max)
      if (params.rooms_min) query['rooms_from'] = String(params.rooms_min)
      if (params.rooms_max) query['rooms_to'] = String(params.rooms_max)

      const qs = new URLSearchParams(query).toString()
      const res = await fetch(`${BASE_URL}/listings?${qs}`, {
        headers: {
          'X-API-Key': apiKey,
          'Accept': 'application/json'
        }
      })

      if (!res.ok) throw new Error(`NO search failed: ${res.status}`)
      const data = await res.json() as any

      const listings = (data.items || data.listings || data.data || [])
        .map((item: any) => parseListing(item, params.transaction_type))

      return {
        portal: 'nieruchomosci_online',
        listings,
        total: data.total || data.count || listings.length
      }
    } catch (err: any) {
      return { portal: 'nieruchomosci_online', listings: [], total: 0, error: err.message }
    }
  }
}
