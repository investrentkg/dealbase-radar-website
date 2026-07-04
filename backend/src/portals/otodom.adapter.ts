import { PortalAdapter, PortalSearchParams, PortalSearchResult, PortalListing } from './types'

// ═══════════════════════════════════════════════════════════
// OTODOM ADAPTER
// Dokumentacja: https://developer.otodom.pl
// Wymaga: OTODOM_CLIENT_ID, OTODOM_CLIENT_SECRET w .env
// Partner API (Otodom dla Agencji) — OAuth 2.0 client_credentials
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://api.otodom.pl'
const AUTH_URL = 'https://api.otodom.pl/oauth/token'

let cachedToken: string | null = null
let tokenExpiry: number = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const clientId = process.env.OTODOM_CLIENT_ID
  const clientSecret = process.env.OTODOM_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('Brak konfiguracji Otodom API')

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'search'
    }).toString()
  })

  if (!res.ok) throw new Error(`Otodom auth failed: ${res.status}`)
  const data = await res.json() as any

  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

function mapPropertyType(type?: string): string {
  const map: Record<string, string> = {
    mieszkanie: 'FLAT', dom: 'HOUSE', dzialka: 'TERRAIN',
    lokal: 'COMMERCIAL_PROPERTY', magazyn: 'HALL', garaz: 'GARAGE'
  }
  return type ? (map[type] || 'FLAT') : 'FLAT'
}

function mapTransactionType(type: string): string {
  return type === 'wynajem' ? 'RENT' : 'SELL'
}

function parseListing(raw: any, transType: string): PortalListing {
  return {
    portal: 'otodom',
    external_id: String(raw.id),
    url: `https://www.otodom.pl/pl/oferta/${raw.slug || raw.id}`,
    title: raw.title || '',
    price: raw.totalPrice?.value ?? raw.price?.value ?? null,
    rent_price: transType === 'wynajem' ? (raw.totalPrice?.value ?? null) : null,
    area: raw.areaInSquareMeters ?? null,
    rooms_count: raw.roomsNumber ?? null,
    address_city: raw.location?.address?.city?.name || '',
    address_district: raw.location?.address?.district?.name || null,
    address_street: raw.location?.address?.street?.name || null,
    property_type: raw.estate?.toLowerCase() || '',
    transaction_type: transType,
    thumbnail_url: raw.images?.[0]?.medium || raw.images?.[0]?.thumbnail || null,
    description: raw.description?.substring(0, 300) || null,
    posted_at: raw.dateCreated || raw.dateCreatedFirst || null,
    agency_name: raw.agency?.name || null,
    is_private: !raw.agency
  }
}

export const otodomAdapter: PortalAdapter = {
  name: 'otodom',
  label: 'Otodom',

  isConfigured() {
    return !!(process.env.OTODOM_CLIENT_ID && process.env.OTODOM_CLIENT_SECRET)
  },

  async search(params: PortalSearchParams): Promise<PortalSearchResult> {
    try {
      const token = await getAccessToken()

      const query: Record<string, string> = {
        page: '1',
        limit: String(params.limit || 20),
        transaction: mapTransactionType(params.transaction_type),
        estate: mapPropertyType(params.property_type),
      }

      if (params.city) query['locations[0][city]'] = params.city
      if (params.district) query['locations[0][district]'] = params.district
      if (params.price_min) query['priceMin'] = String(params.price_min)
      if (params.price_max) query['priceMax'] = String(params.price_max)
      if (params.area_min) query['areaMin'] = String(params.area_min)
      if (params.area_max) query['areaMax'] = String(params.area_max)
      if (params.rooms_min) query['roomsNumber[0]'] = String(params.rooms_min)

      const qs = new URLSearchParams(query).toString()
      const res = await fetch(`${BASE_URL}/v1/offers/search?${qs}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      })

      if (!res.ok) throw new Error(`Otodom search failed: ${res.status}`)
      const data = await res.json() as any

      const listings = (data.items || data.offers || [])
        .map((item: any) => parseListing(item, params.transaction_type))

      return {
        portal: 'otodom',
        listings,
        total: data.pagination?.totalResults || data.totalCount || listings.length
      }
    } catch (err: any) {
      return { portal: 'otodom', listings: [], total: 0, error: err.message }
    }
  }
}
