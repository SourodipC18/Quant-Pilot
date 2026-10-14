import { NextRequest, NextResponse } from 'next/server'

type TwelveDataValue = Record<string, string>

const baseUrl = 'https://api.twelvedata.com'

function configError() {
  return NextResponse.json({ error: 'Market data is not configured. Add your Twelve Data API key to the server environment to begin researching real instruments.', code: 'NOT_CONFIGURED' }, { status: 503 })
}

async function requestTwelveData(path: string, params: Record<string, string>) {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) return configError()
  const url = new URL(`${baseUrl}/${path}`)
  Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.status === 'error' || body?.code) {
    return NextResponse.json({ error: body?.message ?? 'The market-data provider returned an error.', code: body?.code ?? 'PROVIDER_ERROR' }, { status: response.status === 429 ? 429 : 502 })
  }
  return NextResponse.json(body)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? 'status'
  try {
    if (action === 'status') {
      return NextResponse.json({ configured: Boolean(process.env.TWELVE_DATA_API_KEY), provider: process.env.MARKET_DATA_PROVIDER ?? 'twelvedata', coverage: 'Coverage and freshness follow your Twelve Data plan.' })
    }
    if (action === 'search') {
      const symbol = searchParams.get('q')?.trim()
      if (!symbol || symbol.length < 2) return NextResponse.json({ data: [] })
      return requestTwelveData('symbol_search', { symbol })
    }
    if (action === 'history') {
      const symbol = searchParams.get('symbol')?.trim()
      const interval = searchParams.get('interval') ?? '1day'
      if (!symbol) return NextResponse.json({ error: 'Select an instrument before loading history.', code: 'INVALID_SYMBOL' }, { status: 400 })
      return requestTwelveData('time_series', { symbol, interval, outputsize: '5000', order: 'ASC' })
    }
    if (action === 'quote') {
      const symbol = searchParams.get('symbol')?.trim()
      if (!symbol) return NextResponse.json({ error: 'Select an instrument before loading a quote.', code: 'INVALID_SYMBOL' }, { status: 400 })
      return requestTwelveData('quote', { symbol })
    }
    return NextResponse.json({ error: 'Unsupported market-data action.', code: 'INVALID_ACTION' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? 'The market-data provider timed out. Try again.' : 'Unable to reach the market-data provider. Try again.'
    return NextResponse.json({ error: message, code: 'NETWORK_ERROR' }, { status: 504 })
  }
}

export type { TwelveDataValue }
