import { Router, Response } from 'express'
import { AuthRequest, requireAuth, requirePlan } from '../middleware/auth'
import { radarDb } from '../db/clients'

export const alertsRouter = Router()

// ── GET /api/alerts/preferences ───────────────────────────────────────
alertsRouter.get('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await radarDb
    .from('notification_preferences')
    .select('*')
    .eq('user_id', req.user!.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Brak preferencji - powinny powstac przy rejestracji' })
  res.json(data)
})

// ── PUT /api/alerts/preferences ───────────────────────────────────────
// email: wszystkie plany. SMS + push: plan Pro i wyzej (patrz cennik).
alertsRouter.put('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  const { email_enabled, sms_enabled, push_enabled, frequency } = req.body

  if ((sms_enabled || push_enabled) && req.user!.plan === 'basic') {
    return res.status(403).json({
      error: 'SMS i powiadomienia push wymagaja planu Pro lub wyzszego',
      current_plan: req.user!.plan,
    })
  }

  const { data, error } = await radarDb
    .from('notification_preferences')
    .update({
      ...(email_enabled !== undefined && { email_enabled }),
      ...(sms_enabled !== undefined && { sms_enabled }),
      ...(push_enabled !== undefined && { push_enabled }),
      ...(frequency !== undefined && { frequency }),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', req.user!.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── GET /api/alerts/history ───────────────────────────────────────────
alertsRouter.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await radarDb
    .from('alerts_log')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('sent_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── Notatka projektowa dla kolejnej sesji ─────────────────────────────
// Faktyczne WYSYLANIE alertow (email/sms/push) to osobny watek - potrzebuje:
//   - email: Resend albo SMTP
//   - sms: bramka SMS (SMSAPI.pl / Twilio - do wyboru)
//   - push: Web Push API (VAPID keys) + docelowo FCM dla apki mobilnej
// Ten plik obsluguje tylko PREFERENCJE i HISTORIE, nie sam mechanizm
// wysylki - to wymaga osobnego "workera" ktory cyklicznie sprawdza
// watchlisty (lib/notifications/ - do zbudowania w kolejnej sesji razem
// z modulem search/Apify).
