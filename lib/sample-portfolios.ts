import { providerForSymbol, symbolParts, SYMBOL_PATTERN, type Instrument } from './market-instruments'

export type SampleCurrency = 'USD' | 'INR'
export type Allocation = { symbol: string; weightBps: number }
export type SampleHolding = Allocation & { name: string; exchange: string; kind: string }
export type SamplePortfolio = { id: string; name: string; theme: string; description: string; currency: SampleCurrency; benchmark: string; holdings: SampleHolding[] }
type CatalogRow = [symbol: string, name: string, exchange: string, weight: number, kind?: string]

const sample = (id: string, name: string, theme: string, description: string, currency: SampleCurrency, rows: CatalogRow[]): SamplePortfolio => ({
  id: `sample:${id}`, name, theme, description, currency, benchmark: currency === 'USD' ? 'SPY' : 'NIFTY:NSE',
  holdings: rows.map(([symbol, name, exchange, weight, kind = 'Equity']) => ({ symbol, name, exchange, kind, weightBps: weight * 100 })),
})

export const SAMPLE_PORTFOLIOS = [
  sample('us-core', 'Diversified US Equity Portfolio', 'US equity · Core', 'Large US companies across technology, financials, healthcare, and consumer staples.', 'USD', [
    ['MSFT:@XNGS', 'Microsoft', 'Nasdaq', 30], ['JPM:@XNYS', 'JPMorgan Chase', 'NYSE', 25], ['JNJ:@XNYS', 'Johnson & Johnson', 'NYSE', 25], ['PG:@XNYS', 'Procter & Gamble', 'NYSE', 20],
  ]),
  sample('tech-growth', 'Technology Growth Portfolio', 'US equity · Growth', 'A concentrated look at software, semiconductors, digital platforms, and cloud infrastructure.', 'USD', [
    ['NVDA:@XNGS', 'NVIDIA', 'Nasdaq', 30], ['MSFT:@XNGS', 'Microsoft', 'Nasdaq', 25], ['GOOGL:@XNGS', 'Alphabet Class A', 'Nasdaq', 25], ['AMZN:@XNGS', 'Amazon', 'Nasdaq', 20],
  ]),
  sample('etf', 'ETF Portfolio', 'Funds · Equity exposure', 'Broad US equity exposure paired with international equities and a small-cap tilt.', 'USD', [
    ['VTI:@ARCX', 'Vanguard Total Stock Market ETF', 'NYSE Arca', 55, 'US equity ETF'], ['VXUS:@XNMS', 'Vanguard Total International Stock ETF', 'Nasdaq', 30, 'International equity ETF'], ['IWM:@ARCX', 'iShares Russell 2000 ETF', 'NYSE Arca', 15, 'US equity ETF'],
  ]),
  sample('multi-asset', 'Multi-Asset Portfolio', 'Funds · Multi-asset', 'An illustrative mix of stocks, investment-grade bonds, and gold through US-listed funds.', 'USD', [
    ['VTI:@ARCX', 'Vanguard Total Stock Market ETF', 'NYSE Arca', 45, 'US equity ETF'], ['VXUS:@XNMS', 'Vanguard Total International Stock ETF', 'Nasdaq', 15, 'International equity ETF'], ['BND:@XNMS', 'Vanguard Total Bond Market ETF', 'Nasdaq', 30, 'Bond ETF'], ['GLD:@ARCX', 'SPDR Gold Shares', 'NYSE Arca', 10, 'Gold trust'],
  ]),
  sample('india-large-cap', 'Indian Large-Cap Portfolio', 'India equity · Large-cap', 'Established NSE listings in energy, banking, and information technology.', 'INR', [
    ['RELIANCE:NSE', 'Reliance Industries', 'NSE', 30], ['HDFCBANK:NSE', 'HDFC Bank', 'NSE', 25], ['TCS:NSE', 'Tata Consultancy Services', 'NSE', 25], ['INFY:NSE', 'Infosys', 'NSE', 20],
  ]),
  sample('india-diversified', 'Indian Diversified Equity Portfolio', 'India equity · Sector mix', 'An NSE sector mix spanning telecom, infrastructure, consumer staples, healthcare, and banking.', 'INR', [
    ['BHARTIARTL:NSE', 'Bharti Airtel', 'NSE', 22], ['LT:NSE', 'Larsen & Toubro', 'NSE', 21], ['HINDUNILVR:NSE', 'Hindustan Unilever', 'NSE', 20], ['SUNPHARMA:NSE', 'Sun Pharmaceutical', 'NSE', 19], ['ICICIBANK:NSE', 'ICICI Bank', 'NSE', 18],
  ]),
] satisfies SamplePortfolio[]

export const SAMPLE_CAPITAL = { USD: 5_000_000, INR: 5_000_000 } satisfies Record<SampleCurrency, number>
export const SAMPLE_MIN_ASSETS = 3
export const SAMPLE_MAX_ASSETS = 8
export const SAMPLE_HISTORY_SIZE = 750
export const SAMPLE_RETURN_LIMIT = 252
export const SAMPLE_MIN_RETURNS = 20

export function allocationError(currency: SampleCurrency, allocations: Allocation[]) {
  if (allocations.length < SAMPLE_MIN_ASSETS || allocations.length > SAMPLE_MAX_ASSETS) return 'Include 3 to 8 instruments.'
  const identities = new Set<string>()
  for (const { symbol, weightBps } of allocations) {
    const { symbol: ticker, exchange } = symbolParts(symbol)
    if (!SYMBOL_PATTERN.test(symbol) || !exchange || (currency === 'USD' ? !/^@[A-Z0-9]{4}$/.test(exchange) : !/^(NSE|BSE)$/.test(exchange))) return 'Choose exchange-qualified instruments from this portfolio’s market.'
    if (identities.has(ticker)) return 'Each ticker can appear only once.'
    identities.add(ticker)
    if (!Number.isInteger(weightBps) || weightBps < 1 || weightBps > 10_000) return 'Every instrument needs a positive allocation with at most two decimal places.'
  }
  return allocations.reduce((sum, holding) => sum + holding.weightBps, 0) === 10_000 ? null : 'Allocations must add up to exactly 100%.'
}

export function eligibleSampleInstrument(instrument: Instrument, currency: SampleCurrency) {
  return instrument.currency === currency && (currency === 'INR'
    ? /^(NSE|BSE)$/.test(instrument.exchange ?? '')
    : /^(XNYS|XNAS|ARCX|BATS|IEXG|XASE|XNGS|XNMS|XNCM)$/.test(instrument.mic_code ?? ''))
}

export const sampleAdjustment = (symbol: string) => providerForSymbol(symbol) === 'upstox' ? 'none' : 'splits'

export function sampleAllocationCsv(portfolio: SamplePortfolio) {
  const escape = (value: string) => `"${(/^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
  return [['symbol', 'instrument_name', 'market', 'exchange', 'currency', 'asset_type', 'target_weight_pct'], ...portfolio.holdings.map(holding => [holding.symbol, holding.name, portfolio.currency === 'USD' ? 'US' : 'India', holding.exchange, portfolio.currency, holding.kind, (holding.weightBps / 100).toFixed(2)])].map(row => row.map(escape).join(',')).join('\r\n')
}
