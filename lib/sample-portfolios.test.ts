import { describe, expect, it, vi } from 'vitest'
import { historicalVaR, monteCarloBootstrap } from './analytics'
import { providerForSymbol, symbolParts } from './market-instruments'
import type { ProviderHistory } from './market-data'
import { calculateOptimizationLab } from './optimization-lab'
import { sizePaperBasket } from './paper-basket'
import { marketValue } from './paper-trading-math'
import { runResearch, researchInput } from './research-run'
import { basketStressPnl, readSampleHistory, sampleAnalytics } from './sample-analytics'
import { allocationError, sampleAllocationCsv, SAMPLE_PORTFOLIOS } from './sample-portfolios'

function historyFor(listing: string): ProviderHistory {
  const { symbol, exchange } = symbolParts(listing)
  const source = providerForSymbol(listing)
  const us = source === 'twelvedata'
  const offset = symbol.charCodeAt(0)
  return {
    source, interval: '1day', adjustment: us ? 'splits' : 'none', fetchedAt: '2025-11-02T12:00:00Z',
    meta: { symbol, currency: us ? 'USD' : 'INR', ...(us ? { mic_code: exchange?.slice(1) } : { exchange }) },
    values: Array.from({ length: 100 }, (_, i) => {
      const datetime = new Date(Date.UTC(2025, 5, 2 + i)).toISOString().slice(0, 10)
      const close = (100 + i + Math.sin(i * offset * 0.3) * 5).toFixed(2)
      return { datetime, close, high: close, low: close, open: close, volume: '100' }
    }).filter(row => ![0, 6].includes(new Date(row.datetime).getUTCDay())),
  }
}

const sample = SAMPLE_PORTFOLIOS[0]
const india = SAMPLE_PORTFOLIOS[4]

describe('illustrative portfolio library', () => {
  it('supplies six unique, fully allocated market-specific research baskets', () => {
    expect(new Set(SAMPLE_PORTFOLIOS.map(basket => basket.id)).size).toBe(6)
    for (const basket of SAMPLE_PORTFOLIOS) {
      expect(allocationError(basket.currency, basket.holdings)).toBeNull()
      expect(basket.holdings.every(holding => providerForSymbol(holding.symbol) === (basket.currency === 'INR' ? 'upstox' : 'twelvedata'))).toBe(true)
    }
    expect(allocationError('USD', india.holdings)).toMatch(/market/)
    expect(allocationError('USD', [...sample.holdings.slice(0, 3), { ...sample.holdings[0], symbol: 'MSFT:@XNAS' }])).toMatch(/once/)
    expect(sampleAllocationCsv(sample)).toContain('"MSFT:@XNGS","Microsoft","US","Nasdaq","USD","Equity","30.00"')
  })

  it('uses verified listing closes and never fills in missing or incomplete prices', () => {
    const asset = sample.holdings[0]
    const history = historyFor(asset.symbol)
    const now = new Date(`${history.values.at(-1)!.datetime}T15:00:00Z`)
    expect(readSampleHistory(asset.symbol, 'USD', history, now).coverage.count).toBe(history.values.length - 1)
    expect(readSampleHistory(asset.symbol, 'USD', { ...history, source: 'upstox' }).coverage.count).toBe(0)
    const data = sample.holdings.map(holding => readSampleHistory(holding.symbol, 'USD', historyFor(holding.symbol)))
    expect(sampleAnalytics(sample.holdings, 'USD', data.slice(1), 1000)).toBeNull()
    const metrics = sampleAnalytics(sample.holdings, 'USD', data, 1000)!
    const first = data.map(entry => entry.points[1].close / entry.points[0].close - 1)
    expect(metrics.returns[0]).toBeCloseTo(first.reduce((sum, value, index) => sum + value * sample.holdings[index].weightBps / 10_000, 0))
    expect(metrics.positions.map(position => position.value)).toEqual([300, 250, 250, 200])
    metrics.positions.forEach(position => expect(position.shares * position.close).toBeCloseTo(position.value))
    expect(historicalVaR(metrics.returns)).not.toBeNull()
    expect(metrics.correlation[0][0]).toBeCloseTo(1)
    expect(metrics.annualizedRisk).toBeGreaterThan(0)
    expect(monteCarloBootstrap(metrics.returns, 1000, 20, 100, 42).terminalMedian).toBeGreaterThan(0)
    const gapIndex = 3
    const incomplete = data.map((entry, index) => index ? entry : { ...entry, points: entry.points.filter((_, i) => i !== gapIndex) })
    const aligned = sampleAnalytics(sample.holdings, 'USD', incomplete, 1000)!
    expect(aligned.skipped).toBe(2)
    expect(aligned.observations).toBe(metrics.observations - 2)
    expect(aligned.series[0].close).toBe(100)
  })

  it('plots the sample’s exact target weights and models each instrument shock', () => {
    const assets = sample.holdings.map(({ symbol }) => ({ symbol, currency: 'USD', points: readSampleHistory(symbol, 'USD', historyFor(symbol)).points }))
    const weights = sample.holdings.map(asset => asset.weightBps / 10_000)
    const frontier = calculateOptimizationLab(assets, '6M', 80, undefined, weights)
    expect('result' in frontier && frontier.result.current?.weights).toEqual(weights)
    expect('result' in frontier && frontier.result.frontier.length).toBeGreaterThan(0)
    expect(basketStressPnl(1000, sample.holdings, { [sample.holdings[0].symbol]: -20, [sample.holdings[1].symbol]: 8 })).toBe(-40)
  })

  it('runs weighted Research Studio scenarios using verified Upstox inputs', async () => {
    const provider = vi.fn(async ({ symbol }: { symbol: string }) => historyFor(symbol))
    const input = researchInput.parse({ method: 'scenarios', symbols: india.holdings.map(item => item.symbol), weightsBps: india.holdings.map(item => item.weightBps), lookback: 252, horizon: 20, paths: 100, seed: 42, block: 3 })
    const report = await runResearch(input, provider)
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'RELIANCE:NSE', adjustment: 'none' }))
    expect(report.sources.every(source => source.provider === 'upstox' && source.currency === 'INR')).toBe(true)
    expect(report.tables[0].rows[0]).toEqual(['RELIANCE:NSE', '30.00%'])
    if (input.method === 'scenarios') await expect(runResearch({ ...input, weightsBps: [1000, 1000, 1000, 1000] }, provider)).rejects.toThrow('100%')
  })
})

describe('simulated basket sizing', () => {
  const closes = sample.holdings.map((asset, index) => ({ symbol: asset.symbol, priceMicros: BigInt(20 + 15 * index) * 1_000_000n, date: '2025-04-01' }))
  const fees = { slippageBps: 25, commissionBps: 18 }
  it('sizes fractional shares from verified closes and reserves costs within each budget', () => {
    const orders = sizePaperBasket(sample.holdings, closes, 100_001n, 100_100n, fees)
    expect(orders.total).toBeLessThanOrEqual(100_001n)
    expect(orders.remaining).toBe(100_100n - orders.total)
    expect(orders.commission).toBeGreaterThan(0n)
    expect(orders.slippage).toBeGreaterThan(0n)
    expect(orders.legs[0].estimate.units).toBeLessThan(15_000_000n)
    expect(orders.legs.reduce((sum, leg) => sum + marketValue(leg.estimate.units, leg.close.priceMicros), 0n)).toBe(orders.total - orders.commission - orders.slippage)
  })
  it('rejects insufficient buying power, unavailable closes, duplicates, and impossible lot budgets', () => {
    expect(() => sizePaperBasket(sample.holdings, closes, 10_001n, 10_000n, fees)).toThrow('buying power')
    expect(() => sizePaperBasket(sample.holdings, closes.slice(0, -1), 10_000n, 10_000n, fees)).toThrow('distinct verified USD')
    expect(() => sizePaperBasket(sample.holdings, closes.map(() => closes[0]), 10_000n, 10_000n, fees)).toThrow('distinct verified USD')
    expect(() => sizePaperBasket(sample.holdings, closes, 1n, 10_000n, fees)).toThrow('less than one cent')
  })
})
