export type PriceObservation = { date: string; close: number }
export type ReturnVector = { date: string; from: string; values: number[]; segment: number }

export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const sumSquares = (values: number[]) => values.reduce((sum, value) => sum + value ** 2, 0)
export function sampleDeviation(values: number[]) {
  const center = mean(values)
  return Math.sqrt(sumSquares(values.map(value => value - center)) / (values.length - 1))
}

export function alignDailyReturns(series: PriceObservation[][]) {
  if (!series.length) return { rows: [], dropped: 0 }
  const indexes = series.map(points => {
    const index = new Map<string, number>()
    const duplicates = new Set<string>()
    for (const { date, close } of points) {
      if (index.has(date)) duplicates.add(date)
      index.set(date, close)
    }
    for (const date of duplicates) index.set(date, NaN)
    return index
  })
  if (indexes.some(index => !index.size)) return { rows: [], dropped: 0 }
  const allDates = [...new Set(indexes.flatMap(index => [...index.keys()]))].sort()
  const bounds = indexes.map(index => { const dates = [...index.keys()].sort(); return { first: dates[0], last: dates.at(-1)! } })
  const dates = allDates.filter(date => bounds.every(({ first, last }) => date >= first && date <= last))
  const rows: ReturnVector[] = []
  let dropped = 0, segment = 0
  for (let i = 1; i < dates.length; i++) {
    const values = indexes.map(index => {
      const previous = index.get(dates[i - 1]), current = index.get(dates[i])
      return previous && current && previous > 0 && current > 0 ? current / previous - 1 : NaN
    })
    if (values.some(value => !Number.isFinite(value) || value <= -1)) { dropped++; segment++; continue }
    rows.push({ date: dates[i], from: dates[i - 1], values, segment })
  }
  return { rows, dropped }
}

export const REGIME_WINDOW = 20
export const REGIME_LABELS = ['Rising', 'Falling', 'Range-bound', 'High volatility'] as const
export function marketRegimes(rows: ReturnVector[]) {
  return rows.flatMap((row, index) => {
    if (index < REGIME_WINDOW - 1 || rows[index - REGIME_WINDOW + 1].segment !== row.segment) return []
    const values = rows.slice(index - REGIME_WINDOW + 1, index + 1).map(item => item.values[0])
    const change = values.reduce((growth, value) => growth * (1 + value), 1) - 1
    const volatility = sampleDeviation(values) * Math.sqrt(252)
    const label = REGIME_LABELS[volatility >= 0.30 ? 3 : change >= 0.05 ? 0 : change <= -0.05 ? 1 : 2]
    return [{ date: row.date, change, volatility, label }]
  })
}

const dot = (a: number[], b: number[]) => a.reduce((total, value, index) => total + value * b[index], 0)

export function fitFactors(target: number[], predictors: number[][]) {
  const n = target.length, k = predictors.length
  if (!k || n < Math.max(60, k + 2) || target.some(value => !Number.isFinite(value)) || predictors.some(column => column.length !== n || column.some(value => !Number.isFinite(value)))) return null
  const means = predictors.map(mean), yMean = mean(target), y = target.map(value => value - yMean)
  const q: number[][] = [], r = predictors.map(() => Array<number>(k).fill(0))
  for (let j = 0; j < k; j++) {
    let v = predictors[j].map(value => value - means[j])
    const scale = Math.sqrt(sumSquares(v))
    // A second orthogonalization pass improves the rank check for near-identical proxies.
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < j; i++) {
      const projection = dot(q[i], v)
      r[i][j] += projection
      v = v.map((value, row) => value - projection * q[i][row])
    }
    r[j][j] = Math.sqrt(sumSquares(v))
    if (r[j][j] <= Math.max(1e-10, scale * 1e-5)) return null
    q.push(v.map(value => value / r[j][j]))
  }
  const solve = (rhs: number[]) => {
    const result = Array<number>(k).fill(0)
    for (let i = k - 1; i >= 0; i--) result[i] = (rhs[i] - result.reduce((sum, value, j) => j > i ? sum + r[i][j] * value : sum, 0)) / r[i][i]
    return result
  }
  const coefficients = solve(q.map(column => dot(column, y)))
  const intercept = yMean - dot(means, coefficients)
  const total = sumSquares(y)
  if (total <= 1e-18) return null
  const fitted = target.map((_, row) => intercept + predictors.reduce((sum, column, index) => sum + coefficients[index] * column[row], 0))
  const residualError = sumSquares(target.map((value, index) => value - fitted[index]))
  const residualRisk = Math.sqrt(residualError / (n - k - 1))
  const inverseColumns = predictors.map((_, col) => solve(predictors.map((_, index) => Number(index === col))))
  const standardErrors = coefficients.map((_, index) => residualRisk * Math.sqrt(sumSquares(inverseColumns.map(column => column[index]))))
  return { coefficients, standardErrors, intercept, rSquared: 1 - residualError / total, residualRisk, fitted }
}

export function quantile(sorted: number[], q: number) {
  const index = (sorted.length - 1) * q, lower = Math.floor(index), upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function evaluateForecast(rows: ReturnVector[], horizon: number) {
  const window = 20
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 20 || rows.length < 80) return null
  const split = Math.floor(rows.length * 0.7)
  const estimates = []
  for (let target = split + horizon - 1; target < rows.length; target += horizon) {
    const origin = target - horizon
    if (rows[origin - window + 1]?.segment !== rows[target].segment) continue
    const observed = rows.slice(origin - window + 1, origin + 1).map(row => row.values[0])
    const actual = rows.slice(origin + 1, target + 1).reduce((growth, row) => growth * (1 + row.values[0]), 1) - 1
    const model = (1 + mean(observed)) ** horizon - 1
    estimates.push({ date: rows[target].date, origin: rows[origin].date, actual, model, naive: 0 })
  }
  if (estimates.length < 5) return null
  const errors = estimates.map(point => point.actual - point.model).sort((a, b) => a - b)
  const naiveErrors = estimates.map(point => point.actual)
  return {
    estimates, trainStart: rows[0].from, trainEnd: rows[split - 1].date,
    testStart: rows[split].date, testEnd: rows.at(-1)!.date,
    mae: mean(errors.map(Math.abs)), naiveMae: mean(naiveErrors.map(Math.abs)),
    rmse: Math.sqrt(sumSquares(errors) / errors.length), naiveRmse: Math.sqrt(sumSquares(naiveErrors) / errors.length),
    errorRange: errors.length >= 20 ? [quantile(errors, 0.1), quantile(errors, 0.9)] : null,
  }
}

export type SimulationSettings = { horizon: number; paths: number; seed: number; block: number }
export function bootstrapScenarios(rows: ReturnVector[], weights: number[], { horizon, paths, seed, block }: SimulationSettings) {
  if (rows.length < 40 || !weights.length || weights.some(value => !Number.isFinite(value) || value < 0) || Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) > 1e-8 || rows.some(row => row.values.length !== weights.length || row.values.some(value => !Number.isFinite(value) || value <= -1))) return null
  if (![horizon, paths, seed, block].every(Number.isInteger) || horizon < 1 || horizon > 252 || paths < 1 || paths > 4000 || seed < 0 || seed > 0xffffffff || block < 1 || block > Math.min(20, horizon)) return null
  const starts = rows.flatMap((row, index) => rows[index + block - 1]?.segment === row.segment ? [index] : [])
  if (starts.length < 20) return null
  const terminal: number[] = [], drawdown: number[] = []
  let state = seed >>> 0
  function random() {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let path = 0; path < paths; path++) {
    let value = 1, peak = 1, worst = 0
    for (let day = 0; day < horizon;) {
      const start = starts[Math.floor(random() * starts.length)]
      for (let offset = 0; offset < block && day < horizon; offset++, day++) {
        value *= 1 + dot(rows[start + offset].values, weights)
        peak = Math.max(peak, value)
        worst = Math.max(worst, 1 - value / peak)
      }
    }
    if (!Number.isFinite(value)) return null
    terminal.push(value - 1)
    drawdown.push(worst)
  }
  return { terminal: terminal.sort((a, b) => a - b), drawdown: drawdown.sort((a, b) => a - b), probabilityLoss: terminal.filter(value => value < 0).length / paths, availableBlocks: starts.length }
}
