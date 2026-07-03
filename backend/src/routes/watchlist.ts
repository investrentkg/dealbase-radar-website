import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { radarDb } from '../db/clients'

export const watchlistRouter = Router()

// ── GET /api/watchlist ────────────────────────────────────────────────
watchlistRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  // const { data, error } = await radarDb.from('watchlists').select('*').eq('user_id', req.user!.id)
  res.status(501).json({ error: 'Watchlist nieaktywna - czeka na baze Supabase Radaru' })
})

// ── POST /api/watchlist ───────────────────────────────────────────────
// Zapisuje kryteria wyszukiwania do cyklicznego sprawdzania (podstawa
// pod alerty - reuzycie logiki "Obserwowane wyszukiwania" z roadmapy CRM).
watchlistRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, criteria } = req.body
  if (!criteria) return res.status(400).json({ error: 'criteria jest wymagane' })

  // const { data, error } = await radarDb.from('watchlists').insert({
  //   user_id: req.user!.id, name, criteria, created_at: new Date().toISOString()
  // }).select().single()

  res.status(501).json({ error: 'Watchlist nieaktywna - czeka na baze Supabase Radaru', received: { name, criteria } })
})

// ── DELETE /api/watchlist/:id ─────────────────────────────────────────
watchlistRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'Watchlist nieaktywna - czeka na baze Supabase Radaru' })
})
