import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
)

const radarDb = createClient(env.RADAR_SUPABASE_URL, env.RADAR_SUPABASE_SERVICE_KEY, {
  db: { schema: 'radar' }
})

const { data, error, count } = await radarDb.from('users').select('*', { count: 'exact' })

if (error) {
  console.log('BŁĄD:', JSON.stringify(error, null, 2))
} else {
  console.log('SUKCES — połączenie z schematem radar działa.')
  console.log('Liczba użytkowników:', count)
}
