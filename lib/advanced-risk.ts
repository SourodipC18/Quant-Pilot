import { mean, sampleDeviation, quantile, fitFactors } from './research-methods'
import { riskReturns, sharedCloses, type RiskSeries } from './portfolio-risk-lab'

export const SURFACE_WINDOWS = [20, 30, 60, 90, 126, 252] as const
export const FACTOR_WINDOWS = [60, 90, 126, 252] as const
export const TAIL_OBSERVATIONS = 100
export const ANNUAL_SESSIONS = 252
export const CONFIDENCE = 0.95
const TAIL = 0.05
const ROOT_YEAR = Math.sqrt(ANNUAL_SESSIONS)
const MAX_SESSIONS = 800

export const RISK_METRICS = {
  volatility: { label: 'Annualized volatility', percent: true },
  sharpe: { label: 'Historical Sharpe ratio', percent: false },
  sortino: { label: 'Historical Sortino ratio', percent: false },
  var95: { label: 'Historical VaR (95%)', percent: true },
  cvar95: { label: 'Historical CVaR (95%)', percent: true },
  tracking: { label: 'Annualized tracking error', percent: true },
} as const
export type RiskMetric = keyof typeof RISK_METRICS
export type Valuation = { kind: 'shares'; shares: number[]; cash: number } | { kind: 'targets'; weights: number[]; capital: number }
export type ValueInterval = { date: string; from: string; segment: number; value: number; previous: number; change: number }
export type SurfaceCell = { value: number; from: string; observations: number; rSquared?: number; peak?: string; peakValue?: number; endValue?: number }
const cell = (value: number | null, from: string, observations: number): SurfaceCell | null => value != null && Number.isFinite(value) ? { value, from, observations } : null

export function historicalValues(series: RiskSeries[], days: number, valuation: Valuation | null): ValueInterval[] {
  if (!series.length || series.length > 10 || !valuation) return []
  const weights = valuation.kind === 'targets' ? valuation.weights : valuation.shares
  if (weights.length !== series.length || weights.some(weight => !(weight > 0) || !Number.isFinite(weight))) return []
  if (valuation.kind === 'targets' && (!(valuation.capital > 0) || !Number.isFinite(valuation.capital) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-8)) return []
  if (valuation.kind === 'shares' && (!Number.isFinite(valuation.cash) || valuation.cash < 0)) return []
  const sources = series.map(item => ({ ...item, points: item.points.slice(-MAX_SESSIONS) }))
  const rows = riskReturns(sources, days)
  const closes = valuation.kind === 'shares' ? new Map(sharedCloses(sources).map(({ date, closes }) => [date, closes.reduce((sum, close, i) => sum + close * weights[i], valuation.cash)])) : null
  let level = valuation.kind === 'targets' ? valuation.capital : 0
  const values: ValueInterval[] = []
  for (const [i, row] of rows.entries()) {
    if (valuation.kind === 'targets' && rows[i - 1]?.segment !== row.segment) level = valuation.capital
    const previous = closes ? closes.get(row.from)! : level
    const value = closes ? closes.get(row.date)! : previous * (1 + row.values.reduce((sum, change, j) => sum + change * weights[j], 0))
    if (!Number.isFinite(previous) || !Number.isFinite(value) || previous <= 0 || value <= 0) return []
    level = value
    values.push({ date: row.date, from: row.from, segment: row.segment, previous, value, change: value / previous - 1 })
  }
  return values
}

export function riskStatistics(changes: number[], includeTail = true) {
  const n = changes.length
  const average = n ? mean(changes) : 0
  const deviation = n >= 20 ? sampleDeviation(changes) : null
  const downside = n >= 20 ? Math.sqrt(mean(changes.map(change => Math.min(0, change) ** 2))) : 0
  const sorted = includeTail && n >= TAIL_OBSERVATIONS ? changes.slice().sort((a, b) => a - b) : null
  return {
    volatility: deviation == null ? null : deviation * ROOT_YEAR,
    sharpe: deviation != null && deviation > 1e-12 ? average / deviation * ROOT_YEAR : null,
    sortino: downside > 1e-12 ? average / downside * ROOT_YEAR : null,
    var95: sorted ? Math.max(0, -quantile(sorted, TAIL)) : null,
    cvar95: sorted ? Math.max(0, -mean(sorted.slice(0, Math.ceil(n * TAIL)))) : null,
  }
}

export function alignedProxy(target: ValueInterval[], proxy: RiskSeries | undefined, days: number, baseline?: RiskSeries) {
  if (!proxy) return target.map(() => null)
  const rows = riskReturns(baseline ? [proxy, baseline] : [proxy], days + 7)
  const index = new Map(rows.map(row => [row.date, row]))
  return target.map(item => {
    const row = index.get(item.date)
    return row?.from === item.from ? row.values[0] - (row.values[1] ?? 0) : null
  })
}

function trailing<T>(rows: ValueInterval[], end: number, window: number, run: (start: number) => T): T | null {
  const start = end - window + 1
  return start >= 0 && rows[start].segment === rows[end].segment ? run(start) : null
}

export function trackingStatistics(rows: ValueInterval[], proxy: (number | null)[], start = 0, end = rows.length) {
  const active = rows.slice(start, end).flatMap(({ change }, i) => {
    const value = proxy[start + i]
    return value != null ? [change - value] : []
  })
  return { observations: active.length, value: active.length >= 20 ? sampleDeviation(active) * ROOT_YEAR : null }
}

export function rollingRisk(rows: ValueInterval[], metric: RiskMetric, windows: readonly number[], benchmark: (number | null)[]) {
  return rows.map((_, end) => windows.map(window => trailing(rows, end, window, start => {
    if (metric === 'tracking') {
      const result = trackingStatistics(rows, benchmark, start, end + 1)
      return result.observations === window ? cell(result.value, rows[start].from, window) : null
    }
    return cell(riskStatistics(rows.slice(start, end + 1).map(row => row.change), metric === 'var95' || metric === 'cvar95')[metric], rows[start].from, window)
  })))
}

export function rollingDrawdown(rows: ValueInterval[], windows: readonly number[]) {
  return rows.map((row, end) => windows.map(window => trailing(rows, end, window, start => {
    let peak = rows[start].previous, peakDate = rows[start].from
    for (let i = start; i <= end; i++) if (rows[i].value >= peak) {
      peak = rows[i].value
      peakDate = rows[i].date
    }
    return { value: row.value / peak - 1, from: rows[start].from, observations: window, peak: peakDate, peakValue: peak, endValue: row.value }
  })))
}

type DrawdownEvent = { value: number; peak: string; trough: string; peakValue: number; troughValue: number; recovery: string | null; recoverySessions: number | null }

export function drawdownRecovery(rows: ValueInterval[], trough: number, peakValue: number) {
  for (let i = trough + 1; i < rows.length && rows[i].segment === rows[trough].segment; i++) {
    if (rows[i].value >= peakValue) return { recovery: rows[i].date, recoverySessions: i - trough }
  }
  return { recovery: null, recoverySessions: null }
}

export function fullDrawdown(rows: ValueInterval[]) {
  const points: { date: string; value: number | null }[] = []
  let worst: Omit<DrawdownEvent, 'recovery' | 'recoverySessions'> | null = null
  let worstIndex = -1, eligible = false
  for (let start = 0; start < rows.length;) {
    let end = start + 1
    while (end < rows.length && rows[end].segment === rows[start].segment) end++
    const sufficient = end - start >= 20
    eligible ||= sufficient
    if (start) points.push({ date: rows[start].from, value: null })
    else points.push({ date: rows[start].from, value: 0 })
    let peak = rows[start].previous, peakDate = rows[start].from
    for (let i = start; i < end; i++) {
      const row = rows[i]
      const value = Math.min(0, row.value / peak - 1)
      points.push({ date: row.date, value })
      if (sufficient && value < (worst?.value ?? 0)) {
        worstIndex = i
        worst = { value, peak: peakDate, trough: row.date, peakValue: peak, troughValue: row.value }
      }
      if (row.value >= peak) { peak = row.value; peakDate = row.date }
    }
    start = end
  }
  return { points, maximum: eligible ? worst?.value ?? 0 : null, worst: worst ? { ...worst, ...drawdownRecovery(rows, worstIndex, worst.peakValue) } : null }
}

export function rollingFactors(rows: ValueInterval[], proxies: (number | null)[][], window: number): (SurfaceCell | null)[][] {
  return rows.map((_, end) => proxies.map(proxy => trailing(rows, end, window, start => {
    const matched = proxy.slice(start, end + 1)
    if (matched.some(value => value == null)) return null
    const fit = fitFactors(rows.slice(start, end + 1).map(row => row.change), [matched as number[]])
    return fit && Number.isFinite(fit.coefficients[0]) && Number.isFinite(fit.rSquared) ? { value: fit.coefficients[0], rSquared: Math.max(0, Math.min(1, fit.rSquared)), from: rows[start].from, observations: window } : null
  })))
}

export function worstByWindow(grid: (SurfaceCell | null)[][], width: number) {
  return Array.from({ length: width }, (_, j) => grid.reduce<number>((worst, row, i) => {
    const value = row[j]?.value
    return value != null && value < (grid[worst]?.[j]?.value ?? 0) ? i : worst
  }, -1))
}
