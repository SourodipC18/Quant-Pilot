import { describe, expect, it } from 'vitest'
import { factorExposures, markedAllocation, portfolioRiskMetrics, replayWindow, riskReturns, rollingRiskCorrelation, stressPoint, type RiskSeries } from './portfolio-risk-lab'
import { readSampleHistory, type SampleHistory } from './sample-analytics'

const date = (i: number) => new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10)
const fromReturns = (symbol: string, values: number[]): RiskSeries => {
  let close = 100
  return { symbol, points: [{ date: date(0), close }, ...values.map((value, i) => ({ date: date(i + 1), close: close *= 1 + value }))] }
}
const rows = (values: number[][], secondSegmentStarts = Infinity) => values.map((value, i) => ({ date: date(i + 1), from: date(i), segment: Number(i >= secondSegmentStarts), values: value }))

describe('portfolio risk lab', () => {
  it('marks saved holdings at the latest shared close and includes idle cash for paper weights', () => {
    const series = [fromReturns('A', [0.1, 0.2]), fromReturns('B', [0])] as const
    const marked = markedAllocation([...series], [2, 1], 80)!
    expect(marked.date).toBe(date(1))
    expect(marked.capital).toBeCloseTo(400)
    expect(marked.cashWeight).toBeCloseTo(0.2)
    expect(marked.allocation[0].weight).toBeCloseTo(0.55)
    expect(markedAllocation([...series], [2, 1], -10)).toBeNull()
  })

  it('returns position-level contribution and ending value; floors estimated equity losses', () => {
    const allocation = [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.25 }]
    const a = { key: 'A', label: 'A', exposure: [1, 0] }, b = { key: 'B', label: 'B', exposure: [0, 1] }
    const scenario = stressPoint(10_000, allocation, a, b, -20, 10)
    expect(scenario.endingValue).toBe(9250)
    expect(scenario.worst?.symbol).toBe('A')
    expect(stressPoint(10_000, allocation, a, b, -150, 0).contributions[0]).toMatchObject({ shock: -100, floored: true, pnl: -5000 })
  })

  it('replays observed shocks only with verified common endpoint coverage', () => {
    const series = [fromReturns('A', [-0.1, -0.2, 0.5]), fromReturns('B', [0.2, 0, 0.1])]
    const replay = replayWindow(series, date(0), date(2))!
    expect(replay.start).toBe(date(0))
    expect(replay.end).toBe(date(2))
    expect(replay.shocks[0]).toBeCloseTo(-28)
    expect(replay.shocks[1]).toBeCloseTo(20)
    expect(replayWindow(series, date(0), date(12))).toBeNull()
    expect(replayWindow([series[0], { symbol: 'B', points: [] }], date(0), date(2))).toBeNull()
  })

  it('does not bridge gaps, fill missing closes, or correlate constant returns', () => {
    const values = Array.from({ length: 62 }, (_, i) => 0.001 * (i % 7 - 3))
    const result = rollingRiskCorrelation(rows(values.map(value => [value, -value, 0]), 31), ['A', 'B', 'C'], 30)
    expect(result.values[0]).toEqual([-1, null, null])
    expect(result.values[2]).toEqual([null, null, null])
    expect(result.values.at(-1)).toEqual([-1, null, null])
    expect(result.highest?.label).toBe('A / B')
    const a = fromReturns('A', values), b = fromReturns('B', values)
    b.points = b.points.filter(point => point.date !== date(32))
    const aligned = riskReturns([a, b], 100)
    expect(aligned).toHaveLength(60)
    expect(aligned.find(row => row.date === date(34))?.segment).toBe(2)
  })

  it('omits tail risk without enough returns and reports worst covered drawdown without joining gaps', () => {
    const allocation = [{ symbol: 'A', weight: 0.5 }]
    const samples = Array.from({ length: 100 }, (_, i) => [i < 30 ? -0.02 : 0.04])
    expect(portfolioRiskMetrics(rows(samples.slice(0, 29)), allocation)).toBeNull()
    expect(portfolioRiskMetrics(rows(samples.slice(0, 60), 30), allocation)?.var95).toBeNull()
    const metrics = portfolioRiskMetrics(rows(samples, 30), allocation)!
    expect(metrics.var95).toBeCloseTo(0.01)
    expect(metrics.cvar95).toBeCloseTo(0.01)
    expect(metrics.drawdown).toBeCloseTo(1 - 0.99 ** 30)
    expect(metrics.segmentCount).toBe(30)
  })

  it('uses jointly fitted betas for proxy shocks and rejects singular regressions', () => {
    const v = Array.from({ length: 65 }, (_, i) => Math.sin(i) / 100)
    const w = Array.from({ length: 65 }, (_, i) => Math.cos(i / 3) / 100)
    const asset = fromReturns('A', v.map((x, i) => 1.5 * x - w[i] / 2))
    const result = factorExposures([asset], [fromReturns('P1', v), fromReturns('P2', w)], 90)
    expect(result?.exposures[0][0]).toBeCloseTo(1.5)
    expect(result?.exposures[1][0]).toBeCloseTo(-0.5)
    expect(factorExposures([asset], [fromReturns('P1', v), fromReturns('P2', v)], 90)).toBeNull()
  })

  it('verifies plain saved tickers, qualified exchanges and currencies without loosening sample defaults', () => {
    const point = { datetime: date(0), close: '100' }
    const history: SampleHistory = { values: [point], source: 'twelvedata', interval: '1day', adjustment: 'splits', meta: { symbol: 'AAPL', exchange: 'NASDAQ', currency: 'USD', mic_code: 'XNGS' } }
    expect(readSampleHistory('AAPL', 'USD', history).points).toEqual([])
    expect(readSampleHistory('AAPL', 'USD', history, new Date(), true).points).toHaveLength(1)
    expect(readSampleHistory('AAPL:NYSE', 'USD', history, new Date(), true).points).toEqual([])
    expect(readSampleHistory('AAPL:@XNGS', 'INR', history, new Date(), true).points).toEqual([])
    expect(readSampleHistory('NIFTY:@XNSE', 'INR', { ...history, source: 'upstox', adjustment: 'none', meta: { symbol: 'NIFTY', exchange: 'NSE', currency: 'INR' } }, new Date(), true).points).toHaveLength(1)
  })
})
