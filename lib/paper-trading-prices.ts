import { marketDataProvider, type ProviderHistory } from './market-data'
import { providerForSymbol, symbolParts } from './market-instruments'
import { PaperError, priceNumber } from './paper-trading-math'
import { eligiblePaperType } from './paper-trading-types'

const maxAgeDays = 5
const newYorkClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})

export type VerifiedClose = { symbol: string; priceMicros: bigint; date: string }

export function assertPaperSymbol(symbol: string) {
  if (providerForSymbol(symbol) !== 'twelvedata') throw new PaperError('Only verified USD stocks and ETFs are supported. INR trades and currency conversion are not available.')
}

export function verifiedPaperClose(requested: string, history: ProviderHistory, now = new Date()): VerifiedClose {
  const { symbol, exchange } = symbolParts(requested)
  const { symbol: returned, mic_code: mic, currency, type, exchange: listedExchange, exchange_timezone: zone } = history.meta ?? {}
  if (history.source !== 'twelvedata' || history.interval !== '1day' || history.adjustment !== 'none' || returned !== symbol || typeof mic !== 'string' || !/^[A-Z0-9]{4}$/.test(mic) || (exchange?.startsWith('@') ? exchange.slice(1) !== mic : exchange != null && exchange !== listedExchange) || currency !== 'USD' || zone !== 'America/New_York' || !eligiblePaperType(type)) {
    throw new PaperError('The provider must verify a US-listed, USD-denominated stock or ETF before it can be traded.')
  }
  const parts = Object.fromEntries(newYorkClock.formatToParts(now).map(({ type, value }) => [type, value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const latest = history.values.findLast(row => row.datetime < today || row.datetime === today && Number(parts.hour) >= 17)
  if (!latest) throw new PaperError('No completed end-of-day price is available. No simulated fill was made.', 503)
  const day = Date.parse(latest.datetime)
  const raw = Number(latest.close)
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== latest.datetime || Date.parse(today) - day > maxAgeDays * 86_400_000 || !Number.isFinite(raw) || raw < 0.000001 || raw > 10_000_000) {
    throw new PaperError('The latest completed end-of-day price is invalid or more than five calendar days old.', 503)
  }
  return { symbol: `${symbol}:@${mic}`, priceMicros: BigInt(Math.round(raw * 1_000_000)), date: latest.datetime }
}

export async function getPaperClose(symbol: string) {
  assertPaperSymbol(symbol)
  return verifiedPaperClose(symbol, await marketDataProvider.history({ symbol, interval: '1day', outputsize: 3, adjustment: 'none' }))
}

export function paperQuote(close: VerifiedClose) {
  return { symbol: close.symbol, price: priceNumber(close.priceMicros), date: close.date, source: 'Twelve Data', freshness: 'End-of-day', currency: 'USD' } as const
}
