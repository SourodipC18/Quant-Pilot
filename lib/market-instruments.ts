export type ProviderId = 'twelvedata' | 'upstox'
export type Instrument = { symbol: string; instrument_name: string; exchange?: string; mic_code?: string; country?: string; currency?: string; instrument_type?: string; instrument_key?: string; source?: ProviderId }
export type ProviderConnection = { id: ProviderId; configured: boolean; status: 'configured' | 'connected' | 'not_configured' | 'error' | 'rate_limited'; checkedAt?: string; message?: string }
export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._/ &-]{0,39}(?::@?[A-Z0-9][A-Z0-9._ -]{0,23})?$/i
export const INDIA_BENCHMARKS = [{ symbol: 'NIFTY:NSE', label: 'Nifty 50' }, { symbol: 'SENSEX:BSE', label: 'Sensex' }]
export const PROVIDER_LABELS: Record<ProviderId, string> = { twelvedata: 'Twelve Data', upstox: 'Upstox' }

export function symbolParts(value: string) {
  const [symbol, exchange] = value.trim().toUpperCase().split(':').map(part => part.trim())
  return { symbol, exchange }
}

export function isIndianExchange(exchange?: string) {
  return ['NSE', 'BSE', 'XNSE', 'XBOM'].includes(exchange?.trim().toUpperCase().replace(/^@/, '') ?? '')
}

export function providerForSymbol(value: string): ProviderId {
  return isIndianExchange(symbolParts(value).exchange) ? 'upstox' : 'twelvedata'
}

export function instrumentSymbol(instrument: Instrument) {
  if (instrument.symbol.includes(':')) return instrument.symbol
  const exchange = isIndianExchange(instrument.exchange) || !instrument.mic_code ? instrument.exchange : `@${instrument.mic_code}`
  return exchange && SYMBOL_PATTERN.test(`${instrument.symbol}:${exchange}`) ? `${instrument.symbol}:${exchange}`.toUpperCase() : instrument.symbol
}

export function verifiedCurrency(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : undefined
}

export function priceLabel(value: number | null | undefined, currency?: string, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { maximumFractionDigits: digits, ...(verifiedCurrency(currency) ? { style: 'currency', currency, minimumFractionDigits: Math.min(2, digits) } : {}) }).format(value)
}
