import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { radarDb } from '../db/clients'

export const authRouter = Router()

const TRIAL_DAYS = 30

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function signToken(user: { id: string; email: string; plan: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan },
    process.env.JWT_SECRET || '',
    { expiresIn: '30d' }
  )
}

// ── POST /api/auth/register ───────────────────────────────────────────
authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, referral_code } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail i haslo sa wymagane' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Haslo musi miec co najmniej 8 znakow' })
  }

  const { data: existing } = await radarDb
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Konto z tym adresem e-mail juz istnieje' })
  }

  let referredBy: string | null = null
  if (referral_code) {
    const { data: referrer } = await radarDb
      .from('users')
      .select('id')
      .eq('referral_code', referral_code)
      .maybeSingle()
    referredBy = referrer?.id ?? null
  }

  const password_hash = await bcrypt.hash(password, 10)
  const trial_ends_at = addDays(new Date(), TRIAL_DAYS).toISOString()

  const { data: user, error } = await radarDb
    .from('users')
    .insert({
      email: email.toLowerCase(),
      password_hash,
      plan: 'basic',
      trial_ends_at,
      referred_by: referredBy,
    })
    .select()
    .single()

  if (error || !user) {
    return res.status(500).json({ error: 'Nie udalo sie utworzyc konta', details: error?.message })
  }

  await radarDb.from('subscriptions').insert({
    user_id: user.id,
    plan: 'basic',
    status: 'trialing',
    current_period_end: trial_ends_at,
  })

  await radarDb.from('notification_preferences').insert({
    user_id: user.id,
  })

  const token = signToken(user)
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, trial_ends_at: user.trial_ends_at, referral_code: user.referral_code },
  })
})

// ── POST /api/auth/login ───────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail i haslo sa wymagane' })
  }

  const { data: user } = await radarDb
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Nieprawidlowy e-mail lub haslo' })
  }

  const token = signToken(user)
  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, trial_ends_at: user.trial_ends_at, referral_code: user.referral_code },
  })
})
