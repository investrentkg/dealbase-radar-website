import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import { authRouter } from './routes/auth'
import { searchRouter } from './routes/search'
import { dealScoreRouter } from './routes/dealscore'
import { auctionsRouter } from './routes/auctions'
import { watchlistRouter } from './routes/watchlist'
import { alertsRouter } from './routes/alerts'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ── Health check (jak w CRM: /health endpoint do weryfikacji po deployu) ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dealbase-radar-backend', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/search', searchRouter)
app.use('/api/deal-score', dealScoreRouter)
app.use('/api/auctions', auctionsRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/alerts', alertsRouter)

const PORT = process.env.PORT || 4100
app.listen(PORT, () => {
  console.log(`DealBase Radar backend running on port ${PORT}`)
})
