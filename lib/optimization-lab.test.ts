import { describe, expect, it } from 'vitest'
import { annualizedVolatility, dailyReturns, mean, sharpeRatio, type PricePoint } from './analytics'
import { calculateOptimizationLab, labConstraintError, type LabAsset } from './optimization-lab'

function prices(pattern: number[], count = 55): PricePoint[] {
  const points: PricePoint[] = []
  let close = 100
  for (let day = Date.UTC(2025, 0, 6); points.length < count; day += 86_400_000) {
    const date = new Date(day)
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
    if (points.length) close *= 1 + pattern[(points.length - 1) % pattern.length]
    points.push({ datetime: date.toISOString().slice(0, 10), close })
  }
  return points
}
const assets: LabAsset[] = [
  { symbol: 'ONE', currency: 'USD', points: prices([0.013, -0.007]) },
  { symbol: 'TWO', currency: 'USD', points: prices([0.024, -0.016]) },
]

function run(input = assets, cap = 100, shares?: number[]) {
  const calculation = calculateOptimizationLab(input, '1Y', cap, shares)
  if ('error' in calculation) throw new Error(calculation.error)
  return calculation.result
}

describe('Optimization Lab', () => {
  it('matches known sample risk and marks the unconstrained holdings baseline separately', () => {
    const result = run(assets, 100, [2, 3])
    const returns = dailyReturns(assets[0].points)
    expect(result.minimum.weights).toEqual([1, 0])
    expect(result.maximum?.weights).toEqual([1, 0])
    expect(result.minimum.expectedReturn).toBeCloseTo(mean(returns)! * 252, 10)
    expect(result.minimum.volatility).toBeCloseTo(annualizedVolatility(returns)!, 10)
    expect(result.minimum.sharpe).toBeCloseTo(sharpeRatio(returns)!, 10)
    const firstValue = 2 * assets[0].points.at(-1)!.close
    expect(result.current?.weights[0]).toBeCloseTo(firstValue / (firstValue + 3 * assets[1].points.at(-1)!.close))
    expect(result.samples).toBe(54)
    expect(result.valuationDate).toBe(assets[0].points.at(-1)?.datetime)
  })

  it('finds feasible capped candidates, including at an off-grid cap', () => {
    const basket = Array.from({ length: 6 }, (_, index) => ({ symbol: `A${index}`, currency: 'USD', points: prices([0.01 + index * 0.003, -0.005]) }))
    const result = run(basket, 17, [100, 1, 1, 1, 1, 1])
    const points = [...result.candidates, ...result.frontier, result.minimum, result.maximum!]
    expect(result.step).toBe(10)
    expect(result.searched).toBeGreaterThan(1)
    for (const candidate of points) {
      expect(candidate.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 9)
      expect(candidate.weights.every(weight => weight >= 0 && weight <= 0.170000001)).toBe(true)
    }
    expect(result.current?.weights[0]).toBeGreaterThan(0.17)
    expect(labConstraintError(6, 16)).toMatch(/at least 17%/)
  })

  it('keeps only non-dominated risk and return points on the frontier', () => {
    const result = run()
    expect(result.frontier.length).toBeGreaterThan(1)
    expect(result.candidates.every(point => result.frontier.some(frontier => frontier.volatility <= point.volatility && frontier.expectedReturn + 1e-10 >= point.expectedReturn))).toBe(true)
    expect(result.frontier.every((point, i, all) => i === 0 || point.volatility > all[i - 1].volatility && point.expectedReturn > all[i - 1].expectedReturn)).toBe(true)
  })

  it('uses the requested lookback and omits intervals on both sides of missing sessions', () => {
    const points = prices([0.005, -0.003], 250)
    const sparse = points.filter((_, i) => i !== 225)
    const result = calculateOptimizationLab([{ ...assets[0], points }, { ...assets[1], points: sparse }], '6M', 100)
    expect('result' in result && result.result.skippedIntervals).toBe(2)
    expect('result' in result && result.result.samples).toBeLessThan(140)
    expect('result' in result && result.result.end).toBe(points.at(-1)?.datetime)
  })

  it('reports insufficient history and rejects missing or mixed currencies', () => {
    expect(calculateOptimizationLab(assets.map(asset => ({ ...asset, points: asset.points.slice(0, 11) })), '1Y', 100)).toEqual({ error: expect.stringMatching(/Only 10 aligned daily returns/) })
    for (const currency of ['EUR', undefined]) expect(calculateOptimizationLab([assets[0], { ...assets[1], currency }], '1Y', 100)).toEqual({ error: expect.stringMatching(/same verified quote currency/) })
  })

  it('does not invent a Sharpe ratio for flat histories', () => {
    const result = run(assets.map(asset => ({ ...asset, points: prices([0]) })))
    expect(result.minimum.sharpe).toBeNull()
    expect(result.maximum).toBeNull()
    expect(result.current).toBeNull()
  })
})
