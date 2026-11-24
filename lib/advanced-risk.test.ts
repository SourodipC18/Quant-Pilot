import { describe, expect, it } from 'vitest'
import { alignedProxy, fullDrawdown, historicalValues, riskStatistics, rollingDrawdown, rollingFactors, rollingRisk, trackingStatistics, worstByWindow } from './advanced-risk'
import type { RiskSeries } from './portfolio-risk-lab'
import { portfolioHoldingsFor, PAPER_PORTFOLIO } from './portfolio-adapter'
import { readSampleHistory, type SampleHistory } from './sample-analytics'
import { ROLLING_PROXIES } from './risk-proxies'

const weekdays = Array.from({ length: 620 }, (_, i) => new Date(Date.UTC(2023, 0, i + 2))).filter(day => ![0, 6].includes(day.getUTCDay())).map(day => day.toISOString().slice(0, 10))
const day = (i: number) => weekdays[i]
const prices = (symbol: string, closes: number[]): RiskSeries => ({ symbol, points: closes.map((close, i) => ({ date: day(i), close })) })
const returnsSeries = (symbol: string, changes: number[]) => {
  let close = 100
  return prices(symbol, [close, ...changes.map(change => (close *= 1 + change))])
}
const oneShare = { kind: 'shares', shares: [1], cash: 0 } as const
const stockValues = (series: RiskSeries, days = 1000) => historicalValues([series], days, { ...oneShare, shares: [1] })

function verifiedFixture(currency: 'USD' | 'INR', symbol: string, exchange: string, changes: number[]) {
  const raw = returnsSeries(symbol, changes)
  const history: SampleHistory = {
    values: raw.points.map(({ date, close }) => ({ datetime: date, close: String(close) })),
    source: currency === 'USD' ? 'twelvedata' : 'upstox', interval: '1day', adjustment: currency === 'USD' ? 'splits' : 'none',
    meta: { currency, exchange, symbol: symbol.split(':')[0] },
  }
  return { symbol, points: readSampleHistory(symbol, currency, history, new Date('2026-01-01T00:00:00Z'), true).points.map(({ datetime, close }) => ({ date: datetime, close })) }
}

describe('advanced historical risk', () => {
  it('revalues a USD paper portfolio with fixed shares and idle cash, and excludes cash for a saved portfolio', () => {
    const assets = [prices('AAPL', [100, 120, 100]), prices('MSFT', [50, 50, 70])]
    const paper = { accountId: 'paper', cash: 100, equity: 540, positions: [{ symbol: 'AAPL', shares: 3, averageCost: 100 }, { symbol: 'MSFT', shares: 2, averageCost: 50 }] }
    const shares = portfolioHoldingsFor(PAPER_PORTFOLIO, [], paper).map(holding => Number(holding.shares))
    const path = historicalValues(assets, 90, { kind: 'shares', shares, cash: paper.cash })
    expect(path.map(item => item.value)).toEqual([560, 540])
    expect(path[0].change).toBeCloseTo(0.12)
    expect(path[1].change).toBeCloseTo(540 / 560 - 1)
    expect(historicalValues(assets, 90, { kind: 'shares', shares, cash: 0 })[0].change).toBeCloseTo(0.15)
    expect(historicalValues(assets, 90, { kind: 'shares', shares, cash: -1 })).toEqual([])
  })

  it('preserves INR sample target weights and does not apply future marks', () => {
    const assets = [verifiedFixture('INR', 'RELIANCE:NSE', 'NSE', [0.1, -0.1]), verifiedFixture('INR', 'TCS:NSE', 'NSE', [0.2, 0.05])]
    const sample = { kind: 'targets' as const, weights: [0.7, 0.3], capital: 100_000 }
    const rows = historicalValues(assets, 90, sample)
    expect(rows[0].value).toBeCloseTo(113_000)
    expect(rows[1].value).toBeCloseTo(113_000 * 0.945)
    const shortened = assets.map(item => ({ ...item, points: item.points.slice(0, 2) }))
    expect(historicalValues(shortened, 90, sample)).toEqual([rows[0]])
    expect(historicalValues(assets, 90, { ...sample, weights: [0.5, 0.3] })).toEqual([])
  })

  it('computes annualized risk and one-session tail losses using observed intervals', () => {
    const changes = [...Array(5).fill(-0.05), ...Array(95).fill(0.01)] as number[]
    const result = riskStatistics(changes)
    const average = 0.007, deviation = Math.sqrt((5 * (-0.05 - average) ** 2 + 95 * (0.01 - average) ** 2) / 99)
    expect(result.volatility).toBeCloseTo(deviation * Math.sqrt(252))
    expect(result.sharpe).toBeCloseTo(average * Math.sqrt(252) / deviation)
    expect(result.sortino).toBeCloseTo(average * Math.sqrt(252) / Math.sqrt(5 * 0.05 ** 2 / 100))
    expect(result.var95).toBe(0)
    expect(result.cvar95).toBeCloseTo(0.05)
    expect(riskStatistics(changes.slice(1)).var95).toBeNull()
    expect(riskStatistics(Array(20).fill(0.01))).toMatchObject({ sharpe: null, sortino: null })
    const rows = stockValues(returnsSeries('AAPL', changes))
    expect(rollingRisk(rows, 'cvar95', [20, 100], []).at(-1)?.[0]).toBeNull()
    expect(rollingRisk(rows, 'cvar95', [100], []).at(-1)?.[0]?.value).toBeCloseTo(0.05)
    expect(rollingRisk(rows, 'volatility', [20], [])[19]?.[0]).toMatchObject({ observations: 20, from: day(0) })
  })

  it('measures rolling and full-period drawdown from prices and records recovery without crossing gaps', () => {
    const closes = [100, 125, 110, 100, 75, 130, ...Array(20).fill(140)]
    const rows = stockValues(prices('AAPL', closes))
    const result = fullDrawdown(rows)
    expect(result.worst).toEqual({ value: -0.4, peak: day(1), trough: day(4), peakValue: 125, troughValue: 75, recovery: day(5), recoverySessions: 1 })
    const rolling = rollingDrawdown(rows, [2, 4])
    expect(rolling[3][0]?.value).toBeCloseTo(75 / 110 - 1)
    expect(rolling[3][1]?.value).toBeCloseTo(-0.4)
    expect(worstByWindow(rolling, 2)).toEqual([3, 3])
    const broken = rows.map((row, i) => ({ ...row, segment: i < 5 ? 0 : 1 }))
    expect(rollingDrawdown(broken, [4])[5][0]).toBeNull()
    expect(fullDrawdown(broken).points).toContainEqual({ date: day(5), value: null })
    expect(fullDrawdown(broken).worst).toBeNull()
  })

  it('aligns exact benchmark intervals and skips estimates spanning missing observations', () => {
    const changes = Array.from({ length: 66 }, (_, i) => Math.sin(i) / 100)
    const target = stockValues(verifiedFixture('USD', 'AAPL:NASDAQ', 'NASDAQ', changes))
    const benchmark = verifiedFixture('USD', 'SPY', 'NYSE Arca', changes.map(change => change / 2))
    const proxy = alignedProxy(target, benchmark, 365)
    expect(trackingStatistics(target, proxy).value).toBeCloseTo(riskStatistics(changes.map(change => change / 2)).volatility!)
    const broken = { ...benchmark, points: benchmark.points.filter(point => point.date !== day(31)) }
    const brokenProxy = alignedProxy(target, broken, 365)
    expect(brokenProxy.slice(30, 32)).toEqual([null, null])
    expect(rollingRisk(target, 'tracking', [20], brokenProxy)[32][0]).toBeNull()
    expect(trackingStatistics(target, brokenProxy).observations).toBe(64)
  })

  it.each(['USD', 'INR'] as const)('recovers verified %s regional factor betas without future data', currency => {
    const [market, sector] = ROLLING_PROXIES[currency]
    const exchange = currency === 'USD' ? 'NYSE Arca' : 'NSE'
    const changes = Array.from({ length: 112 }, (_, i) => Math.sin(i * 1.3) / 100)
    const marketHistory = verifiedFixture(currency, market.symbol, exchange, changes)
    const sectorHistory = verifiedFixture(currency, sector.symbol, exchange, changes.map(change => 0.7 * change))
    const target = verifiedFixture(currency, currency === 'USD' ? 'MSFT:NASDAQ' : 'INFY:NSE', currency === 'USD' ? 'NASDAQ' : 'NSE', changes.map((change, i) => i < 100 ? 0.0003 + 1.8 * change : -0.02))
    const rows = stockValues(target)
    const predictors = [alignedProxy(rows, marketHistory, 365), alignedProxy(rows, sectorHistory, 365, marketHistory), alignedProxy(rows, undefined, 365), Array<number>(rows.length).fill(0)]
    const result = rollingFactors(rows, predictors, 60)
    expect(result[58]).toEqual([null, null, null, null])
    expect(result[99][0]?.value).toBeCloseTo(1.8)
    expect(result[99][1]?.value).toBeCloseTo(-6)
    expect(result[99][0]).toMatchObject({ rSquared: 1, observations: 60, from: day(40) })
    expect(result[99].slice(2)).toEqual([null, null])
    expect(rollingFactors(rows.slice(0, 100), predictors.map(column => column.slice(0, 100)), 60).at(-1)).toEqual(result[99])
  })
})
