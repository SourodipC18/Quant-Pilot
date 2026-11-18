import { describe, expect, it } from 'vitest'
import { annualizedVolatility, backtestSmaCrossover, benchmarkComparison, bollingerBands, compoundAnnualGrowthRate, dailyReturns, DEFAULT_BACKTEST_CONFIG, detectCandlestickPatterns, exponentialMovingAverage, historicalCVaR, macdSeries, optimizePortfolio, portfolioAttribution, portfolioRisk, portfolioShareValue, historicalVaR, maxDrawdown, monteCarloBootstrap, periodReturn, rebalanceProposal, regressionRiskMetrics, relativeStrengthIndex, runBacktest, sharpeRatio, simpleMovingAverage, sortinoRatio, walkForwardValidation } from './analytics'

describe('analytics calculations', () => {
  const prices = [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 110 }, { datetime: '2026-01-03', close: 99 }]
  it('calculates simple returns and period return', () => {
    expect(dailyReturns(prices)[0]).toBeCloseTo(0.1)
    expect(dailyReturns(prices)[1]).toBeCloseTo(-0.1)
    expect(periodReturn(prices)).toBeCloseTo(-0.01)
  })
  it('calculates drawdown from the running peak', () => expect(maxDrawdown(prices)).toBeCloseTo(-0.1))
  it('matches known indicator warm-up and values', () => {
    expect(simpleMovingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
    expect(exponentialMovingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
    expect(bollingerBands([1, 2, 3], 3, 2)[2]?.middle).toBe(2)
    expect(macdSeries(Array.from({ length: 40 }, (_, index) => 100 + index))[0].macd).toBeNull()
    expect(macdSeries(Array.from({ length: 40 }, (_, index) => 100 + index)).at(-1)?.histogram).toBeTypeOf('number')
  })
  it('only reports candlestick patterns when complete OHLC fields exist', () => {
    const patterns = detectCandlestickPatterns([
      { datetime: '2026-01-01', open: 10, high: 11, low: 9, close: 9.5 },
      { datetime: '2026-01-02', open: 9, high: 12, low: 8, close: 11 },
      { datetime: '2026-01-03', close: 12 },
    ])
    expect(patterns[1].patterns).toContain('Bullish engulfing')
    expect(patterns[2].patterns).toEqual([])
  })
  it('values fixed share holdings through time instead of reweighting to today', () => {
    const values = portfolioShareValue([
      { points: [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 110 }], shares: 2 },
      { points: [{ datetime: '2026-01-01', close: 50 }, { datetime: '2026-01-02', close: 25 }], shares: 4 },
    ])
    expect(values.map(point => point.close)).toEqual([400, 320])
    expect(portfolioShareValue([{ points: prices, shares: 0 }])).toEqual([])
  })
  it('returns null for insufficient volatility samples', () => expect(annualizedVolatility([0.01])).toBeNull())
  it('keeps risk metrics finite for valid samples', () => {
    const returns = dailyReturns(prices)
    expect(sharpeRatio(returns)).toBeTypeOf('number')
    expect(sortinoRatio(returns)).toBeTypeOf('number')
    expect(historicalVaR(returns)).toBeTypeOf('number')
    expect(historicalCVaR(returns)).toBeTypeOf('number')
  })
  it('annualizes growth over observations and guards indicator warmup', () => {
    expect(compoundAnnualGrowthRate(prices)).toBeTypeOf('number')
    expect(relativeStrengthIndex([1, 2, 3], 14)).toBeNull()
  })
  it('simulates next-bar crossover trades without arbitrary return multipliers', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ datetime: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), close: index < 48 ? 200 - index : 152 + (index - 48) * 2 }))
    const result = backtestSmaCrossover(points, 5, 20)
    expect(result.equity.length).toBeGreaterThan(0)
    expect(result.totalReturn).toBeTypeOf('number')
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.trades[0].costs).toBeGreaterThan(0)
  })
  it('rejects non-finite allocation and invalid RSI thresholds', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({ datetime: `2026-01-${String(index + 1).padStart(2, '0')}`, close: 100 + index }))
    expect(runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, fastWindow: 3, slowWindow: 5, allocationPct: Number.NaN }).equity).toEqual([])
    expect(runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, strategy: 'rsi-reversal', fastWindow: 3, slowWindow: 5, rsiOversold: 80, rsiOverbought: 20 }).equity).toEqual([])
  })
  it('executes crossover signals on the next bar open and liquidates on the final close', () => {
    const points = [
      { datetime: '2026-01-01', close: 3 },
      { datetime: '2026-01-02', close: 2 },
      { datetime: '2026-01-03', close: 1 },
      { datetime: '2026-01-04', close: 2 },
      { datetime: '2026-01-05', close: 3 },
      { datetime: '2026-01-06', open: 4.5, close: 4 },
      { datetime: '2026-01-07', close: 5 },
    ]
    const result = runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, fastWindow: 2, slowWindow: 3, commissionBps: 0, slippageBps: 0, marketImpactBps: 0 })
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0]).toMatchObject({ entryDate: '2026-01-06', exitDate: '2026-01-07', entryPrice: 4.5, exitPrice: 5, barsHeld: 1 })
    expect(result.trades[0].pnl).toBeCloseTo(100000 / 4.5 * 0.5)
    expect(result.equity.at(-1)?.datetime).toBe('2026-01-07')
    expect(result.equity.at(-1)?.value).toBeCloseTo(100000 * 5 / 4.5)
  })
  it('includes commission, slippage, and market impact in cash and trade results', () => {
    const points = [
      { datetime: '2026-01-01', close: 3 }, { datetime: '2026-01-02', close: 2 },
      { datetime: '2026-01-03', close: 1 }, { datetime: '2026-01-04', close: 2 },
      { datetime: '2026-01-05', close: 3 }, { datetime: '2026-01-06', open: 4, close: 4 },
      { datetime: '2026-01-07', close: 5 },
    ]
    const result = runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, fastWindow: 2, slowWindow: 3, commissionBps: 100, slippageBps: 100, marketImpactBps: 100 })
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].entryPrice).toBe(4)
    expect(result.trades[0].costs).toBeGreaterThan(0)
    expect(result.equity.at(-1)!.value).toBeLessThan(125000)
  })
  it('falls back to a valid close when the next daily open is invalid', () => {
    const points = Array.from({ length: 40 }, (_, index) => ({ datetime: `2026-01-${String(index + 1).padStart(2, '0')}`, close: 100 + index, open: index === 6 ? Number.NaN : undefined }))
    const result = runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, fastWindow: 2, slowWindow: 5, commissionBps: 0, slippageBps: 0 })
    expect(result.equity.every(point => Number.isFinite(point.value))).toBe(true)
  })
  it('compares aligned asset and benchmark returns without using raw price correlation', () => {
    const asset = [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 110 }, { datetime: '2026-01-04', close: 121 }]
    const benchmark = [{ datetime: '2026-01-01', close: 50 }, { datetime: '2026-01-02', close: 55 }, { datetime: '2026-01-03', close: 56 }, { datetime: '2026-01-04', close: 60.5 }]
    const comparison = benchmarkComparison(asset, benchmark)
    expect(comparison.cumulativeReturn).toBeCloseTo(0.21)
    expect(comparison.excessReturn).toBeCloseTo(0.21 - 0.21)
    expect(comparison.sampleCount).toBe(2)
    expect(comparison.dates).toEqual(['2026-01-02', '2026-01-04'])
  })
  it('uses aligned weighted portfolio returns for portfolio risk', () => {
    const risk = portfolioRisk([
      { weight: 0.6, points: [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 110 }, { datetime: '2026-01-03', close: 99 }] },
      { weight: 0.4, points: [{ datetime: '2026-01-01', close: 50 }, { datetime: '2026-01-02', close: 55 }, { datetime: '2026-01-03', close: 55 }] },
    ])
    expect(risk?.sampleCount).toBe(2)
    expect(risk?.portfolio.at(-1)?.close).toBeCloseTo(1.034)
    expect(risk?.annualizedVolatility).toBeTypeOf('number')
  })
  it('optimizes aligned assets with bounded weights and reports risk parity', () => {
    const result = optimizePortfolio([
      { symbol: 'AAA', points: [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 101 }, { datetime: '2026-01-03', close: 102 }, { datetime: '2026-01-04', close: 103 }] },
      { symbol: 'BBB', points: [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 99 }, { datetime: '2026-01-03', close: 101 }, { datetime: '2026-01-04', close: 100 }] },
    ], { maxWeight: 0.8, step: 0.1 })
    expect(result?.minimumVariance).not.toBeNull()
    expect(result?.frontier.length).toBeGreaterThan(0)
    expect(result?.minimumVariance?.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(portfolioAttribution([0.6, 0.4], [[0.01, 0.02], [0, 0.01]])[0].contribution).toBeCloseTo(0.6 * 0.015 * 252)
    expect(rebalanceProposal([0.8, 0.2], [0.6, 0.4], 0.05).map(item => item.action)).toEqual(['decrease', 'increase'])
  })
  it('rejects invalid portfolio weights and insufficient aligned history', () => {
    expect(portfolioRisk([{ weight: 0.5, points: prices }, { weight: 0.4, points: prices }])).toBeNull()
    expect(benchmarkComparison(prices, [{ datetime: '2026-01-01', close: 50 }]).sampleCount).toBe(0)
  })
  it('estimates factor risk from aligned strategy and benchmark returns', () => {
    const metrics = regressionRiskMetrics([0.02, -0.01, 0.04, 0.01], [0.01, -0.005, 0.02, 0.005])
    expect(metrics.beta).toBeCloseTo(2)
    expect(metrics.correlation).toBeCloseTo(1)
    expect(metrics.trackingError).toBeGreaterThan(0)
    expect(metrics.alpha).toBeTypeOf('number')
  })
  it('repeats deterministic Monte Carlo paths for the same seed', () => {
    const first = monteCarloBootstrap([-0.02, -0.01, 0.005, 0.01, 0.02], 10000, 20, 250, 7)
    const second = monteCarloBootstrap([-0.02, -0.01, 0.005, 0.01, 0.02], 10000, 20, 250, 7)
    expect(first.fan).toEqual(second.fan)
    expect(first.fan).toHaveLength(21)
    expect(first.trajectories).toHaveLength(240)
    expect(first.trajectories[0]).toHaveLength(21)
    expect(first.trajectories).toEqual(second.trajectories)
    expect(first.terminalP05).toBeLessThan(first.terminalP95!)
  })
  it('selects parameters on training folds and reports held-out periods', () => {
    const points = Array.from({ length: 180 }, (_, index) => ({ datetime: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), close: 100 + index * 0.2 + Math.sin(index / 5) * 4 }))
    const folds = walkForwardValidation(points, { strategy: 'sma-crossover', fastWindow: 5, slowWindow: 20, initialCapital: 100000, commissionBps: 5, slippageBps: 2, allocationPct: 100, rsiOversold: 30, rsiOverbought: 70 }, { trainBars: 80, testBars: 30, candidates: [{ fastWindow: 5, slowWindow: 20 }, { fastWindow: 8, slowWindow: 30 }] })
    expect(folds).toHaveLength(4)
    expect(folds[0].testStart).toBe(points[80].datetime)
    expect(folds.every(fold => fold.outOfSampleReturn != null)).toBe(true)
  })
})
