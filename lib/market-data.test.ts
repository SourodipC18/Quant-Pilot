import { describe, expect, it, vi } from 'vitest'
import { classifyProviderFailure, normalizeHistory, normalizeProviderMetadata, normalizeSymbol, TwelveDataAdapter, validateHistory, type MarketBar } from './market-data'

const bar = (datetime: string, open = '100', high = '105', low = '95', close = '102', volume: string | null = '1000'): MarketBar => ({ datetime, open, high, low, close, volume })

describe('market data normalization and validation', () => {
  it('normalizes symbols and intraday timestamps to UTC while retaining raw OHLCV values', () => {
    expect(normalizeSymbol('  aapl ')).toBe('AAPL')
    expect(normalizeHistory({ values: [{ datetime: '2026-04-02 09:30:00', open: 1, high: 2, low: 1, close: 2, volume: 10 }] }, '5min')[0]).toEqual({ datetime: '2026-04-02T09:30:00.000Z', open: '1', high: '2', low: '1', close: '2', volume: '10' })
    expect(normalizeHistory({ values: [{ datetime: '2026-04-02', open: '1', high: '2', low: '1', close: '2' }] }, '1day')[0].datetime).toBe('2026-04-02')
  })

  it('counts missing weekday observations without filling prices', () => {
    const values = [bar('2026-04-06'), bar('2026-04-08')]
    const quality = validateHistory(values, '1day', new Date('2026-04-08T20:00:00Z'))
    expect(quality.missingObservations).toBe(1)
    expect(quality.missingPercentage).toBeCloseTo(1 / 3 * 100)
    expect(values).toHaveLength(2)
  })

  it('does not flag weekend closures as missing trading observations', () => {
    const quality = validateHistory([bar('2026-04-03'), bar('2026-04-06')], '1day', new Date('2026-04-06T20:00:00Z'))
    expect(quality.missingObservations).toBe(0)
  })

  it('normalizes provider symbol, exchange, and currency identifiers', () => {
    expect(normalizeProviderMetadata({ symbol: ' aapl ', exchange: 'nasdaq', currency: 'usd' })).toEqual({ symbol: 'AAPL', exchange: 'NASDAQ', currency: 'USD' })
  })

  it('detects duplicate timestamp records', () => {
    expect(validateHistory([bar('2026-04-06'), bar('2026-04-06')], '1day').duplicates).toBe(1)
  })

  it('flags invalid OHLC, abnormal moves, and missing volume', () => {
    const result = validateHistory([bar('2026-04-06', '100', '90', '95', '102', null), bar('2026-04-07', '125', '130', '120', '125', '5')], '1day')
    expect(result.invalidOhlc).toBe(1)
    expect(result.abnormalMoves).toBe(1)
    expect(result.missingVolume).toBe(1)
  })

  it('sends an explicit adjusted-price policy through the adapter', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => new Response(JSON.stringify({ meta: { symbol: 'AAPL' }, values: [{ datetime: '2026-04-06', open: '100', high: '102', low: '99', close: '101', volume: '20' }] }), { status: 200 }))
    const adapter = new TwelveDataAdapter('test-key', fetcher as unknown as typeof fetch)
    const result = await adapter.history({ symbol: 'aapl', interval: '1day', outputsize: 100, adjustment: 'all' })
    expect(result.adjustment).toBe('all')
    expect(result.values[0].close).toBe('101')
    expect(String(fetcher.mock.calls[0][0])).toContain('adjust=all')
  })

  it('retries provider rate limits and returns the next successful response', async () => {
    const responses = [new Response(JSON.stringify({ status: 'error', code: 429, message: 'Rate limited' }), { status: 429 }), new Response(JSON.stringify({ values: [{ datetime: '2026-04-06', open: '1', high: '2', low: '1', close: '2', volume: '10' }] }), { status: 200 })]
    const fetcher = vi.fn(async (_input: URL | RequestInfo) => responses.shift()!)
    const adapter = new TwelveDataAdapter('test-key', fetcher as unknown as typeof fetch)
    await expect(adapter.history({ symbol: 'RETRY_TEST', interval: '1day', outputsize: 10, adjustment: 'splits' })).resolves.toMatchObject({ values: [{ close: '2' }] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('classifies timeout and provider failures without hiding their error class', () => {
    expect(classifyProviderFailure(Object.assign(new Error('timed out'), { name: 'TimeoutError' })).code).toBe('TIMEOUT')
    expect(classifyProviderFailure(new Error('offline')).code).toBe('NETWORK_ERROR')
  })
})
