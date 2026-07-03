import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { fetchCourtAuctions, auctionDiscountPercent } from '../lib/courtAuctions'

export const auctionsRouter = Router()

// ── GET /api/auctions ──────────────────────────────────────────────────
auctionsRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { voivodeship, propertyType, maxCallPrice } = req.query

  try {
    const listings = await fetchCourtAuctions({
      voivodeship: voivodeship as string,
      propertyType: propertyType as string,
      maxCallPrice: maxCallPrice ? Number(maxCallPrice) : undefined,
    })
    res.json(listings.map(l => ({ ...l, discountPercent: auctionDiscountPercent(l) })))
  } catch (e: any) {
    res.status(501).json({ error: e.message })
  }
})
