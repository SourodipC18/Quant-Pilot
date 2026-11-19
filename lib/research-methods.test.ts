import { describe, expect, it } from 'vitest'
import { alignDailyReturns, bootstrapScenarios, evaluateForecast, fitFactors, marketRegimes, quantile, type ReturnVector } from './research-methods'

const date = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
const rows = (count: number, read: (i: number) => number[], segment = (_i: number) => 0): ReturnVector[] => Array.from({ length: count }, (_, i) => ({ date: date(i + 1), from: date(i), values: read(i), segment: segment(i) }))

describe('historical research methods', () => {
  it('matches both endpoints and does not bridge missing and duplicate prices', () => {
    const a = Array.from({ length: 8 }, (_, i) => ({ date: date(i), close: 2 ** i })).reverse()
    const b = a.filter(item => item.date !== date(2)).concat({ date: date(5), close: 20 })
    const result = alignDailyReturns([a, b])
    expect(result.dropped).toBe(4)
    expect(result.rows.map(row => row.date)).toEqual([date(1), date(4), date(7)])
    expect(result.rows.map(row => row.values)).toEqual([[1, 1], [1, 1], [1, 1]])
    expect(new Set(result.rows.map(row => row.segment)).size).toBe(3)
  })

  it('classifies only a complete trailing window, respects priority and does not look ahead', () => {
    expect(marketRegimes(rows(19, () => [0.004]))).toEqual([])
    const original = rows(20, () => [0.004])
    const first = marketRegimes(original)
    expect(first).toEqual([{ date: date(20), change: expect.closeTo(1.004 ** 20 - 1, 12), volatility: expect.closeTo(0, 12), label: 'Rising' }])
    expect(marketRegimes(original.concat({ date: date(21), from: date(20), values: [-0.20], segment: 0 }))[0]).toEqual(first[0])
    expect(marketRegimes(rows(20, () => [-0.003])).at(-1)?.label).toBe('Falling')
    expect(marketRegimes(rows(20, () => [0])).at(-1)?.label).toBe('Range-bound')
    expect(marketRegimes(rows(20, i => [i % 2 ? 0.12 : -0.03])).at(-1)?.label).toBe('High volatility')
    expect(marketRegimes(rows(30, () => [0.004], i => Number(i >= 15)))).toEqual([])
  })

  it('recovers multivariate coefficients and rejects inadequate or collinear samples', () => {
    const x = Array.from({ length: 100 }, (_, i) => Math.sin(i) / 10)
    const y = x.map((_, i) => Math.cos(i) / 20), z = x.map((_, i) => Math.sin(i / 3) / 30)
    const target = x.map((value, i) => 0.001 + value * 2 - y[i] * 0.5 + z[i] * 0.75)
    const fit = fitFactors(target, [x, y, z])!
    expect(fit.coefficients).toEqual([expect.closeTo(2, 10), expect.closeTo(-0.5, 10), expect.closeTo(0.75, 10)])
    expect(fit.intercept).toBeCloseTo(0.001, 12)
    expect(fit.rSquared).toBeCloseTo(1, 12)
    expect(fit.residualRisk).toBeCloseTo(0, 12)
    expect(fit.standardErrors.every(value => value < 1e-12)).toBe(true)
    expect(fitFactors(target, [x, y, x.map(value => value * 2)])).toBeNull()
    expect(fitFactors(target.slice(0, 30), [x.slice(0, 30)])).toBeNull()
  })

  it('keeps the forecast split chronological with exact naive errors and non-overlapping outcomes', () => {
    const observations = rows(100, () => [0.01])
    const result = evaluateForecast(observations, 5)!
    expect(result.trainEnd).toBe(date(70))
    expect(result.testStart).toBe(date(71))
    expect(result.estimates[0]).toMatchObject({ origin: date(70), date: date(75), naive: 0 })
    expect(result.estimates).toHaveLength(6)
    expect(result.naiveMae).toBeCloseTo(1.01 ** 5 - 1, 12)
    expect(result.mae).toBeCloseTo(0, 12)
    expect(result.errorRange).toBeNull()
    expect(evaluateForecast(rows(100, i => [i >= 70 ? 0.10 : 0.01]), 5)?.estimates[0].model).toBeCloseTo(result.estimates[0].model, 12)
    expect(evaluateForecast(observations, 20)).toBeNull()
  })

  it('reproduces seeded runs, jointly samples assets, and never crosses a break inside a block', () => {
    const paired = rows(40, i => i % 2 ? [0.2, -0.2] : [-0.2, 0.2], i => Number(i >= 20))
    const settings = { horizon: 9, seed: 0, paths: 100, block: 3 }
    const result = bootstrapScenarios(paired, [0.5, 0.5], settings)!
    expect(result.availableBlocks).toBe(36)
    expect(quantile(result.terminal, 0.5)).toBe(0)
    expect(quantile(result.drawdown, 0.9)).toBe(0)
    expect(result.probabilityLoss).toBe(0)
    const skewed = rows(60, i => [i % 2 ? 0.04 : -0.12])
    expect(bootstrapScenarios(skewed, [1], settings)).toEqual(bootstrapScenarios(skewed, [1], settings))
    expect(bootstrapScenarios(skewed, [1], settings)).not.toEqual(bootstrapScenarios(skewed, [1], { ...settings, seed: 1 }))
    const losses = bootstrapScenarios(rows(60, () => [-0.02]), [1], settings)!
    expect(losses.probabilityLoss).toBe(1)
    expect(losses.drawdown[0]).toBeCloseTo(1 - 0.98 ** 9)
  })
})
