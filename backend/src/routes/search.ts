import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'

export const searchRouter = Router()

// ── POST /api/search ───────────────────────────────────────────────────
// Docelowo: reuzywa istniejacej infrastruktury Apify z CRM (portals.ts,
// portal-search.ts, searchAllPortals()) - NIE budujemy drugiego scrapera
// od zera. Do podpiecia gdy: (1) potwierdzimy czy Radar korzysta z tego
// samego tokena Apify co CRM, czy dostaje wlasny na start, (2) powstanie
// wspolny "market intelligence layer" (patrz db/clients.ts).
//
// Wynik kazdego wyszukiwania powinien:
//  1. Wolac searchAllPortals() (logika z CRM)
//  2. Doliczac wyniki z licytacje.komornik.pl (patrz lib/courtAuctions.ts)
//  3. Dla kazdej oferty liczyc Deal Score (lib/dealScoreEngine.ts)
//  4. Zapisywac/aktualizowac portal_listings_archive we wspolnej bazie
searchRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { city, propertyType, priceMax, priceMin, includeAuctions } = req.body

  res.status(501).json({
    error: 'Wyszukiwanie nieaktywne - czeka na integracje z warstwa market intelligence',
    received_criteria: { city, propertyType, priceMax, priceMin, includeAuctions },
    todo: [
      'Podpiac searchAllPortals() z CRM (reuzyc, nie duplikowac)',
      'Dolozyc wyniki z lib/courtAuctions.ts (licytacje.komornik.pl)',
      'Policzyc Deal Score dla kazdego wyniku (lib/dealScoreEngine.ts)',
    ],
  })
})
