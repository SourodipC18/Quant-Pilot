import { marketDataProvider, type ProviderHistory } from './market-data'
import { providerForSymbol, symbolParts } from './market-instruments'
import { PaperError, priceNumber } from './paper-trading-math'
import { eligiblePaperType } from './paper-trading-types'

const maxAgeDays = 5
const newYorkClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const barDuration = 5 * 60_000
const nyParts = (date: Date) => Object.fromEntries(newYorkClock.formatToParts(date).map(({ type, value }) => [type, value]))
const sessionDate = (parts: ReturnType<typeof nyParts>) => `${parts.year}-${parts.month}-${parts.day}`
const sessionMinute = (parts: ReturnType<typeof nyParts>) => Number(parts.hour) * 60 + Number(parts.minute)
const isWeekday = (parts: ReturnType<typeof nyParts>) => parts.weekday !== 'Sat' && parts.weekday !== 'Sun'

export type VerifiedClose = { symbol: string; priceMicros: bigint; date: string }

export const markOrder = (date: string) => date.length === 10 ? `${date}T24` : date

export function assertPaperSymbol(symbol: string) {
  if (providerForSymbol(symbol) !== 'twelvedata') throw new PaperError('Only verified USD stocks and ETFs are supported. INR trades and currency conversion are not available.')
}

function verifiedListing(requested: string, history: ProviderHistory) {
  const { symbol, exchange } = symbolParts(requested)
  const { symbol: returned, mic_code: mic, currency, type, exchange: listedExchange, exchange_timezone: zone } = history.meta ?? {}
  if (history.source !== 'twelvedata' || history.adjustment !== 'none' || returned !== symbol || typeof mic !== 'string' || !/^[A-Z0-9]{4}$/.test(mic) || (exchange?.startsWith('@') ? exchange.slice(1) !== mic : exchange != null && exchange !== listedExchange) || currency !== 'USD' || zone !== 'America/New_York' || !eligiblePaperType(type)) {
    throw new PaperError('The provider must verify a US-listed, USD-denominated stock or ETF before it can be traded.')
  }
  return `${symbol}:@${mic}`
}

function verifiedPrice(raw: number) {
  return Number.isFinite(raw) && raw >= 0.000001 && raw <= 10_000_000
}

export function verifiedPaperClose(requested: string, history: ProviderHistory, now = new Date()): VerifiedClose {
  const symbol = verifiedListing(requested, history)
  if (history.interval !== '1day') throw new PaperError('A daily price is required.', 503)
  const parts = nyParts(now)
  const today = sessionDate(parts)
  const latest = history.values.findLast(row => row.datetime < today || row.datetime === today && Number(parts.hour) >= 17)
  if (!latest) throw new PaperError('No completed end-of-day price is available. No simulated fill was made.', 503)
  const day = Date.parse(latest.datetime)
  const raw = Number(latest.close)
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== latest.datetime || Date.parse(today) - day > maxAgeDays * 86_400_000 || !verifiedPrice(raw)) {
    throw new PaperError('The latest completed end-of-day price is invalid or more than five calendar days old.', 503)
  }
  return { symbol, priceMicros: BigInt(Math.round(raw * 1_000_000)), date: latest.datetime }
}

export function verifiedIntradayMark(requested: string, history: ProviderHistory, now = new Date()): VerifiedClose | null {
  const symbol = verifiedListing(requested, history)
  if (history.interval !== '5min') return null
  const session = nyParts(now)
  const today = sessionDate(session)
  const maxLag = sessionMinute(session) < 16 * 60 ? 30 * 60_000 : 60 * 60_000
  const latest = history.values.findLast(row => {
    const start = Date.parse(row.datetime)
    const age = now.getTime() - (start + barDuration)
    if (!Number.isFinite(start) || start % barDuration !== 0 || age < 0 || age > maxLag) return false
    const parts = nyParts(new Date(start))
    const minute = sessionMinute(parts)
    return sessionDate(parts) === today && isWeekday(parts) && minute >= 9 * 60 + 30 && minute < 16 * 60
  })
  if (!latest || !verifiedPrice(Number(latest.close))) return null
  return { symbol, date: new Date(Date.parse(latest.datetime) + barDuration).toISOString(), priceMicros: BigInt(Math.round(Number(latest.close) * 1_000_000)) }
}

export async function getPaperClose(symbol: string) {
  assertPaperSymbol(symbol)
  const now = new Date()
  const parts = nyParts(now)
  const minute = sessionMinute(parts)
  if (isWeekday(parts) && minute >= 9 * 60 + 35 && minute < 17 * 60) {
    const mark = await marketDataProvider.history({ symbol, interval: '5min', outputsize: 4, adjustment: 'none' })
      .then(history => verifiedIntradayMark(symbol, history, now)).catch(() => null)
    if (mark) return mark
  }
  return verifiedPaperClose(symbol, await marketDataProvider.history({ symbol, interval: '1day', outputsize: 3, adjustment: 'none' }), now)
}

export function paperQuote(close: VerifiedClose) {
  return { symbol: close.symbol, price: priceNumber(close.priceMicros), date: close.date, source: 'Twelve Data', freshness: close.date.length === 10 ? 'End-of-day' : '5-minute bar', currency: 'USD' } as const
}
