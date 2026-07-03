import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { calculateDealScore, DealScoreInput } from '../lib/dealScoreEngine'

export const dealScoreRouter = Router()

// ── POST /api/deal-score/calculate ────────────────────────────────────
// Liczy Deal Score dla pojedynczej oferty. Docelowo references.* beda
// pobierane automatycznie (Cenogram/RCN + srednia z wynikow search +
// portal_listings_archive), na razie przyjmuje je jako input do testow.
dealScoreRouter.post('/calculate', requireAuth, (req: AuthRequest, res: Response) => {
  const input: DealScoreInput = req.body

  if (!input.offerPricePerM2) {
    return res.status(400).json({ error: 'offerPricePerM2 jest wymagane' })
  }

  const result = calculateDealScore(input)
  res.json(result)
})
