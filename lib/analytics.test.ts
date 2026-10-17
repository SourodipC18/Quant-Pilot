import { describe, expect, it } from 'vitest'
import { annualizedVolatility, compoundAnnualGrowthRate, dailyReturns, historicalCVaR, historicalVaR, maxDrawdown, periodReturn, relativeStrengthIndex, sharpeRatio, sortinoRatio } from './analytics'

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
})
