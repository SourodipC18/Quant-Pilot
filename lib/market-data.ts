export type MarketInterval = '1min' | '5min' | '15min' | '30min' | '45min' | '1h' | '2h' | '4h' | '1day' | '1week' | '1month'
export type PriceAdjustment = 'all' | 'splits' | 'dividends' | 'none'
export type MarketBar = { datetime: string; open: string; high: string; low: string; close: string; volume: string | null }
export type MarketQuality = {
  status: 'available' | 'warning' | 'unavailable'
  observations: number
  missingObservations: number | null
  missingPercentage: number | null
  duplicates: number
  invalidOhlc: number
  abnormalMoves: number
  missingVolume: number
  latestObservation: string | null
  stale: boolean | null
  coverageStart: string | null
  coverageEnd: string | null
  warnings: string[]
}
export type ProviderHistory = { values: MarketBar[]; meta?: Record<string, unknown>; source: string; fetchedAt: string; interval: MarketInterval; adjustment: PriceAdjustment }
export type MarketDataProvider = {
  readonly id: string
  history(input: { symbol: string; interval: MarketInterval; outputsize: number; adjustment: PriceAdjustment; startDate?: string; endDate?: string }): Promise<ProviderHistory>
  search(query: string): Promise<unknown>
  quote(symbol: string): Promise<unknown>
}

export const MARKET_INTERVALS: readonly MarketInterval[] = ['1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '1day', '1week', '1month']
export const PRICE_ADJUSTMENTS: readonly PriceAdjustment[] = ['all', 'splits', 'dividends', 'none']
const MAX_OUTPUTSIZE = 5000
const requestTimeoutMs = 10_000
const historyCache = new Map<string, { expiresAt: number; value: ProviderHistory }>()

export class MarketDataError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) { super(message); this.name = 'MarketDataError' }
}

function normalizeTimestamp(value: unknown, interval: MarketInterval) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const timestamp = value.trim()
  if (interval === '1day' || interval === '1week' || interval === '1month') return /^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? timestamp : ''
  const utcTimestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? timestamp : `${timestamp.replace(' ', 'T')}Z`
  const parsed = new Date(utcTimestamp)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

export function normalizeSymbol(value: string) { return value.trim().toUpperCase() }

export function normalizeProviderMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const metadata = { ...(value as Record<string, unknown>) }
  if (typeof metadata.symbol === 'string') metadata.symbol = normalizeSymbol(metadata.symbol)
  if (typeof metadata.exchange === 'string') metadata.exchange = metadata.exchange.trim().toUpperCase()
  if (typeof metadata.currency === 'string') metadata.currency = metadata.currency.trim().toUpperCase()
  return metadata
}

export function normalizeHistory(raw: unknown, interval: MarketInterval): MarketBar[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { values?: unknown }).values)) return []
  return ((raw as { values: unknown[] }).values).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const datetime = normalizeTimestamp(value.datetime, interval)
    if (!datetime) return []
    const asValue = (candidate: unknown) => typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : ''
    return [{ datetime, open: asValue(value.open), high: asValue(value.high), low: asValue(value.low), close: asValue(value.close), volume: value.volume == null || value.volume === '' ? null : asValue(value.volume) }]
  }).sort((left, right) => left.datetime.localeCompare(right.datetime))
}

export function validateHistory(bars: MarketBar[], interval: MarketInterval, now = new Date()): MarketQuality {
  const warnings: string[] = []
  const seen = new Set<string>()
  let duplicates = 0, invalidOhlc = 0, abnormalMoves = 0, missingVolume = 0
  for (const bar of bars) {
    if (seen.has(bar.datetime)) duplicates += 1
    seen.add(bar.datetime)
    const open = Number(bar.open), high = Number(bar.high), low = Number(bar.low), close = Number(bar.close)
    if (![open, high, low, close].every(Number.isFinite) || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close)) invalidOhlc += 1
    if (bar.volume == null || bar.volume === '' || !Number.isFinite(Number(bar.volume))) missingVolume += 1
  }
  const sorted = [...bars].sort((a, b) => a.datetime.localeCompare(b.datetime))
  const latestObservation = sorted.at(-1)?.datetime ?? null
  const dayInterval = interval === '1day' || interval === '1week' || interval === '1month'
  let missingObservations: number | null = interval === '1day' || interval === '1week' || interval === '1month' ? 0 : null
  for (let index = 1; index < sorted.length; index += 1) {
    if (interval === '1day') {
      const previous = Date.parse(`${sorted[index - 1].datetime}T00:00:00Z`)
      const current = Date.parse(`${sorted[index].datetime}T00:00:00Z`)
      for (let day = previous + 86_400_000; day < current; day += 86_400_000) {
        const weekday = new Date(day).getUTCDay()
        if (weekday !== 0 && weekday !== 6) missingObservations! += 1
      }
    } else if (interval === '1week') {
      const daysApart = (Date.parse(sorted[index].datetime) - Date.parse(sorted[index - 1].datetime)) / 86_400_000
      missingObservations! += Math.max(0, Math.round(daysApart / 7) - 1)
    } else if (interval === '1month') {
      const [previousYear, previousMonth] = sorted[index - 1].datetime.split('-').map(Number)
      const [currentYear, currentMonth] = sorted[index].datetime.split('-').map(Number)
      missingObservations! += Math.max(0, (currentYear - previousYear) * 12 + currentMonth - previousMonth - 1)
    }
    const previousClose = Number(sorted[index - 1].close), currentClose = Number(sorted[index].close)
    if (previousClose > 0 && Number.isFinite(currentClose) && Math.abs(currentClose / previousClose - 1) > 0.2) abnormalMoves += 1
  }
  if (missingObservations) {
    const observationLabel = interval === '1day' ? 'expected weekday observation' : interval === '1week' ? 'expected weekly observation' : 'expected monthly observation'
    const holidayNote = interval === '1day' ? ' Exchange holidays are not calendar-adjusted.' : ''
    warnings.push(`${missingObservations} ${observationLabel}${missingObservations === 1 ? '' : 's'} missing.${holidayNote}`)
  }
  if (duplicates) warnings.push(`${duplicates} duplicate timestamp${duplicates === 1 ? '' : 's'} detected.`)
  if (invalidOhlc) warnings.push(`${invalidOhlc} bar${invalidOhlc === 1 ? '' : 's'} violate OHLC relationships or contain invalid prices.`)
  if (abnormalMoves) warnings.push(`${abnormalMoves} price move${abnormalMoves === 1 ? '' : 's'} exceeded the 20% review threshold.`)
  if (missingVolume) warnings.push(`${missingVolume} observation${missingVolume === 1 ? '' : 's'} have missing volume.`)
  const latestTime = latestObservation ? Date.parse(dayInterval ? `${latestObservation}T23:59:59Z` : latestObservation) : NaN
  const freshnessDays = interval === '1month' ? 45 : interval === '1week' ? 14 : 4
  const stale = Number.isFinite(latestTime) ? now.getTime() - latestTime > freshnessDays * 86_400_000 : null
  if (stale) warnings.push('The latest observation is older than the freshness threshold; the exchange may be closed.')
  const missingPercentage = missingObservations == null || !sorted.length ? null : missingObservations / (sorted.length + missingObservations) * 100
  const status = !bars.length ? 'unavailable' : warnings.length ? 'warning' : 'available'
  return { status, observations: bars.length, missingObservations, missingPercentage, duplicates, invalidOhlc, abnormalMoves, missingVolume, latestObservation, stale, coverageStart: sorted[0]?.datetime ?? null, coverageEnd: sorted.at(-1)?.datetime ?? null, warnings }
}

export function classifyProviderFailure(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) return error
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return new MarketDataError('The market-data provider timed out. Try again.', 'TIMEOUT', 504)
  return new MarketDataError('Unable to reach the market-data provider. Try again.', 'NETWORK_ERROR', 504)
}

export class TwelveDataAdapter implements MarketDataProvider {
  readonly id = 'twelvedata'
  constructor(private readonly apiKey = process.env.TWELVE_DATA_API_KEY?.trim(), private readonly fetcher: typeof fetch = fetch) {}

  private async endpoint(path: 'symbol_search' | 'quote', params: Record<string, string>) {
    if (!this.apiKey) throw new MarketDataError('Market data is not configured. Add the Twelve Data key to the server environment.', 'NOT_CONFIGURED', 503)
    const url = new URL(`https://api.twelvedata.com/${path}`)
    for (const [key, value] of Object.entries({ ...params, apikey: this.apiKey })) url.searchParams.set(key, value)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(requestTimeoutMs), next: { revalidate: path === 'quote' ? 30 : 300 } })
        const body: unknown = await response.json().catch(() => null)
        const provider = body && typeof body === 'object' ? body as Record<string, unknown> : {}
        const failed = !response.ok || !body || typeof body !== 'object' || provider.status === 'error' || Boolean(provider.code)
        if (failed) {
          const code = String(provider.code ?? 'PROVIDER_ERROR')
          const retryable = response.status === 429 || response.status >= 500 || ['429', '5000', '504'].includes(code)
          if (retryable && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); continue }
          throw new MarketDataError(typeof provider.message === 'string' ? provider.message : 'The market-data provider returned an error.', code, response.status === 429 ? 429 : response.status >= 500 ? 502 : 400)
        }
        return body
      } catch (error) {
        if (error instanceof MarketDataError) throw error
        if (attempt < 2 && error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'AbortError') { await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1))); continue }
        throw classifyProviderFailure(error)
      }
    }
    throw new MarketDataError('The market-data provider did not respond after retries.', 'PROVIDER_ERROR', 502)
  }

  search(query: string) { return this.endpoint('symbol_search', { symbol: query }) }
  quote(symbol: string) { return this.endpoint('quote', { symbol: normalizeSymbol(symbol) }) }

  async history(input: { symbol: string; interval: MarketInterval; outputsize: number; adjustment: PriceAdjustment; startDate?: string; endDate?: string }): Promise<ProviderHistory> {
    if (!this.apiKey) throw new MarketDataError('Market data is not configured. Add the Twelve Data key to the server environment.', 'NOT_CONFIGURED', 503)
    if (!Number.isInteger(input.outputsize) || input.outputsize < 1 || input.outputsize > MAX_OUTPUTSIZE) throw new MarketDataError(`Twelve Data supports 1–${MAX_OUTPUTSIZE} observations per request.`, 'INVALID_OUTPUTSIZE', 400)
    const cacheKey = [normalizeSymbol(input.symbol), input.interval, input.outputsize, input.adjustment, input.startDate ?? '', input.endDate ?? ''].join('|')
    const cached = historyCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const params: Record<string, string> = { symbol: normalizeSymbol(input.symbol), interval: input.interval, outputsize: String(input.outputsize), order: 'ASC', adjust: input.adjustment }
    if (input.startDate) params.start_date = input.startDate
    if (input.endDate) params.end_date = input.endDate
    if (!['1day', '1week', '1month'].includes(input.interval)) params.timezone = 'UTC'
    const url = new URL('https://api.twelvedata.com/time_series')
    for (const [key, value] of Object.entries({ ...params, apikey: this.apiKey })) url.searchParams.set(key, value)
    let response: Response | undefined, body: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await this.fetcher(url, { signal: AbortSignal.timeout(requestTimeoutMs), cache: 'no-store' })
        body = await response.json().catch(() => null)
      } catch (error) {
        if (attempt < 2 && error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'AbortError') { await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1))); continue }
        throw classifyProviderFailure(error)
      }
      if (response.ok && body && typeof body === 'object' && !('status' in body && (body as { status?: string }).status === 'error') && !('code' in body && (body as { code?: unknown }).code)) break
      const provider = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const code = String(provider.code ?? 'PROVIDER_ERROR')
      const retryable = response.status === 429 || response.status >= 500 || ['429', '5000', '504'].includes(code)
      if (retryable && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); continue }
      const httpStatus = response.status === 429 || code === '429' ? 429 : response.status >= 500 ? 502 : 400
      throw new MarketDataError(typeof provider.message === 'string' ? provider.message : 'The market-data provider returned an error.', code, httpStatus)
    }
    if (!body || typeof body !== 'object') throw new MarketDataError('The market-data provider returned an invalid response.', 'INVALID_PROVIDER_RESPONSE', 502)
    const result = { values: normalizeHistory(body, input.interval), meta: normalizeProviderMetadata((body as { meta?: Record<string, unknown> }).meta), source: this.id, fetchedAt: new Date().toISOString(), interval: input.interval, adjustment: input.adjustment }
    if (historyCache.size >= 200) historyCache.delete(historyCache.keys().next().value as string)
    historyCache.set(cacheKey, { expiresAt: Date.now() + 300_000, value: result })
    return result
  }
}

export const marketDataProvider: MarketDataProvider = new TwelveDataAdapter()
export const MAX_HISTORY_OBSERVATIONS = MAX_OUTPUTSIZE
