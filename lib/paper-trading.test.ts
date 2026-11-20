import { describe, expect, it } from 'vitest'
import { applyFill, estimateOrder, marketValue, STARTING_CASH } from './paper-trading-math'
import { assertPaperSymbol, verifiedPaperClose } from './paper-trading-prices'
import type { ProviderHistory } from './market-data'
import { PAPER_PORTFOLIO, portfolioHoldingsFor } from './portfolio-adapter'

const free = { commissionBps: 0, slippageBps: 0 }
const bar = (datetime: string, close: string) => ({ datetime, close, open: close, high: close, low: close, volume: null })
const history = (values = [bar('2026-11-19', '100.25'), bar('2026-11-20', '120')]): ProviderHistory => ({
  values, fetchedAt: '2026-11-20T16:00:00Z', interval: '1day', adjustment: 'none', source: 'twelvedata',
  meta: { symbol: 'AAPL', mic_code: 'XNGS', exchange: 'NASDAQ', currency: 'USD', exchange_timezone: 'America/New_York', type: 'Common Stock' },
})

describe('paper trading execution', () => {
  it('starts at five million dollars and applies weighted average basis and sale P&L', () => {
    expect(STARTING_CASH).toBe(500_000_000n)
    const first = applyFill(STARTING_CASH, undefined, 'buy', estimateOrder('buy', 'shares', '3', 100_000_000n, free))
    expect(first).toEqual({ cashCents: 499_970_000n, position: { units: 3_000_000n, basisCents: 30_000n }, realizedCents: null })
    const second = applyFill(first.cashCents, first.position, 'buy', estimateOrder('buy', 'shares', '1', 140_000_000n, free))
    expect(second.position.basisCents).toBe(44_000n)
    const sale = applyFill(second.cashCents, second.position, 'sell', estimateOrder('sell', 'shares', '2', 130_000_000n, free))
    expect(sale).toEqual({ cashCents: 499_982_000n, position: { units: 2_000_000n, basisCents: 22_000n }, realizedCents: 4_000n })
    expect(marketValue(sale.position.units, 130_000_000n) - sale.position.basisCents).toBe(4_000n)
    const liquidation = applyFill(sale.cashCents, sale.position, 'sell', estimateOrder('sell', 'shares', '2', 100_000_000n, free))
    expect(liquidation.position).toEqual({ units: 0n, basisCents: 0n })
    expect(liquidation.realizedCents).toBe(-2_000n)
  })

  it('applies adverse slippage and keeps fractional USD buys within the budget including fees', () => {
    const costs = { commissionBps: 50, slippageBps: 25 }
    const buy = estimateOrder('buy', 'dollars', '250.00', 100_000_000n, costs)
    expect(buy.fillMicros).toBe(100_250_000n)
    expect(buy.commissionCents).toBe(124n)
    expect(buy.deltaCents).toBe(-25_000n)
    const opened = applyFill(STARTING_CASH, undefined, 'buy', buy)
    const sell = estimateOrder('sell', 'shares', '1', 100_000_000n, costs)
    expect(sell.fillMicros).toBe(99_750_000n)
    expect(applyFill(opened.cashCents, opened.position, 'sell', sell).realizedCents).toBeLessThan(0n)
  })

  it('rejects invalid precision, zero-dollar fills, overspending, and short sales', () => {
    for (const amount of ['0', '-2', '1e5', 'NaN', '1.0000001']) expect(() => estimateOrder('buy', 'shares', amount, 20_000_000n, free)).toThrow('positive share quantity')
    expect(() => estimateOrder('buy', 'shares', '0.000001', 20_000_000n, free)).toThrow('at least one cent')
    expect(() => applyFill(1n, undefined, 'buy', estimateOrder('buy', 'shares', '1', 20_000_000n, free))).toThrow('exceeds available cash')
    expect(() => applyFill(STARTING_CASH, undefined, 'sell', estimateOrder('sell', 'shares', '1', 20_000_000n, free))).toThrow('Short selling')
  })
})

describe('paper price eligibility', () => {
  it('ignores the current daily candle before the close buffer and canonicalizes the listing', () => {
    const before = verifiedPaperClose('AAPL:NASDAQ', history(), new Date('2026-11-20T16:00:00Z'))
    expect(before).toEqual({ symbol: 'AAPL:@XNGS', priceMicros: 100_250_000n, date: '2026-11-19' })
    expect(verifiedPaperClose('AAPL:@XNGS', history(), new Date('2026-11-20T22:01:00Z')).date).toBe('2026-11-20')
  })

  it('blocks mismatched listings, stale/invalid closes, INR and non-stock instruments', () => {
    const now = new Date('2026-11-20T16:00:00Z')
    expect(() => verifiedPaperClose('AAPL:@XNYS', history(), now)).toThrow('provider must verify')
    expect(() => verifiedPaperClose('AAPL', history([bar('2026-11-10', '100')]), now)).toThrow('five calendar days')
    expect(() => verifiedPaperClose('AAPL', history([bar('2026-11-19', '-100')]), now)).toThrow('invalid')
    expect(() => verifiedPaperClose('AAPL', history([bar('2026-11-21', '100')]), now)).toThrow('No completed')
    for (const meta of [{ currency: 'INR' }, { type: 'Index' }, { mic_code: undefined }]) {
      const payload = history(); payload.meta = { ...payload.meta, ...meta }
      expect(() => verifiedPaperClose('AAPL', payload, now)).toThrow('provider must verify')
    }
    expect(() => assertPaperSymbol('RELIANCE:NSE')).toThrow('INR trades')
  })

  it('maps current paper positions without including idle cash or saved holdings', () => {
    const saved = [{ id: 'one', portfolioId: 'manual', symbol: 'SPY', shares: '2', averageCost: null }]
    const paper = { accountId: 'isolated', cash: 4_999_950, equity: 5_000_000, positions: [{ symbol: 'AAPL:@XNGS', shares: 0.5, averageCost: 100 }] }
    expect(portfolioHoldingsFor(PAPER_PORTFOLIO, saved, paper)).toEqual([{ id: 'paper:AAPL:@XNGS', portfolioId: PAPER_PORTFOLIO.id, symbol: 'AAPL:@XNGS', shares: '0.5', averageCost: '100' }])
    expect(portfolioHoldingsFor({ id: 'manual', name: 'Manual', benchmark: 'SPY' }, saved, paper)).toEqual(saved)
  })
})
