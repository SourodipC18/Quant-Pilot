import { NextRequest, NextResponse } from 'next/server'

type TwelveDataValue = Record<string, string>
type Action = 'status' | 'search' | 'quote' | 'history'

const baseUrl = 'https://api.twelvedata.com'
const intervals = new Set(['1min', '5min', '15min', '30min', '1h', '1day', '1week', '1month'])
const actions = new Set<Action>(['status', 'search', 'quote', 'history'])
const symbolPattern = /^[A-Za-z0-9._:/-]{1,64}$/
const searchPattern = /^[\p{L}\p{N} .,&'()/-]{2,80}$/u
const requestCounts = new Map<string, { count: number; reset: number }>()
const WINDOW_MS = 60_000
const REQUEST_LIMIT = 45

function jsonError(error: string, code: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error, code }, { status, headers })
}

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
}

function rateLimit(request: NextRequest) {
  const now = Date.now()
  const key = clientKey(request)
  const current = requestCounts.get(key)
  if (!current || current.reset <= now) {
    requestCounts.set(key, { count: 1, reset: now + WINDOW_MS })
    return null
  }
  current.count += 1
  if (current.count > REQUEST_LIMIT) {
    return jsonError('Too many market-data requests. Try again shortly.', 'RATE_LIMITED', 429, { 'Retry-After': String(Math.ceil((current.reset - now) / 1000)) })
  }
  return null
}

function configError() {
  return jsonError('Market data is not configured. Add the Twelve Data key to the server environment.', 'NOT_CONFIGURED', 503)
}

function providerError(body: unknown, responseStatus: number) {
  const provider = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const message = typeof provider.message === 'string' ? provider.message : 'The market-data provider returned an error.'
  const providerCode = typeof provider.code === 'string' || typeof provider.code === 'number' ? String(provider.code) : 'PROVIDER_ERROR'
  const status = responseStatus === 429 || providerCode === '429' ? 429 : 502
  return jsonError(message, providerCode, status)
}

async function requestTwelveData(path: 'symbol_search' | 'time_series' | 'quote', params: Record<string, string>) {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim()
  if (!apiKey) return configError()
  const url = new URL(`${baseUrl}/${path}`)
  Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value))
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: path === 'time_series' ? 300 : 30 } })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok || !body || typeof body !== 'object' || 'status' in body && (body as { status?: string }).status === 'error' || 'code' in body && (body as { code?: unknown }).code) return providerError(body, response.status)
    return NextResponse.json(body, { headers: { 'Cache-Control': path === 'time_series' ? 'private, max-age=300' : 'private, max-age=30' } })
  } catch (error) {
    return jsonError(error instanceof Error && error.name === 'TimeoutError' ? 'The market-data provider timed out. Try again.' : 'Unable to reach the market-data provider. Try again.', error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR', 504)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const actionValue = searchParams.get('action') ?? 'status'
  if (!actions.has(actionValue as Action)) return jsonError('Unsupported market-data action.', 'INVALID_ACTION', 400)
  if (actionValue !== 'status') {
    const limited = rateLimit(request)
    if (limited) return limited
  }
  if (actionValue === 'status') return NextResponse.json({ configured: Boolean(process.env.TWELVE_DATA_API_KEY), provider: process.env.MARKET_DATA_PROVIDER ?? 'twelvedata', coverage: 'Coverage and freshness follow your Twelve Data plan.' })
  if (actionValue === 'search') {
    const query = searchParams.get('q')?.trim() ?? ''
    if (!searchPattern.test(query)) return jsonError('Search must contain 2–80 valid characters.', 'INVALID_QUERY', 400)
    return requestTwelveData('symbol_search', { symbol: query })
  }
  const symbol = searchParams.get('symbol')?.trim() ?? ''
  if (!symbolPattern.test(symbol)) return jsonError('Select a valid exchange-qualified instrument.', 'INVALID_SYMBOL', 400)
  if (actionValue === 'quote') return requestTwelveData('quote', { symbol })
  const interval = searchParams.get('interval') ?? '1day'
  const outputsizeValue = Number(searchParams.get('outputsize') ?? '500')
  if (!intervals.has(interval)) return jsonError('Unsupported historical interval.', 'INVALID_INTERVAL', 400)
  if (!Number.isInteger(outputsizeValue) || outputsizeValue < 1 || outputsizeValue > 5000) return jsonError('History size must be an integer between 1 and 5000.', 'INVALID_OUTPUTSIZE', 400)
  return requestTwelveData('time_series', { symbol, interval, outputsize: String(outputsizeValue), order: 'ASC' })
}

export type { TwelveDataValue }

