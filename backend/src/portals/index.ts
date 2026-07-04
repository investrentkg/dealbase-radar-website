import { PortalAdapter, PortalSearchParams, PortalSearchResult } from './types'
import { nieruchomosciOnlineScraperAdapter } from './nieruchomosci-online.scraper'
import {
  apifyOtodomAdapter,
  apifyOlxAdapter,
  apifyGratkaAdapter,
  apifyMorizonAdapter,
  apifyNieroOnlineAdapter,
  apifyDomiportaAdapter,
  apifyAdresowoAdapter
} from './apify.scraper'

// Wszystkie portale przez Apify (bezpośredni scraping blokowany przez CDN/Cloudflare)
function getOtodomAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyOtodomAdapter : { name:'otodom', label:'Otodom', isConfigured:()=>false, search:async()=>({portal:'otodom',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}
function getOlxAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyOlxAdapter : { name:'olx', label:'OLX', isConfigured:()=>false, search:async()=>({portal:'olx',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}
function getGratkaAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyGratkaAdapter : { name:'gratka', label:'Gratka', isConfigured:()=>false, search:async()=>({portal:'gratka',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}
function getMorizonAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyMorizonAdapter : { name:'morizon', label:'Morizon', isConfigured:()=>false, search:async()=>({portal:'morizon',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}
function getNieroOnlineAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyNieroOnlineAdapter : nieruchomosciOnlineScraperAdapter
}
function getDomiportaAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyDomiportaAdapter : { name:'domiporta', label:'Domiporta', isConfigured:()=>false, search:async()=>({portal:'domiporta',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}
function getAdresowoAdapter(): PortalAdapter {
  return process.env.APIFY_TOKEN ? apifyAdresowoAdapter : { name:'adresowo', label:'Adresowo', isConfigured:()=>false, search:async()=>({portal:'adresowo',listings:[],total:0,error:'Brak APIFY_TOKEN'}) }
}

export function getAdapters(): PortalAdapter[] {
  return [
    getOtodomAdapter(),
    getOlxAdapter(),
    getGratkaAdapter(),
    getMorizonAdapter(),
    getNieroOnlineAdapter(),
    getDomiportaAdapter(),
    getAdresowoAdapter(),
  ]
}

export function getPortalsStatus() {
  const hasApify = !!process.env.APIFY_TOKEN
  return getAdapters().map(a => ({
    name: a.name,
    label: a.label,
    configured: a.isConfigured(),
    via: hasApify ? 'apify' : 'scraper'
  }))
}

export async function searchAllPortals(
  params: PortalSearchParams,
  portalNames?: string[]
): Promise<PortalSearchResult[]> {
  const adapters = getAdapters()
  const selected = portalNames
    ? adapters.filter(a => portalNames.includes(a.name))
    : adapters.filter(a => a.isConfigured())

  if (selected.length === 0) return []

  // Apify cold start może trwać do 90s — outer timeout musi być > 95s
  const PORTAL_TIMEOUT_MS = 100000

  const results = await Promise.all(
    selected.map(async (adapter) => {
      try {
        return await Promise.race([
          adapter.search(params),
          new Promise<PortalSearchResult>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ${PORTAL_TIMEOUT_MS/1000}s`)), PORTAL_TIMEOUT_MS)
          )
        ])
      } catch (err: any) {
        return { portal: adapter.name, listings: [], total: 0, error: err.message } as PortalSearchResult
      }
    })
  )
  return results
}
