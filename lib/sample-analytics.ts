import { annualizedVolatility, correlation, maxDrawdown, periodReturn, sharpeRatio, type PricePoint } from './analytics'
import { providerForSymbol, symbolParts } from './market-instruments'
import { alignDailyReturns } from './research-methods'
import { allocationError, sampleAdjustment, SAMPLE_MIN_RETURNS, SAMPLE_RETURN_LIMIT, type Allocation, type SampleCurrency } from './sample-portfolios'

export type SampleHistory = {
  values: { datetime: string; close: string }[]
  source: string
  interval: string
  adjustment: string
  meta?: Record<string, unknown>
  lastSyncedAt?: string
  quality?: { stale?: boolean; abnormalMoves?: number }
}
export type SampleCoverage = { symbol: string; count: number; first?: string; last?: string; error?: string; stale?: boolean; unusual?: boolean }
export type SampleSeries = { coverage: SampleCoverage; points: PricePoint[]; syncedAt?: string }

const marketClocks = Object.fromEntries(Object.entries({ USD: 'America/New_York', INR: 'Asia/Kolkata' }).map(([currency, timeZone]) => [currency, new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })]))

export function readSampleHistory(symbol: string, currency: SampleCurrency, history: SampleHistory, now = new Date(), allowPlainListing = false): SampleSeries {
  const listing = symbolParts(symbol)
  const expectedProvider = providerForSymbol(symbol)
  const meta = history.meta
  const matchesListing = meta?.symbol === listing.symbol && (expectedProvider === 'upstox'
    ? meta?.exchange === listing.exchange || (allowPlainListing && ({ XNSE: 'NSE', '@XNSE': 'NSE', XBOM: 'BSE', '@XBOM': 'BSE' } as Record<string, string>)[listing.exchange ?? ''] === meta?.exchange && typeof meta?.exchange === 'string')
    : listing.exchange?.startsWith('@') ? meta?.mic_code === listing.exchange.slice(1)
      : allowPlainListing && typeof meta?.exchange === 'string' && (!listing.exchange || meta.exchange.toUpperCase() === listing.exchange))
  if (history.source !== expectedProvider || history.interval !== '1day' || history.adjustment !== sampleAdjustment(symbol) || meta?.currency !== currency || !matchesListing) {
    return unavailableSampleHistory(symbol, 'The provider did not verify this listing, currency, or history type.')
  }
  const clock = Object.fromEntries(marketClocks[currency].formatToParts(now).map(({ type, value }) => [type, value]))
  const today = `${clock.year}-${clock.month}-${clock.day}`
  const points = history.values.map(({ datetime, close }) => ({ datetime, close: Number(close) })).filter(point => {
    const date = new Date(`${point.datetime}T00:00:00Z`)
    const completed = point.datetime < today || point.datetime === today && Number(clock.hour) >= (currency === 'USD' ? 17 : 16)
    return completed && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === point.datetime && Number.isFinite(point.close) && point.close > 0
  }).sort((a, b) => a.datetime.localeCompare(b.datetime))
  return { points, syncedAt: history.lastSyncedAt, coverage: { symbol, count: points.length, first: points[0]?.datetime, last: points.at(-1)?.datetime, stale: history.quality?.stale, unusual: Boolean(history.quality?.abnormalMoves), error: points.length ? undefined : 'No valid daily closes were returned.' } }
}

export function unavailableSampleHistory(symbol: string, error: string): SampleSeries {
  return { coverage: { symbol, count: 0, error }, points: [] }
}

export function sampleAnalytics(allocations: Allocation[], currency: SampleCurrency, data: SampleSeries[], capital: number) {
  if (allocationError(currency, allocations) || !Number.isFinite(capital) || capital <= 0) return null
  const sources = allocations.map(({ symbol }) => data.find(entry => entry.coverage.symbol === symbol))
  if (sources.some(source => !source?.points.length)) return null
  const prices = sources.map(source => new Map(source!.points.map(point => [point.datetime, point.close])))
  const valuationDate = [...prices[0].keys()].sort().findLast(date => prices.every(index => index.has(date)))
  if (!valuationDate) return null
  const positions = allocations.map(({ symbol, weightBps }, index) => {
    const close = prices[index].get(valuationDate)!
    const value = capital * weightBps / 10_000
    return { symbol, close, shares: value / close, value }
  })
  const { rows, dropped } = alignDailyReturns(sources.map(source => source!.points.map(({ datetime, close }) => ({ date: datetime, close }))))
  const daily = rows.filter(row => Date.parse(row.date) - Date.parse(row.from) <= 7 * 86_400_000).slice(-SAMPLE_RETURN_LIMIT)
  const returns = daily.map(row => row.values.reduce((sum, value, index) => sum + value * allocations[index].weightBps / 10_000, 0))
  let growth = 1
  const series = daily.length ? [{ datetime: daily[0].from, close: 100 }, ...daily.map((row, index) => ({ datetime: row.date, close: (growth *= 1 + returns[index]) * 100 }))] : []
  const complete = returns.length >= SAMPLE_MIN_RETURNS && series.every(point => Number.isFinite(point.close) && point.close > 0)
  const columns = allocations.map((_, index) => daily.map(row => row.values[index]))
  return {
    positions, valuationDate, observations: daily.length, skipped: dropped + rows.filter(row => Date.parse(row.date) - Date.parse(row.from) > 7 * 86_400_000).length,
    series: complete ? series : [], returns: complete ? returns : [],
    correlation: complete ? columns.map(left => columns.map(right => correlation(left, right))) : [],
    annualizedRisk: complete ? annualizedVolatility(returns) : null,
    sharpe: complete ? sharpeRatio(returns) : null,
    drawdown: complete ? maxDrawdown(series) : null,
    totalReturn: complete ? periodReturn(series) : null,
  }
}

export type SampleAnalytics = NonNullable<ReturnType<typeof sampleAnalytics>>

export function basketStressPnl(capital: number, allocations: Allocation[], shocks: Record<string, number>) {
  return allocations.reduce((sum, asset) => sum + capital * asset.weightBps / 10_000 * (shocks[asset.symbol] ?? 0) / 100, 0)
}
