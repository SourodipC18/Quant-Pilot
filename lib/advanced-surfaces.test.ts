import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BACKTEST_CONFIG as config,
  monteCarloBootstrap,
  runBacktest,
} from './analytics'
import { simulationPortfolio } from './simulation-portfolio'
import { evaluateGrid } from './strategy-surface'

describe('Phase 6C.1 analytical contracts', () => {
  it('normalizes each time slice across every path independently of trajectory thinning', () => {
    const r = monteCarloBootstrap([-0.04, 0.01, 0.03], 500, 65, 313, 7, 2)
    expect(r.trajectories).toHaveLength(2)
    expect(r.terminalReturns).toHaveLength(313)
    for (const row of r.density.rows)
      expect(row.reduce((a, b) => a + b * r.density.width, 0)).toBeCloseTo(
        1,
        12,
      )
    expect(r.probabilityOfLoss).toBe(
      r.terminalReturns.filter((v) => v < 0).length / 313,
    )
    expect(r.expectedTerminal).toBeCloseTo(
      500 * (1 + r.terminalReturns.reduce((a, b) => a + b) / 313),
    )
    expect(
      monteCarloBootstrap([-0.04, 0.01, 0.03], 500, 65, 313, 7, 0).density,
    ).toEqual(r.density)
  })
  it('uses matched rows and share values including zero-yield paper cash', () => {
    const points = (vals: number[]) =>
      vals.map((close, i) => ({ date: `2025-01-0${i + 1}`, close }))
    const assets = [
      { symbol: 'A', shares: 2, points: points([10, 12, 10]) },
      { symbol: 'B', shares: 3, points: points([20, 18, 20]) },
    ]
    const p = simulationPortfolio(assets, 20)!
    expect(p.weights).toEqual([0.2, 0.6])
    expect(p.cashWeight).toBe(0.2)
    expect(p.returns[0]).toBeCloseTo(0.2 * 0.2 - 0.6 * 0.1)
    expect(simulationPortfolio(assets)!.weights).toEqual([0.25, 0.75])
    expect(simulationPortfolio([])).toBeNull()
  })
  for (const strategy of ['sma-crossover', 'ema-crossover'] as const)
    it(`${strategy}: training grid and isolated test match the engine`, () => {
      const bars = Array.from({ length: 300 }, (_, i) => ({
        datetime: new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10),
        close: 100 + 12 * Math.sin(i * 0.2) + i * 0.04,
      }))
      const cfg = { ...config, strategy, commissionBps: 21, slippageBps: 11 }
      const spec = { fastMin: 2, fastMax: 8, slowMin: 4, slowMax: 12, step: 2 }
      const g = evaluateGrid(bars, cfg, spec, 'totalReturn')
      for (const r of g.rows)
        expect(r.value).toBe(
          runBacktest(bars.slice(0, 210), {
            ...cfg,
            fastWindow: r.fast,
            slowWindow: r.slow,
          }).totalReturn,
        )
      expect(g.heldOut).toBe(
        runBacktest(bars.slice(210), {
          ...cfg,
          fastWindow: g.best!.fast,
          slowWindow: g.best!.slow,
        }).totalReturn,
      )
      expect(
        evaluateGrid(
          bars.map((p, i) =>
            i < 210 ? p : { ...p, close: p.close * (1 + (i % 3)) },
          ),
          cfg,
          spec,
          'totalReturn',
        ).best,
      ).toEqual(g.best)
    })
})
