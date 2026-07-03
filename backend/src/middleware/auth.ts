import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Wzorowane na middleware/auth.ts z investrent-crm, ale bez wielo-tenancji
// (Radar to konta indywidualnych inwestorow, nie agencji) i bez rol
// agent/manager - tu liczy sie tylko plan subskrypcji (basic/pro/vip).

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    plan: 'basic' | 'pro' | 'vip'
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Brak tokenu autoryzacji' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || '') as AuthRequest['user']
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Nieprawidlowy lub wygasly token' })
  }
}

// ── Wymagaj konkretnego planu lub wyzszego ──────────────────────────────
const PLAN_RANK = { basic: 0, pro: 1, vip: 2 } as const

export function requirePlan(minPlan: keyof typeof PLAN_RANK) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Brak autoryzacji' })
    if (PLAN_RANK[req.user.plan] < PLAN_RANK[minPlan]) {
      return res.status(403).json({
        error: `Ta funkcja wymaga planu ${minPlan} lub wyzszego`,
        current_plan: req.user.plan
      })
    }
    next()
  }
}
