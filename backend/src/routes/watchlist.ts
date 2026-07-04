import { Router, Response } from 'express'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { radarDb } from '../db/clients'

export const watchlistRouter = Router()

// ── GET /api/watchlist ────────────────────────────────────────────────
watchlistRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await radarDb
    .from('watchlists')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── POST /api/watchlist ───────────────────────────────────────────────
watchlistRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, criteria } = req.body
  if (!criteria) return res.status(400).json({ error: 'criteria jest wymagane' })

  const { data, error } = await radarDb
    .from('watchlists')
    .insert({ user_id: req.user!.id, name: name ?? null, criteria })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// ── PATCH /api/watchlist/:id ───────────────────────────────────────────
watchlistRouter.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, criteria, is_active } = req.body

  const { data, error } = await radarDb
    .from('watchlists')
    .update({
      ...(name !== undefined && { name }),
      ...(criteria !== undefined && { criteria }),
      ...(is_active !== undefined && { is_active }),
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id) // dodatkowa bariera obok RLS - backend uzywa service_role
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Nie znaleziono watchlisty' })
  res.json(data)
})

// ── DELETE /api/watchlist/:id ─────────────────────────────────────────
watchlistRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await radarDb
    .from('watchlists')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})
