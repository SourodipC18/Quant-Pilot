import {
  cleanPrices,
  runBacktest,
  type BacktestConfig,
  type PricePoint,
} from './analytics'
export const metricLabels = {
  sharpe: 'Sharpe ratio',
  annualizedReturn: 'Annualized return',
  totalReturn: 'Total return',
  maxDrawdown: 'Maximum drawdown',
  winRate: 'Win rate',
  profitFactor: 'Profit factor',
} as const
export type MetricKey = keyof typeof metricLabels
export type GridSpec = {
  fastMin: number
  fastMax: number
  slowMin: number
  slowMax: number
  step: number
}
export function evaluateGrid(
  input: PricePoint[],
  config: BacktestConfig,
  spec: GridSpec,
  metric: MetricKey,
) {
  if (!['sma-crossover', 'ema-crossover'].includes(config.strategy))
    throw Error('Choose an SMA or EMA crossover strategy.')
  const { fastMin, fastMax, slowMin, slowMax, step } = spec
  if (
    !Object.values(spec).every(Number.isInteger) ||
    step < 1 ||
    fastMin < 2 ||
    slowMin < 2 ||
    fastMax > 252 ||
    slowMax > 252 ||
    fastMin > fastMax ||
    slowMin > slowMax
  )
    throw Error(
      'Use ordered periods from 2 to 252 and a positive integer step.',
    )
  const range = (min: number, max: number) =>
    Array.from(
      { length: Math.floor((max - min) / step) + 1 },
      (_, i) => min + i * step,
    )
  const fast = range(fastMin, fastMax),
    slow = range(slowMin, slowMax)
  if (fast.length * slow.length > 144)
    throw Error(
      'Limit the grid to 144 combinations by increasing the step or narrowing the ranges.',
    )
  const bars = cleanPrices(input).slice(-1000),
    cut = Math.floor(bars.length * 0.7),
    train = bars.slice(0, cut),
    test = bars.slice(cut)
  if (train.length < 20 || test.length < 10)
    throw Error(
      'Choose a longer history: at least 20 training and 10 held-out sessions are required.',
    )
  const rows = fast.flatMap((f) =>
    slow.map((s) => ({
      fast: f,
      slow: s,
      value:
        f < s
          ? runBacktest(train, { ...config, fastWindow: f, slowWindow: s })[
              metric
            ]
          : null,
    })),
  )
  const best = rows.reduce<(typeof rows)[number] | null>(
    (best, r) =>
      r.value != null &&
      Number.isFinite(r.value) &&
      (best == null || r.value > best.value!)
        ? r
        : best,
    null,
  )
  const heldOut = best
    ? runBacktest(test, {
        ...config,
        fastWindow: best.fast,
        slowWindow: best.slow,
      })[metric]
    : null
  const describe = (p: PricePoint[]) =>
    `${p[0].datetime} – ${p.at(-1)!.datetime} · ${p.length} sessions`
  return {
    fast,
    slow,
    rows,
    best,
    heldOut,
    train: describe(train),
    test: describe(test),
  }
}
