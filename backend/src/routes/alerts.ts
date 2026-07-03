import { Router, Response } from 'express'
import { AuthRequest, requireAuth, requirePlan } from '../middleware/auth'

export const alertsRouter = Router()

// ── GET /api/alerts/preferences ───────────────────────────────────────
alertsRouter.get('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'Preferencje alertow nieaktywne - czeka na baze Supabase Radaru' })
})

// ── PUT /api/alerts/preferences ───────────────────────────────────────
// email: wszystkie plany. SMS + push: plan Pro i wyzej (patrz cennik na stronie).
alertsRouter.put('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  const { email_enabled, sms_enabled, push_enabled, frequency } = req.body
  res.status(501).json({
    error: 'Preferencje alertow nieaktywne - czeka na baze Supabase Radaru',
    received: { email_enabled, sms_enabled, push_enabled, frequency },
  })
})

// ── PUT /api/alerts/preferences/sms (wymaga planu Pro+) ───────────────
alertsRouter.put('/preferences/sms', requireAuth, requirePlan('pro'), async (req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'SMS nieaktywne - czeka na integracje z bramka SMS + baze Supabase Radaru' })
})

// ── Notatka projektowa dla kolejnej sesji ─────────────────────────────
// Kanaly dostawy (do zaimplementowania osobno, kazdy jako wlasny modul
// w lib/notifications/):
//   - email: Resend albo SMTP (do ustalenia z istniejaca infrastruktura)
//   - sms: bramka SMS (do wyboru - SMSAPI.pl / Twilio - porownac ceny)
//   - push: Web Push API (VAPID keys) dla PWA + FCM gdy powstanie
//     natywna aplikacja mobilna (patrz roadmapa: "aplikacja mobilna z
//     powiadomieniami push")
// Kolejnosc dostarczania dla planu VIP: priorytetowa kolejka = ich
// zadania trafiaja do kolejki przetwarzania PRZED userami basic/pro.
