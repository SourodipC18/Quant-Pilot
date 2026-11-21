import { gunzipSync } from 'node:zlib'
import { instrumentSymbol, isIndianExchange, providerForSymbol, symbolParts, type Instrument, type ProviderConnection, type ProviderId } from './market-instruments'

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
export type HistoryRequest = { symbol: string; interval: MarketInterval; outputsize: number; adjustment?: PriceAdjustment; startDate?: string; endDate?: string }
export type MarketQuote = { symbol: string; exchange?: string; currency?: string; instrument_key?: string; source: ProviderId; close?: string; change?: string; percent_change?: string; datetime?: string; open?: string; high?: string; low?: string; volume?: string }
export type MarketDataProvider = {
  readonly id: ProviderId
  readonly configured: boolean
  history(input: HistoryRequest): Promise<ProviderHistory>
  search(query: string): Promise<Instrument[]>
  quote(symbol: string): Promise<MarketQuote>
}

export const MARKET_INTERVALS: readonly MarketInterval[] = ['1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '1day', '1week', '1month']
export const PRICE_ADJUSTMENTS: readonly PriceAdjustment[] = ['all', 'splits', 'dividends', 'none']
const MAX_OUTPUTSIZE = 5000
const requestTimeoutMs = 4_500

async function retryShortly(response: Response, fallback: number) {
  const retryAfter = response.headers.get('Retry-After')
  const delay = retryAfter === null ? fallback : /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()
  if (!Number.isFinite(delay) || delay > 1000) return false
  await sleep(Math.max(150, delay))
  return true
}
type Cached<T> = { expiresAt: number; value: T }
function storeCached<T>(cache: Map<string, Cached<T>>, key: string, value: T, ttl: number) {
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, { expiresAt: Date.now() + ttl, value })
}

function twelveInstrumentParams(id: string): Record<string, string> {
  const { symbol, exchange } = symbolParts(id)
  if (!exchange) return { symbol }
  return exchange.startsWith('@') ? { symbol, mic_code: exchange.slice(1) } : { symbol, exchange }
}

function assertTwelveListing(requested: string, meta?: Record<string, unknown>) {
  if (typeof meta?.exchange === 'string' && isIndianExchange(meta.exchange) || typeof meta?.mic_code === 'string' && isIndianExchange(meta.mic_code)) throw new MarketDataError('NSE and BSE data must use Upstox. Select the Indian listing or append :NSE or :BSE.', 'INDIAN_EXCHANGE_REQUIRED', 400)
  const { symbol, exchange } = symbolParts(requested)
  if (typeof meta?.symbol === 'string' && normalizeSymbol(meta.symbol) !== symbol || exchange?.startsWith('@') && typeof meta?.mic_code === 'string' && normalizeSymbol(meta.mic_code) !== exchange.slice(1) || exchange && !exchange.startsWith('@') && typeof meta?.exchange === 'string' && normalizeSymbol(meta.exchange) !== exchange) throw new MarketDataError('Twelve Data returned a different listing than requested. Select the instrument from search and retry.', 'LISTING_MISMATCH', 502)
}

function twelveError(status: number, code: string) {
  if (status === 429 || code === '429') return new MarketDataError('Twelve Data is rate limited. Wait for your plan quota to reset and retry.', 'RATE_LIMITED', 429)
  if ([401, 403].includes(status) || ['401', '403'].includes(code)) return new MarketDataError('Twelve Data denied access. Check the API key and coverage for this listing or endpoint.', 'PROVIDER_ACCESS_DENIED', 403)
  if (status >= 500 || ['5000', '504'].includes(code)) return new MarketDataError('Twelve Data is temporarily unavailable. Try again shortly.', 'PROVIDER_ERROR', 502)
  return new MarketDataError('Twelve Data did not return data for this request. Check the instrument, dates and plan coverage.', 'PROVIDER_NO_DATA', 404)
}

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
  if (typeof metadata.currency === 'string') {
    const currency = metadata.currency.trim()
    metadata.currency = currency === 'GBp' ? 'GBX' : currency.toUpperCase()
  }
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
  private readonly historyCache = new Map<string, Cached<ProviderHistory>>()
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
          if (retryable && attempt < 2 && await retryShortly(response, 200 * (attempt + 1))) continue
          throw twelveError(response.status, code)
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

  get configured() { return Boolean(this.apiKey) }

  async search(query: string): Promise<Instrument[]> {
    const body = await this.endpoint('symbol_search', { symbol: query }) as { data?: Instrument[] }
    return (Array.isArray(body.data) ? body.data : []).filter(item => typeof item.symbol === 'string' && !isIndianExchange(item.exchange) && !isIndianExchange(item.mic_code)).map(item => ({ ...item, source: this.id }))
  }

  async quote(symbol: string): Promise<MarketQuote> {
    const body = normalizeProviderMetadata(await this.endpoint('quote', twelveInstrumentParams(symbol))) ?? {}
    assertTwelveListing(symbol, body)
    if (typeof body.symbol !== 'string' || !Number.isFinite(Number(body.close)) || Number(body.close) <= 0) throw new MarketDataError('Twelve Data did not return a usable quote.', 'PROVIDER_NO_DATA', 404)
    return { symbol: body.symbol, exchange: text(body.exchange), currency: text(body.currency), source: this.id, close: text(body.close), open: text(body.open), high: text(body.high), low: text(body.low), change: text(body.change), percent_change: text(body.percent_change), datetime: text(body.datetime), volume: text(body.volume) }
  }

  async history(input: HistoryRequest): Promise<ProviderHistory> {
    const adjustment = input.adjustment ?? 'splits'
    if (!this.apiKey) throw new MarketDataError('Market data is not configured. Add the Twelve Data key to the server environment.', 'NOT_CONFIGURED', 503)
    if (!Number.isInteger(input.outputsize) || input.outputsize < 1 || input.outputsize > MAX_OUTPUTSIZE) throw new MarketDataError(`Twelve Data supports 1–${MAX_OUTPUTSIZE} observations per request.`, 'INVALID_OUTPUTSIZE', 400)
    const cacheKey = JSON.stringify([normalizeSymbol(input.symbol), input.interval, input.outputsize, adjustment, input.startDate, input.endDate])
    const cached = this.historyCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const params: Record<string, string> = { ...twelveInstrumentParams(input.symbol), interval: input.interval, outputsize: String(input.outputsize), order: 'DESC', adjust: adjustment }
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
      if (retryable && attempt < 2 && await retryShortly(response, 200 * (attempt + 1))) continue
      throw twelveError(response.status, code)
    }
    if (!body || typeof body !== 'object') throw new MarketDataError('The market-data provider returned an invalid response.', 'INVALID_PROVIDER_RESPONSE', 502)
    const meta = normalizeProviderMetadata((body as { meta?: Record<string, unknown> }).meta)
    assertTwelveListing(input.symbol, meta)
    const result = { values: normalizeHistory(body, input.interval), meta, source: this.id, fetchedAt: new Date().toISOString(), interval: input.interval, adjustment }
    storeCached(this.historyCache, cacheKey, result, input.interval === '5min' && !input.endDate ? 60_000 : 300_000)
    return result
  }
}

type IndianInstrument = Instrument & { exchange: 'NSE' | 'BSE'; instrument_key: string }
const dayMs = 86_400_000
const indiaDate = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
const shiftDate = (date: string, days: number) => new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10)
const candleIntervals: Record<MarketInterval, [unit: string, interval: number, window: number, barsPerSession: number]> = {
  '1min': ['minutes', 1, 28, 375], '5min': ['minutes', 5, 28, 75], '15min': ['minutes', 15, 28, 25],
  '30min': ['minutes', 30, 89, 12], '45min': ['minutes', 45, 89, 8], '1h': ['hours', 1, 89, 6], '2h': ['hours', 2, 89, 3], '4h': ['hours', 4, 89, 1],
  '1day': ['days', 1, 3650, 1], '1week': ['weeks', 1, 36500, 1 / 5], '1month': ['months', 1, 36500, 1 / 21],
}
const catalogueUrl = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz'
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class UpstoxAdapter implements MarketDataProvider {
  readonly id = 'upstox'
  private catalogue?: Cached<IndianInstrument[]>
  private loadingCatalogue?: Promise<IndianInstrument[]>
  private historyCache = new Map<string, Cached<Promise<ProviderHistory>>>()
  private quoteCache = new Map<string, Cached<Promise<MarketQuote>>>()
  constructor(private readonly token = process.env.UPSTOX_ANALYTICS_TOKEN?.trim(), private readonly fetcher: typeof fetch = fetch) {}
  get configured() { return Boolean(this.token) }

  private requireToken() {
    if (!this.token) throw new MarketDataError('Upstox is not configured. Add UPSTOX_ANALYTICS_TOKEN to the server environment to load NSE and BSE prices.', 'NOT_CONFIGURED', 503)
    return this.token
  }

  private async request<T>(path: string): Promise<T> {
    const token = this.requireToken()
    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await this.fetcher(`https://api.upstox.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(4500) })
      } catch (error) {
        if (attempt === 0) { await sleep(200); continue }
        throw classifyProviderFailure(error)
      }
      if ((response.status >= 500 || response.status === 429) && attempt === 0 && await retryShortly(response, 350)) continue
      if (response.status === 429) throw new MarketDataError('Upstox is rate limited. Wait a moment before retrying.', 'RATE_LIMITED', 429)
      if ([401, 403].includes(response.status)) throw new MarketDataError('Upstox denied access. Check that the Analytics Token is valid and has not expired.', 'PROVIDER_ACCESS_DENIED', 403)
      if (response.status >= 500) throw new MarketDataError('Upstox is temporarily unavailable. Try again later.', 'PROVIDER_ERROR', 502)
      const body = await response.json().catch(() => null) as { status?: string; data?: T; errors?: { errorCode?: string }[] } | null
      if (!response.ok || body?.status !== 'success' || !body.data) {
        const code = body?.errors?.[0]?.errorCode
        if (code === 'UDAPI1148' || code === 'UDAPI1015') throw new MarketDataError('Upstox rejected the historical date range. Check the dates or choose a shorter period.', 'INVALID_DATE_RANGE', 400)
        if (response.status === 404 || code === 'UDAPI100011') throw new MarketDataError('Upstox has no data for this instrument and request.', 'PROVIDER_NO_DATA', 404)
        throw new MarketDataError('Upstox did not return a usable market-data response.', 'PROVIDER_ERROR', 502)
      }
      return body.data
    }
  }

  private async instruments(): Promise<IndianInstrument[]> {
    if (this.catalogue && this.catalogue.expiresAt > Date.now()) return this.catalogue.value
    if (this.loadingCatalogue) return this.loadingCatalogue
    this.loadingCatalogue = (async () => {
      try {
        const response = await this.fetcher(catalogueUrl, { cache: 'no-store', signal: AbortSignal.timeout(7000) })
        if (!response.ok) throw new Error('Catalogue unavailable')
        const buffer = Buffer.from(await response.arrayBuffer())
        const decoded = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer, { maxOutputLength: 128 * 1024 * 1024 }) : buffer
        const rows = JSON.parse(decoded.toString('utf8')) as Record<string, unknown>[]
        const instruments: IndianInstrument[] = rows.flatMap(row => {
          const { exchange, segment, instrument_key, trading_symbol, name, instrument_type, isin } = row
          if (exchange !== 'NSE' && exchange !== 'BSE' || typeof instrument_key !== 'string' || typeof trading_symbol !== 'string' || !instrument_key.startsWith(`${segment}|`)) return []
          const index = segment === `${exchange}_INDEX`
          if (!index && (segment !== `${exchange}_EQ` || typeof isin !== 'string' || !/^IN[EF]/.test(isin))) return []
          return [{ symbol: trading_symbol.toUpperCase(), exchange, instrument_key, instrument_name: typeof name === 'string' ? name : trading_symbol, instrument_type: index ? 'Index' : typeof isin === 'string' && isin.startsWith('INF') ? 'Fund / ETF' : text(instrument_type), country: 'India', currency: 'INR', source: this.id }]
        })
        if (!instruments.length) throw new Error('No catalogue entries')
        this.catalogue = { value: instruments, expiresAt: Date.now() + 6 * 3_600_000 }
        return instruments
      } catch {
        if (this.catalogue && this.catalogue.expiresAt + 24 * 3_600_000 > Date.now()) return this.catalogue.value
        throw new MarketDataError('The official Upstox instrument catalogue could not be loaded. Try again shortly.', 'CATALOGUE_UNAVAILABLE', 502)
      } finally { this.loadingCatalogue = undefined }
    })()
    return this.loadingCatalogue
  }

  async search(query: string) {
    const { symbol, exchange } = symbolParts(query)
    const venue = exchange?.replace(/^@/, '').replace(/^XNSE$/, 'NSE').replace(/^XBOM$/, 'BSE')
    return (await this.instruments()).flatMap(item => {
      if (venue && item.exchange !== venue) return []
      const name = item.instrument_name.toUpperCase()
      const rank = item.symbol === symbol || name === symbol ? 0 : item.symbol.startsWith(symbol) ? 1 : name.startsWith(symbol) ? 2 : name.includes(symbol) || item.symbol.includes(symbol) ? 3 : -1
      return rank < 0 ? [] : [{ item, rank }]
    }).sort((a, b) => a.rank - b.rank || a.item.symbol.length - b.item.symbol.length || b.item.exchange.localeCompare(a.item.exchange)).slice(0, 12).map(({ item }) => item)
  }

  private async resolve(id: string) {
    const { symbol, exchange } = symbolParts(id)
    const venue = exchange?.replace(/^@/, '').replace(/^XNSE$/, 'NSE').replace(/^XBOM$/, 'BSE')
    const match = (await this.instruments()).find(row => row.exchange === venue && row.symbol === (venue === 'NSE' && (symbol === 'NIFTY 50' || symbol === 'NIFTY50') ? 'NIFTY' : symbol))
    if (!match) throw new MarketDataError('No matching Upstox instrument was found. Select an NSE or BSE listing from search.', 'INSTRUMENT_NOT_FOUND', 404)
    return match
  }

  quote(symbol: string): Promise<MarketQuote> {
    const id = normalizeSymbol(symbol), cached = this.quoteCache.get(id)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const value = this.fetchQuote(id).catch(error => { this.quoteCache.delete(id); throw error })
    storeCached(this.quoteCache, id, value, 30_000)
    return value
  }

  private async fetchQuote(id: string): Promise<MarketQuote> {
    this.requireToken()
    const instrument = await this.resolve(id)
    const data = await this.request<Record<string, { instrument_token?: string; last_price?: number; net_change?: number; timestamp?: string; volume?: number; ohlc?: Record<string, number> }>>(`/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrument.instrument_key)}`)
    const quote = Object.values(data).find(item => item.instrument_token === instrument.instrument_key)
    if (!quote || typeof quote.last_price !== 'number' || !Number.isFinite(quote.last_price) || quote.last_price <= 0) throw new MarketDataError('Upstox has not supplied a quote for this instrument.', 'PROVIDER_NO_DATA', 404)
    const previous = typeof quote.net_change === 'number' ? quote.last_price - quote.net_change : 0
    return { symbol: instrument.symbol, exchange: instrument.exchange, currency: instrument.currency, instrument_key: instrument.instrument_key, source: this.id, close: text(quote.last_price), change: text(quote.net_change), percent_change: previous > 0 ? text(100 * quote.net_change! / previous) : undefined, datetime: quote.timestamp, open: text(quote.ohlc?.open), high: text(quote.ohlc?.high), low: text(quote.ohlc?.low), volume: text(quote.volume) }
  }

  history(input: HistoryRequest): Promise<ProviderHistory> {
    const key = JSON.stringify([normalizeSymbol(input.symbol), input.interval, input.outputsize, input.adjustment ?? 'none', input.startDate, input.endDate])
    const cached = this.historyCache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const value = this.fetchHistory(input).catch(error => { this.historyCache.delete(key); throw error })
    storeCached(this.historyCache, key, value, 300_000)
    return value
  }

  private async fetchHistory(input: HistoryRequest): Promise<ProviderHistory> {
    this.requireToken()
    if (input.adjustment && input.adjustment !== 'none') throw new MarketDataError('The Upstox candle API does not offer a price-adjustment setting. Select provider-reported prices.', 'UNSUPPORTED_ADJUSTMENT', 400)
    if (!Number.isInteger(input.outputsize) || input.outputsize < 1 || input.outputsize > MAX_OUTPUTSIZE) throw new MarketDataError(`History size must be between 1 and ${MAX_OUTPUTSIZE}.`, 'INVALID_OUTPUTSIZE', 400)
    const instrument = await this.resolve(input.symbol)
    const [unit, interval, window, barsPerSession] = candleIntervals[input.interval]
    const intraday = unit === 'minutes' || unit === 'hours'
    const earliest = intraday ? '2022-01-01' : '2000-01-01'
    const today = indiaDate()
    const end = input.endDate && input.endDate < today ? input.endDate : today
    const inferredStart = shiftDate(end, -Math.ceil(input.outputsize / barsPerSession * 1.75 + 14))
    const start = [input.startDate ?? inferredStart, earliest].sort()[1]
    const windows: [string, string][] = []
    for (let to = end; to >= start;) {
      const from = [start, shiftDate(to, -(window - 1))].sort()[1]
      windows.push([from, to])
      to = shiftDate(from, -1)
      if (windows.length > 8) throw new MarketDataError('This date range is too long for the selected Upstox interval. Choose a wider interval or shorter dates.', 'INVALID_DATE_RANGE', 400)
    }
    const batches = await Promise.all(windows.map(async ([from, to]) => {
      const data = await this.request<{ candles?: unknown[] }>(`/v3/historical-candle/${encodeURIComponent(instrument.instrument_key)}/${unit}/${interval}/${to}/${from}`)
      if (!Array.isArray(data.candles)) throw new MarketDataError('Upstox did not return a valid candle series.', 'INVALID_PROVIDER_RESPONSE', 502)
      return data.candles.flatMap(candle => {
        if (!Array.isArray(candle) || typeof candle[0] !== 'string') return []
        const [stamp, open, high, low, close, volume] = candle
        const localDate = stamp.slice(0, 10)
        return localDate >= start && localDate <= end ? [{ datetime: intraday ? stamp : localDate, open, high, low, close, volume }] : []
      })
    }))
    const values = normalizeHistory({ values: batches.flat() }, input.interval).slice(-input.outputsize)
    return { values, meta: { ...instrument, qualified_symbol: instrumentSymbol(instrument), exchange_timezone: 'Asia/Kolkata' }, source: this.id, fetchedAt: new Date().toISOString(), interval: input.interval, adjustment: 'none' }
  }
}

export function createMarketDataRouter(twelve: MarketDataProvider, upstox: MarketDataProvider) {
  const route = (symbol: string) => providerForSymbol(symbol) === 'upstox' ? upstox : twelve
  const health = new Map<ProviderId, Cached<Promise<ProviderConnection>>>()
  return {
    history: (input: HistoryRequest) => route(input.symbol).history(input),
    quote: (symbol: string) => route(symbol).quote(symbol),
    async search(query: string) {
      const { exchange } = symbolParts(query)
      const providers = exchange ? [route(query)] : [upstox, twelve]
      const results = await Promise.allSettled(providers.map(provider => provider.search(exchange && provider.id === 'twelvedata' ? symbolParts(query).symbol : query)))
      const warnings: string[] = []
      const data: Instrument[] = []
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') warnings.push(classifyProviderFailure(result.reason).message)
        else data.push(...result.value.slice(0, providers.length === 1 ? 15 : 8))
      }
      if (results.every(result => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
      data.sort((a, b) => Number(b.symbol.toUpperCase() === symbolParts(query).symbol) - Number(a.symbol.toUpperCase() === symbolParts(query).symbol))
      const scoped = exchange && route(query).id === 'twelvedata' ? data.filter(item => [item.exchange, item.mic_code].some(value => value?.toUpperCase() === exchange.replace(/^@/, ''))) : data
      return { data: [...new Map(scoped.map(item => [instrumentSymbol(item), item])).values()], warnings }
    },
    async status(probe = false): Promise<ProviderConnection[]> {
      return Promise.all([twelve, upstox].map(async provider => {
        const basic = { id: provider.id, configured: provider.configured }
        if (!provider.configured) return { ...basic, status: 'not_configured' }
        if (!probe) return { ...basic, status: 'configured' }
        const cached = health.get(provider.id)
        if (cached && cached.expiresAt > Date.now()) return cached.value
        const value = (async (): Promise<ProviderConnection> => {
          try {
            await provider.quote(provider.id === 'upstox' ? 'RELIANCE:NSE' : 'AAPL')
            return { ...basic, status: 'connected', checkedAt: new Date().toISOString() }
          } catch (error) {
            const failure = classifyProviderFailure(error)
            return { ...basic, status: failure.httpStatus === 429 ? 'rate_limited' : 'error', checkedAt: new Date().toISOString(), message: failure.message }
          }
        })()
        health.set(provider.id, { value, expiresAt: Date.now() + 300_000 })
        return value
      }))
    },
  }
}

export const marketDataProvider = createMarketDataRouter(new TwelveDataAdapter(), new UpstoxAdapter())
export const MAX_HISTORY_OBSERVATIONS = MAX_OUTPUTSIZE
