import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { searchAllPortals, getPortalsStatus } from '../portals'
import { PortalSearchParams, PortalListing } from '../portals/types'
import { calculateDealScore } from '../lib/dealScoreEngine'
import { getRcnComparables } from '../lib/cenogram'
import { detectMarketSegment } from '../lib/marketSegment'
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

  // ── Segmentacja rynkowa: standard vs premium/kurortowy ───────────────
  // Kluczowa poprawka po odkryciu na danych z Kolobrzegu: dzielnica z
  // portalu jest zawodna (czesto null), a "zwykle" i "luksusowe" budynki
  // stoja czasem przy tej samej ulicy w miastach nadmorskich. Segment
  // wykrywamy z TRESCI oferty (tytul/opis) - dziala wszedzie w Polsce,
  // nie tylko w miastach uzdrowiskowych. Patrz lib/marketSegment.ts.
  const segmentOf = (l: PortalListing) => detectMarketSegment({
    title: l.title, description: l.description,
  })

  const citiesInResults = new Set(allListings.map(l => (l.address_city || city).toLowerCase()))
  citiesInResults.add(city.toLowerCase())

  // ── Punkt 1: RCN / Cenogram — jedno zapytanie per miasto ─────────────
  // WAZNE OGRANICZENIE (uczciwie komunikowane w odpowiedzi API): RCN nie
  // ma pojecia "segment premium" - zwraca mediane dla calego miasta, wiec
  // dla ofert premium ten punkt odniesienia jest z natury mniej precyzyjny
  // niz punkty 2 i 3 ponizej, ktore SA segmentowane poprawnie. To lepsze
  // niz udawac precyzje ktorej nie mamy.
  const rcnByCity = new Map<string, Awaited<ReturnType<typeof getRcnComparables>>>()
  await Promise.all(
    Array.from(citiesInResults).map(async (c) => {
      const stats = await getRcnComparables({
        city: c,
        district: null,
        street: null,
        buildingNumber: null,
        propertyType: params.property_type || 'mieszkanie',
        area: (params.area_min && params.area_max) ? (params.area_min + params.area_max) / 2 : 50,
        marketType: null,
      }).catch(err => {
        console.error(`[search] Blad Cenogram/RCN dla ${c}:`, err.message)
        return null
      })
      rcnByCity.set(c, stats)
    })
  )
  function rcnForListing(l: PortalListing) {
    return rcnByCity.get((l.address_city || city).toLowerCase()) ?? rcnByCity.get(city.toLowerCase()) ?? null
  }
  const rcnSummary = Array.from(rcnByCity.entries()).map(([c, stats]) => ({
    city: c,
    median_price_per_m2: stats?.medianPricePerM2 ?? null,
    sample_size: stats?.count ?? 0,
    note: 'RCN nie rozroznia segmentu premium/standard - to mediana dla calego miasta',
  }))

  // ── Punkt 2: srednia z BIEZACEGO wyszukiwania, segmentowana ──────────
  const listingsAvgBySegment = { standard: null as number | null, premium: null as number | null }
  for (const seg of ['standard', 'premium'] as const) {
    const prices = allListings
      .filter(l => segmentOf(l) === seg)
      .map(l => (l.area && l.price) ? l.price / l.area : null)
      .filter((v): v is number => v !== null && v > 0)
    listingsAvgBySegment[seg] = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
  }

  // ── Punkt 3: rosnaca wlasna baza (market_intel), segmentowana ────────
  // To jest ten "coraz madrzejszy asystent" z ustalen sesji brandingowej -
  // baza rosnie z kazdym wyszukiwaniem w systemie (wielu userow, w czasie),
  // TERAZ poprawnie odseparowana na standard/premium zamiast jednej liczby.
  const archiveTrendBySegment = { standard: null as { avg: number | null; count: number } | null, premium: null as { avg: number | null; count: number } | null }
  await Promise.all(
    (['standard', 'premium'] as const).map(async (seg) => {
      const { data, error } = await marketIntelDb
        .from('portal_listings_archive')
        .select('price_per_m2')
        .ilike('city', `%${city}%`)
        .eq('market_segment', seg)
        .not('price_per_m2', 'is', null)
        .limit(500)

      if (error || !data || data.length === 0) {
        archiveTrendBySegment[seg] = { avg: null, count: 0 }
        return
      }
      const values = data.map((r: any) => r.price_per_m2).filter((v: number) => v > 0)
      const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null
      archiveTrendBySegment[seg] = { avg, count: values.length }
    })
  )

  const scoredListings = allListings.map(listing => {
    if (!listing.area || !listing.price) {
      return { ...listing, marketSegment: segmentOf(listing), dealScore: null }
    }
    const segment = segmentOf(listing)
    const offerPricePerM2 = listing.price / listing.area
    const rcnStats = rcnForListing(listing)
    const archiveTrend = archiveTrendBySegment[segment]
    const score = calculateDealScore({
      offerPricePerM2,
      references: {
        transactionAvgPricePerM2: rcnStats?.medianPricePerM2 ?? null,
        listingsAvgPricePerM2: listingsAvgBySegment[segment],
        archiveTrendPricePerM2: archiveTrend?.avg ?? null,
      },
    })
    return { ...listing, marketSegment: segment, dealScore: score }
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
      rcn_by_city: rcnSummary,
      listings_avg_by_segment: listingsAvgBySegment,
      archive_trend_by_segment: {
        standard: archiveTrendBySegment.standard,
        premium: archiveTrendBySegment.premium,
      },
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
    market_segment: detectMarketSegment({ title: l.title, description: l.description }),
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
