import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { radarDb } from '../db/clients'

export const authRouter = Router()

// ── POST /api/auth/register ───────────────────────────────────────────
// TODO po utworzeniu projektu Supabase dla Radaru:
// 1. Odkomentowac faktyczny insert do tabeli radar_users (patrz schema.sql)
// 2. Wyslac e-mail powitalny (Resend / Supabase Auth email templates)
// 3. Podpiac program polecen (referral_code z linku, jesli obecny)
authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, referral_code } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail i haslo sa wymagane' })
  }

  const password_hash = await bcrypt.hash(password, 10)

  // Placeholder - docelowo insert do radar_users w nowym projekcie Supabase
  // const { data, error } = await radarDb.from('radar_users').insert({
  //   email, password_hash, plan: 'basic', trial_ends_at: addDays(new Date(), 30),
  //   referred_by: referral_code || null
  // }).select().single()

  res.status(501).json({
    error: 'Rejestracja nieaktywna - czeka na utworzenie projektu Supabase dla Radaru',
    received: { email, has_referral: !!referral_code }
  })
})

// ── POST /api/auth/login ───────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail i haslo sa wymagane' })
  }

  // Placeholder - docelowo lookup w radar_users + bcrypt.compare
  // const { data: user } = await radarDb.from('radar_users').select('*').eq('email', email).single()
  // if (!user || !(await bcrypt.compare(password, user.password_hash))) {
  //   return res.status(401).json({ error: 'Nieprawidlowy e-mail lub haslo' })
  // }
  // const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, process.env.JWT_SECRET!, { expiresIn: '30d' })

  res.status(501).json({ error: 'Logowanie nieaktywne - czeka na utworzenie projektu Supabase dla Radaru' })
})
