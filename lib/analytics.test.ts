import { describe, expect, it } from 'vitest'
import { annualizedVolatility, backtestSmaCrossover, compoundAnnualGrowthRate, dailyReturns, historicalCVaR, historicalVaR, maxDrawdown, monteCarloBootstrap, periodReturn, regressionRiskMetrics, relativeStrengthIndex, sharpeRatio, sortinoRatio, walkForwardValidation } from './analytics'

describe('analytics calculations', () => {
  const prices = [{ datetime: '2026-01-01', close: 100 }, { datetime: '2026-01-02', close: 110 }, { datetime: '2026-01-03', close: 99 }]
  it('calculates simple returns and period return', () => {
    expect(dailyReturns(prices)[0]).toBeCloseTo(0.1)
    expect(dailyReturns(prices)[1]).toBeCloseTo(-0.1)
    expect(periodReturn(prices)).toBeCloseTo(-0.01)
  })
  it('calculates drawdown from the running peak', () => expect(maxDrawdown(prices)).toBeCloseTo(-0.1))
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
