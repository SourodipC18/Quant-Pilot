import { describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { alignedReturns, dailyReturns, DEFAULT_BACKTEST_CONFIG, monteCarloBootstrap, regressionRiskMetrics, runBacktest } from './analytics'
import { classifyProviderFailure, createMarketDataRouter, normalizeHistory, normalizeProviderMetadata, normalizeSymbol, TwelveDataAdapter, UpstoxAdapter, validateHistory, type MarketBar } from './market-data'
import { instrumentSymbol, priceLabel } from './market-instruments'
import { calculateOptimizationLab } from './optimization-lab'

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
    expect(normalizeProviderMetadata({ currency: 'GBp' })?.currency).toBe('GBX')
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

  it('routes verified NSE, BSE, and international listings without crossing providers', async () => {
    const records = [
      { segment: 'NSE_EQ', exchange: 'NSE', trading_symbol: 'RELIANCE', instrument_key: 'NSE_EQ|INE002A01018', isin: 'INE002A01018', name: 'Reliance Industries' },
      { segment: 'BSE_EQ', exchange: 'BSE', trading_symbol: 'RELIANCE', instrument_key: 'BSE_EQ|INE002A01018', isin: 'INE002A01018', name: 'Reliance Industries' },
      { segment: 'NSE_INDEX', exchange: 'NSE', trading_symbol: 'NIFTY', instrument_key: 'NSE_INDEX|Nifty 50', name: 'Nifty 50' },
      { segment: 'NSE_EQ', exchange: 'NSE', trading_symbol: 'NIFTYBEES', instrument_key: 'NSE_EQ|INF204KB14I2', isin: 'INF204KB14I2', name: 'Nippon India ETF' },
    ]
    const json = (value: unknown, status = 200) => Response.json(value, { status })
    const upstoxFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('assets.upstox.com')) {
        expect(init?.headers).toBeUndefined()
        return new Response(new Uint8Array(gzipSync(JSON.stringify(records))))
      }
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-token')
      if (url.includes('/market-quote/')) return json({ status: 'success', data: { quote: { instrument_token: 'BSE_EQ|INE002A01018', last_price: 102, net_change: 2 } } })
      return json({ status: 'success', data: { candles: [['2026-04-08T00:00:00+05:30', 101, 103, 99, 102, 5], ['2026-04-07T00:00:00+05:30', 99, 102, 98, 101, null]] } })
    })
    const twelveFetch = vi.fn(async (url: URL) => json(url.pathname === '/symbol_search' ? { data: [{ symbol: 'MSFT', exchange: 'NASDAQ', mic_code: 'XNGS', currency: 'USD' }, { symbol: 'RELIANCE', exchange: 'NSE' }] } : { meta: { symbol: 'MSFT', mic_code: 'XNGS', exchange: 'NASDAQ', currency: 'USD' }, values: [{ datetime: '2026-04-08', close: '400' }] }))
    const router = createMarketDataRouter(new TwelveDataAdapter('fixture-key', twelveFetch as unknown as typeof fetch), new UpstoxAdapter('fixture-token', upstoxFetch as unknown as typeof fetch))
    const matches = await router.search('Reliance')
    expect(matches.data.filter(item => item.symbol === 'RELIANCE').map(instrumentSymbol)).toEqual(['RELIANCE:NSE', 'RELIANCE:BSE'])
    expect((await router.search('Nifty:NSE')).data.map(item => item.instrument_key)).toContain('NSE_EQ|INF204KB14I2')
    const input = { symbol: 'NIFTY:NSE', interval: '1day', startDate: '2026-04-07', endDate: '2026-04-08', outputsize: 2 } as const
    const result = await router.history(input)
    expect(result).toMatchObject({ source: 'upstox', adjustment: 'none', meta: { currency: 'INR', exchange: 'NSE' }, values: [{ datetime: '2026-04-07', close: '101', volume: null }, { datetime: '2026-04-08', close: '102', volume: '5' }] })
    expect(await router.history(input)).toBe(result)
    expect(upstoxFetch.mock.calls.filter(([url]) => url.includes('/historical-candle/')).map(([url]) => url)).toEqual(['https://api.upstox.com/v3/historical-candle/NSE_INDEX%7CNifty%2050/days/1/2026-04-08/2026-04-07'])
    await expect(router.history({ ...input, adjustment: 'splits' })).rejects.toMatchObject({ code: 'UNSUPPORTED_ADJUSTMENT' })
    await expect(router.quote('RELIANCE:BSE')).resolves.toMatchObject({ source: 'upstox', exchange: 'BSE', currency: 'INR', close: '102', percent_change: '2' })
    await expect(router.history({ ...input, symbol: 'MSFT:@XNGS' })).resolves.toMatchObject({ source: 'twelvedata', adjustment: 'splits', meta: { currency: 'USD' } })
    const lastRequest = twelveFetch.mock.calls.at(-1)![0]
    expect(lastRequest.searchParams.get('symbol')).toBe('MSFT')
    expect(lastRequest.searchParams.get('mic_code')).toBe('XNGS')
    expect(upstoxFetch.mock.calls.filter(([url]) => url.includes('assets.upstox.com'))).toHaveLength(1)
  })

  it('reports Upstox setup and rate limits without returning fallback prices', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('/exchange/') ? Response.json([{ segment: 'NSE_INDEX', exchange: 'NSE', trading_symbol: 'NIFTY', instrument_key: 'NSE_INDEX|Nifty 50' }]) : Response.json({ token: 'must-not-leak' }, { status: 429, headers: { 'Retry-After': '60' } }))
    const marketFetch = fetcher as unknown as typeof fetch
    await expect(new UpstoxAdapter('', marketFetch).quote('NIFTY:NSE')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    const failure = await new UpstoxAdapter('private', marketFetch).quote('NIFTY:NSE').catch(error => error)
    expect(failure).toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 })
    expect(failure.message).not.toContain('must-not-leak')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('passes normalized candle closes to the existing engines and refuses cross-currency allocation', () => {
    const dates = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)).filter(date => ![0, 6].includes(new Date(date).getUTCDay()))
    const instruments = [0.11, 0.19].map(frequency => normalizeHistory({ values: dates.map((datetime, i) => ({ datetime, close: 100 * Math.exp(i * 0.001 + 0.065 * Math.sin(i * frequency)) })) }, '1day').map(bar => ({ datetime: bar.datetime, close: Number(bar.close) })))
    const [left, right] = instruments
    expect(runBacktest(left, DEFAULT_BACKTEST_CONFIG).equity.at(-1)?.datetime).toBe(left.at(-1)?.datetime)
    expect(monteCarloBootstrap(dailyReturns(left), 100_000, 25, 100).terminalMedian).toBeGreaterThan(0)
    const aligned = alignedReturns(left, right)
    expect(regressionRiskMetrics(aligned.leftReturns, aligned.rightReturns).beta).not.toBeNull()
    const assets = instruments.map((points, i) => ({ symbol: ['RELIANCE:NSE', 'TCS:NSE'][i], currency: 'INR', points }))
    expect(calculateOptimizationLab(assets, '6M', 100)).toHaveProperty('result.currency', 'INR')
    expect(calculateOptimizationLab([assets[0], { ...assets[1], currency: 'USD' }], '6M', 100)).toHaveProperty('error', expect.stringContaining('same verified quote currency'))
    expect(priceLabel(123, 'INR')).toContain('₹')
    expect(priceLabel(123, 'USD')).toContain('$')
    expect(priceLabel(123, 'JPY', 0)).toBe(new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(123))
  })

  it('classifies timeout and provider failures without hiding their error class', () => {
    expect(classifyProviderFailure(Object.assign(new Error('timed out'), { name: 'TimeoutError' })).code).toBe('TIMEOUT')
    expect(classifyProviderFailure(new Error('offline')).code).toBe('NETWORK_ERROR')
  })
})
