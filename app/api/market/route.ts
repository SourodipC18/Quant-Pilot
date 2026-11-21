import { NextRequest, NextResponse } from 'next/server'
import { SYMBOL_PATTERN } from '@/lib/market-instruments'
import { classifyProviderFailure, MARKET_INTERVALS, marketDataProvider, MAX_HISTORY_OBSERVATIONS, normalizeSymbol, PRICE_ADJUSTMENTS, validateHistory, type MarketInterval, type PriceAdjustment } from '@/lib/market-data'

export const runtime = 'nodejs'
type Action = 'status' | 'search' | 'quote' | 'history' | 'quality'
const actions = new Set<Action>(['status', 'search', 'quote', 'history', 'quality'])
const searchPattern = /^[\p{L}\p{N} .,&'()/:@-]{2,80}$/u
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const requestCounts = new Map<string, { count: number; reset: number }>()
const WINDOW_MS = 60_000
const REQUEST_LIMIT = 45

function jsonError(error: string, code: string, status: number, headers?: HeadersInit) { return NextResponse.json({ error, code }, { status, headers }) }
function rateLimit(request: NextRequest) {
  const now = Date.now(), key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const current = requestCounts.get(key)
  if (!current || current.reset <= now) {
    if (requestCounts.size >= 1000) {
      for (const [address, entry] of requestCounts) if (entry.reset <= now) requestCounts.delete(address)
      if (requestCounts.size >= 1000 && !current) return jsonError('Market data is busy. Try again shortly.', 'RATE_LIMITED', 429, { 'Retry-After': '60' })
    }
    requestCounts.set(key, { count: 1, reset: now + WINDOW_MS }); return null
  }
  current.count += 1
  if (current.count > REQUEST_LIMIT) return jsonError('Too many market-data requests. Try again shortly.', 'RATE_LIMITED', 429, { 'Retry-After': String(Math.ceil((current.reset - now) / 1000)) })
  return null
}
function asError(error: unknown) { const normalized = classifyProviderFailure(error); return jsonError(normalized.message, normalized.code, normalized.httpStatus) }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const actionValue = searchParams.get('action') ?? 'status'
  if (!actions.has(actionValue as Action)) return jsonError('Unsupported market-data action.', 'INVALID_ACTION', 400)
  const probe = searchParams.get('probe') === '1'
  if (actionValue !== 'status' || probe) { const limited = rateLimit(request); if (limited) return limited }
  if (actionValue === 'status') {
    const providers = await marketDataProvider.status(probe)
    return NextResponse.json({ configured: providers.some(provider => provider.configured), providers, coverage: 'NSE and BSE use Upstox. Other markets use Twelve Data, subject to plan coverage.' }, { headers: { 'Cache-Control': 'private, max-age=15' } })
  }
  if (actionValue === 'search') {
    const query = searchParams.get('q')?.trim() ?? ''
    if (!searchPattern.test(query)) return jsonError('Search must contain 2–80 valid characters.', 'INVALID_QUERY', 400)
    try { return NextResponse.json(await marketDataProvider.search(query), { headers: { 'Cache-Control': 'private, max-age=300' } }) } catch (error) { return asError(error) }
  }
  const symbolValue = searchParams.get('symbol')?.trim() ?? ''
  if (!SYMBOL_PATTERN.test(symbolValue)) return jsonError('Select a valid exchange-qualified instrument.', 'INVALID_SYMBOL', 400)
  const symbol = normalizeSymbol(symbolValue)
  if (actionValue === 'quote') {
    try { return NextResponse.json(await marketDataProvider.quote(symbol), { headers: { 'Cache-Control': 'private, no-store' } }) } catch (error) { return asError(error) }
  }
  const intervalValue = searchParams.get('interval') ?? '1day'
  if (!MARKET_INTERVALS.includes(intervalValue as MarketInterval)) return jsonError('Unsupported historical interval.', 'INVALID_INTERVAL', 400)
  const interval = intervalValue as MarketInterval
  const outputsize = Number(searchParams.get('outputsize') ?? '500')
  if (!Number.isInteger(outputsize) || outputsize < 1 || outputsize > MAX_HISTORY_OBSERVATIONS) return jsonError(`History size must be an integer between 1 and ${MAX_HISTORY_OBSERVATIONS}; larger ranges must be requested in separate date windows.`, 'INVALID_OUTPUTSIZE', 400)
  const adjustmentValue = searchParams.get('adjust') ?? undefined
  if (adjustmentValue !== undefined && !PRICE_ADJUSTMENTS.includes(adjustmentValue as PriceAdjustment)) return jsonError('Adjustment must be all, splits, dividends, or none.', 'INVALID_ADJUSTMENT', 400)
  const startDate = searchParams.get('start_date') ?? undefined, endDate = searchParams.get('end_date') ?? undefined
  if (startDate !== undefined && !validDate(startDate) || endDate !== undefined && !validDate(endDate) || startDate && endDate && startDate > endDate) return jsonError('Date bounds must use real YYYY-MM-DD dates with start_date no later than end_date.', 'INVALID_DATE_RANGE', 400)
  try {
    const history = await marketDataProvider.history({ symbol, interval, outputsize, adjustment: adjustmentValue as PriceAdjustment, startDate, endDate })
    const quality = validateHistory(history.values, interval, endDate ? new Date(Math.min(Date.now(), Date.parse(`${endDate}T23:59:59Z`))) : undefined)
    const payload = { values: history.values, meta: history.meta, source: history.source, lastSyncedAt: history.fetchedAt, interval: history.interval, adjustment: history.adjustment, quality }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return asError(error) }
}
