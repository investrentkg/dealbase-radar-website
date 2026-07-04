// ── Integracja SMS — SMSAPI.pl ────────────────────────────────────────
// Wybor: polski dostawca, brak abonamentu (placi sie za wyslane SMS-y),
// dobra dokumentacja REST, mozliwosc wlasnej nazwy nadawcy (np. "DealBase"
// zamiast losowego numeru) - buduje wiarygodnosc alertow.
//
// Konto + token trzeba zalozyc recznie (jak Apify/Cenogram) - SMS_API_TOKEN
// w .env. Dopoki brak tokena, wysylka jest no-opem (funkcja zwraca info
// o braku konfiguracji, nie rzuca bledem - zeby nie wywalac calego flow
// alertow tylko dlatego ze SMS jeszcze nie jest podlaczony).

const SMSAPI_BASE = 'https://api.smsapi.pl'

export interface SmsSendResult {
  sent: boolean
  reason?: string
  messageId?: string
}

export function isSmsConfigured(): boolean {
  return !!process.env.SMS_API_TOKEN
}

/**
 * Wysyla SMS. Numer w formacie polskim (np. "600123456" lub "+48600123456").
 * Nazwa nadawcy wymaga wczesniejszej rejestracji/akceptacji w panelu SMSAPI
 * (proces zajmuje kilka dni roboczych) - dopoki nie zatwierdzona, SMSAPI
 * wysyla z domyslnego numeru testowego/systemowego zamiast nazwy.
 */
export async function sendSms(params: {
  to: string
  message: string
  senderName?: string
}): Promise<SmsSendResult> {
  const token = process.env.SMS_API_TOKEN
  if (!token) {
    return { sent: false, reason: 'SMS_API_TOKEN nie skonfigurowany' }
  }

  try {
    const body = new URLSearchParams({
      to: params.to,
      message: params.message,
      format: 'json',
      ...(params.senderName ? { from: params.senderName } : {}),
    })

    const res = await fetch(`${SMSAPI_BASE}/sms.do`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await res.json() as any

    if (!res.ok || data.error) {
      return { sent: false, reason: data.message || `HTTP ${res.status}` }
    }

    return { sent: true, messageId: data.list?.[0]?.id }
  } catch (err: any) {
    return { sent: false, reason: err.message }
  }
}
