import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { searchAllPortals, getPortalsStatus } from '../portals'
import { PortalSearchParams, PortalListing } from '../portals/types'
import { calculateDealScore } from '../lib/dealScoreEngine'
import { getRcnComparables } from '../lib/cenogram'
import { marketIntelDb } from '../db/clients'

export const searchRouter = Router()

// ── GET /api/search/status ─────────────────────────────────────────────
searchRouter.get('/status', requireAuth, (_req: AuthRequest, res: Response) => {
  res.json(getPortalsStatus())
})

// ── POST /api/search ───────────────────────────────────────────────────
// Rdzen Modulu 1 (agregator + Deal Score). Reuzywa dokladnie tej samej
// infrastruktury Apify co DealBase CRM (7 portali) - patrz src/portals/,
// skopiowane bezposrednio z investrent-crm/backend/src/portals.
searchRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const params: PortalSearchParams = {
    transaction_type: req.body.transaction_type || 'sprzedaz',
    property_type: req.body.property_type,
    city: req.body.city,
    district: req.body.district,
    price_min: req.body.price_min,
    price_max: req.body.price_max,
    area_min: req.body.area_min,
    area_max: req.body.area_max,
    rooms_min: req.body.rooms_min,
    rooms_max: req.body.rooms_max,
    limit: req.body.limit || 30,
  }

  if (!params.city) {
    return res.status(400).json({ error: 'city jest wymagane' })
  }
  const city: string = params.city

  const portalNames: string[] | undefined = Array.isArray(req.body.portals) ? req.body.portals : undefined
  const results = await searchAllPortals(params, portalNames)

  const allListings: PortalListing[] = results.flatMap(r => r.listings)
  const errors = results.filter(r => r.error).map(r => ({ portal: r.portal, error: r.error }))

  // ── Deal Score dla kazdej oferty ────────────────────────────────────
  // Na razie tylko punkt 2 (srednia z ofert w tym samym wyszukiwaniu) -
  // punkt 1 (RCN/rejestr transakcji) i punkt 3 (wlasna baza trendow z
  // market_intel) do podpiecia w kolejnym kroku, gdy zasilimy archiwum
  // realnymi danymi historycznymi. Score bez pelnych 3 punktow jest
  // NADAL zwracany, ale usedReferences pokaze ktorych brakuje - UI
  // (patrz sekcja "Deal Score" na stronie) musi to jasno komunikowac,
  // nie udawac ze mamy pelny obraz.
  const pricesPerM2 = allListings
    .map(l => (l.area && l.price) ? l.price / l.area : null)
    .filter((v): v is number => v !== null && v > 0)

  const listingsAvgPricePerM2 = pricesPerM2.length > 0
    ? pricesPerM2.reduce((a, b) => a + b, 0) / pricesPerM2.length
    : null

  // ── Punkt 1: RCN / Cenogram — per grupa (dzielnica + typ rynku) ──────
  // Wczesniejsza wersja pytala RCN raz dla calego miasta, co dawalo
  // mylaco wysoka mediane w miastach z mieszanka drogich apartamentow
  // kurortowych i zwyklego rynku wtornego (np. Kolobrzeg: mediana
  // miejska 29 968 zl/m2 vs srednia aktywnych ofert 12 780 zl/m2).
  // Teraz grupujemy oferty po (dzielnica lub miasto, typ rynku) i pytamy
  // RCN OSOBNO dla kazdej grupy - dokladniejsze i nadal oszczedne
  // (deduplikacja: te same parametry = jedno zapytanie, nie jedno na oferte).
  const rcnGroupKey = (l: PortalListing) =>
    `${(l.address_district || l.address_city || city).toLowerCase()}|${l.market_type || 'nieznany'}`

  const uniqueGroups = new Map<string, { district: string; marketType: string | null }>()
  for (const l of allListings) {
    const key = rcnGroupKey(l)
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, {
        district: l.address_district || l.address_city || city,
        marketType: (l.market_type === 'pierwotny' || l.market_type === 'wtorny') ? l.market_type : null,
      })
    }
  }
  // Zawsze dolicz tez sama nazwe miasta (bez dzielnicy) jako fallback dla
  // ofert bez podanej dzielnicy w danych z portalu.
  const cityFallbackKey = `${city.toLowerCase()}|nieznany`
  if (!uniqueGroups.has(cityFallbackKey)) {
    uniqueGroups.set(cityFallbackKey, { district: city, marketType: null })
  }

  const rcnByGroup = new Map<string, Awaited<ReturnType<typeof getRcnComparables>>>()
  await Promise.all(
    Array.from(uniqueGroups.entries()).map(async ([key, group]) => {
      const stats = await getRcnComparables({
        city: city,
        district: group.district !== city ? group.district : null,
        street: null,
        buildingNumber: null,
        propertyType: params.property_type || 'mieszkanie',
        area: (params.area_min && params.area_max) ? (params.area_min + params.area_max) / 2 : 50,
        marketType: group.marketType,
      }).catch(err => {
        console.error(`[search] Blad Cenogram/RCN dla grupy ${key}:`, err.message)
        return null
      })
      rcnByGroup.set(key, stats)
    })
  )

  function rcnForListing(l: PortalListing) {
    return rcnByGroup.get(rcnGroupKey(l)) ?? rcnByGroup.get(cityFallbackKey) ?? null
  }

  // Zbiorcza statystyka do sekcji reference_points w odpowiedzi (informacyjnie,
  // pokazujemy mediane per grupa zamiast jednej zlepionej liczby dla miasta).
  const rcnSummaryByGroup = Array.from(rcnByGroup.entries()).map(([key, stats]) => ({
    group: key,
    median_price_per_m2: stats?.medianPricePerM2 ?? null,
    sample_size: stats?.count ?? 0,
  }))

  // ── Punkt 3: rosnaca wlasna baza (market_intel.portal_listings_archive) ──
  // To NIE jest to samo co "listingsAvgPricePerM2" powyzej - tamto liczy
  // sredni z ofert znalezionych W TYM JEDNYM wyszukiwaniu. To liczy z
  // WSZYSTKICH ofert zarchiwizowanych historycznie (z wielu wyszukiwan,
  // wielu userow, w czasie) - to jest ten "coraz madrzejszy asystent"
  // z ustalen sesji brandingowej: baza rosnie z kazdym uzyciem produktu,
  // nie trenujemy modelu od nowa, tylko mamy wiecej punktow odniesienia.
  const archiveTrendByGroup = new Map<string, { avg: number | null; count: number }>()
  await Promise.all(
    Array.from(uniqueGroups.values()).map(async (group) => {
      const key = `${group.district.toLowerCase()}|${group.marketType || 'nieznany'}`
      if (archiveTrendByGroup.has(key)) return

      const { data, error } = await marketIntelDb
        .from('portal_listings_archive')
        .select('price_per_m2')
        .ilike('city', `%${city}%`)
        .not('price_per_m2', 'is', null)
        .limit(500)

      if (error || !data || data.length === 0) {
        archiveTrendByGroup.set(key, { avg: null, count: 0 })
        return
      }
      const values = data.map((r: any) => r.price_per_m2).filter((v: number) => v > 0)
      const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null
      archiveTrendByGroup.set(key, { avg, count: values.length })
    })
  )

  function archiveTrendForListing(l: PortalListing) {
    const key = rcnGroupKey(l)
    return archiveTrendByGroup.get(key) ?? archiveTrendByGroup.get(cityFallbackKey) ?? null
  }

  const scoredListings = allListings.map(listing => {
    if (!listing.area || !listing.price) {
      return { ...listing, dealScore: null }
    }
    const offerPricePerM2 = listing.price / listing.area
    const rcnStats = rcnForListing(listing)
    const archiveTrend = archiveTrendForListing(listing)
    const score = calculateDealScore({
      offerPricePerM2,
      references: {
        transactionAvgPricePerM2: rcnStats?.medianPricePerM2 ?? null,
        listingsAvgPricePerM2,
        archiveTrendPricePerM2: archiveTrend?.avg ?? null,
      },
    })
    return { ...listing, dealScore: score }
  })

  // ── Zapis do wspolnej bazy rynkowej (market_intel) ──────────────────
  // Fire-and-forget - nie blokujemy odpowiedzi na uzytkownika, jesli
  // zapis archiwum zawiedzie (np. duplikat), to nie problem uzytkownika.
  archiveListings(allListings).catch(err =>
    console.error('[search] Blad archiwizacji do market_intel:', err.message)
  )

  res.json({
    listings: scoredListings,
    total: scoredListings.length,
    portals_searched: results.map(r => r.portal),
    errors: errors.length > 0 ? errors : undefined,
    reference_points: {
      rcn_by_group: rcnSummaryByGroup,
      listings_avg_price_per_m2: listingsAvgPricePerM2,
      archive_trend_by_group: Array.from(archiveTrendByGroup.entries()).map(([key, v]) => ({
        group: key,
        avg_price_per_m2: v.avg,
        sample_size: v.count,
      })),
    },
  })
})

async function archiveListings(listings: PortalListing[]) {
  if (listings.length === 0) return

  const rows = listings.map(l => ({
    source_portal: l.portal,
    source_listing_id: l.external_id,
    property_type: l.property_type,
    transaction_type: l.transaction_type,
    city: l.address_city,
    district: l.address_district,
    street: l.address_street,
    area_m2: l.area,
    rooms_count: l.rooms_count,
    price: l.price,
    price_per_m2: (l.area && l.price) ? l.price / l.area : null,
    last_seen_at: new Date().toISOString(),
    raw_data: l,
  }))

  // Upsert po (source_portal, source_listing_id) - patrz unique constraint
  // w schema-market-intelligence.sql
  const { error } = await marketIntelDb
    .from('portal_listings_archive')
    .upsert(rows, { onConflict: 'source_portal,source_listing_id' })

  if (error) throw error
}
