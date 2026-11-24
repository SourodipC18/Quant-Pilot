import { alignDailyReturns, fitFactors, quantile, sampleDeviation, type PriceObservation } from './research-methods'

export const ROLLING_WINDOWS = [30, 60, 90, 252] as const
export const RISK_PERIODS = { '6M': 183, '1Y': 366, '3Y': 1096 } as const
export const HISTORICAL_WINDOWS = [
  { id: 'gfc', label: 'Financial crisis', start: '2007-10-09', end: '2009-03-09' },
  { id: 'covid', label: 'COVID-19 market crash', start: '2020-02-19', end: '2020-03-23' },
  { id: 'rates', label: 'Interest rate shock · 2022 tightening', start: '2022-01-03', end: '2022-06-14' },
  { id: 'tech', label: 'Technology sector selloff · 2021–22', start: '2021-11-19', end: '2022-10-12' },
] as const

export const RISK_FACTORS = {
  USD: [{ symbol: 'SPY', name: 'US equities (SPY)' }, { symbol: 'QQQ', name: 'Technology tilt (QQQ)' }, { symbol: 'TLT', name: 'Long Treasuries (TLT)' }],
  INR: [{ symbol: 'NIFTY:NSE', name: 'Nifty 50' }, { symbol: 'SENSEX:BSE', name: 'Sensex' }],
} as const

export type RiskAllocation = { symbol: string; weight: number }
export type RiskSeries = { symbol: string; points: PriceObservation[] }
export type ShockAxis = { key: string; label: string; exposure: number[] }
const day = 86_400_000
const uniqueCloses = (points: PriceObservation[]) => {
  const closes = new Map<string, number>()
  for (const { date, close } of points) closes.set(date, closes.has(date) || !Number.isFinite(close) || close <= 0 ? NaN : close)
  return closes
}

export function sharedCloses(series: RiskSeries[]) {
  const maps = series.map(source => uniqueCloses(source.points))
  if (!maps.length) return []
  return [...maps[0].keys()].sort().flatMap(date => {
    const closes = maps.map(map => map.get(date) ?? NaN)
    return closes.every(Number.isFinite) ? [{ date, closes }] : []
  })
}

export function markedAllocation(series: RiskSeries[], shares: number[], cash: number) {
  const mark = sharedCloses(series).at(-1)
  if (!mark || shares.length !== series.length || shares.some(value => !Number.isFinite(value) || value <= 0) || !Number.isFinite(cash) || cash < 0) return null
  const marks = mark.closes.map((close, i) => shares[i] * close)
  const capital = marks.reduce((sum, value) => sum + value, cash)
  if (!Number.isFinite(capital) || capital <= 0) return null
  return { capital, date: mark.date, allocation: series.map(({ symbol }, i) => ({ symbol, weight: marks[i] / capital })), cashWeight: cash / capital }
}

export function riskReturns(series: RiskSeries[], days: number) {
  const aligned = alignDailyReturns(series.map(source => source.points))
  const through = sharedCloses(series).at(-1)?.date
  const cutoff = Date.parse(through ?? '') - days * day
  let gaps = 0
  return aligned.rows.flatMap(row => {
    const from = Date.parse(row.from)
    if (Date.parse(row.date) - from > 7 * day) { gaps++; return [] }
    return from >= cutoff ? [{ ...row, segment: row.segment + gaps }] : []
  })
}

type Rows = ReturnType<typeof riskReturns>
export function portfolioRiskMetrics(rows: Rows, allocation: RiskAllocation[]) {
  if (rows.length < 30 || !allocation.length || rows[0].values.length !== allocation.length) return null
  const returns = rows.map(row => row.values.reduce((sum, value, i) => sum + value * allocation[i].weight, 0))
  const sorted = [...returns].sort((a, b) => a - b)
  const tail = Math.ceil(returns.length * 0.05)
  let worst: { drawdown: number; segmentCount: number } | null = null
  for (let start = 0; start < rows.length;) {
    let end = start + 1
    while (end < rows.length && rows[end].segment === rows[start].segment) end++
    const segmentCount = end - start
    if (segmentCount >= 30) {
      let wealth = 1, peak = 1, drawdown = 0
      for (let i = start; i < end; i++) {
        wealth *= 1 + returns[i]
        peak = Math.max(peak, wealth)
        drawdown = Math.max(drawdown, 1 - wealth / peak)
      }
      if (Number.isFinite(drawdown) && (!worst || drawdown > worst.drawdown)) worst = { drawdown, segmentCount }
    }
    start = end
  }
  return {
    volatility: sampleDeviation(returns) * Math.sqrt(252),
    var95: returns.length >= 100 ? Math.max(0, -quantile(sorted, 0.05)) : null,
    cvar95: returns.length >= 100 ? Math.max(0, -sorted.slice(0, tail).reduce((sum, value) => sum + value, 0) / tail) : null,
    drawdown: worst?.drawdown ?? null,
    segmentCount: worst?.segmentCount ?? 0,
  }
}

export function rollingRiskCorrelation(rows: Rows, symbols: string[], window: number) {
  const pairs = symbols.flatMap((left, a) => symbols.slice(a + 1).map((right, b) => ({ id: `${a}-${a + b + 1}`, label: `${left} / ${right}`, left, right, a, b: a + b + 1 })))
  const dates = rows.slice(window - 1).map(row => row.date)
  let highest: { value: number; label: string; date: string } | null = null
  const values = dates.map((date, i) => {
    const end = i + window - 1
    if (rows[i].segment !== rows[end].segment) return pairs.map(() => null)
    return pairs.map(({ a, b, label }) => {
      let meanA = 0, meanB = 0, cov = 0, varA = 0, varB = 0
      for (let j = i; j <= end; j++) {
        const [x, y] = [rows[j].values[a], rows[j].values[b]]
        const dx = x - meanA, dy = y - meanB, count = j - i + 1
        meanA += dx / count
        meanB += dy / count
        varA += dx * (x - meanA)
        varB += dy * (y - meanB)
        cov += dx * (y - meanB)
      }
      if (varA <= 1e-18 || varB <= 1e-18) return null
      const value = Math.max(-1, Math.min(1, cov / Math.sqrt(varA * varB)))
      if (!highest || value > highest.value) highest = { value, label, date }
      return value
    })
  })
  return { dates, pairs, values, highest: highest as { value: number; label: string; date: string } | null }
}

export function replayWindow(series: RiskSeries[], start: string, end: string) {
  const common = sharedCloses(series).filter(row => row.date >= start && row.date <= end)
  const first = common[0], last = common.at(-1)
  if (!first || !last || first.date === last.date || Date.parse(first.date) - Date.parse(start) > 7 * day || Date.parse(end) - Date.parse(last.date) > 7 * day) return null
  const shocks = last.closes.map((close, i) => (close / first.closes[i] - 1) * 100)
  return shocks.every(Number.isFinite) ? { start: first.date, end: last.date, shocks } : null
}

export function factorExposures(assets: RiskSeries[], factors: RiskSeries[], days: number) {
  if (factors.length !== 2 || !assets.length) return null
  const rows = riskReturns([...assets, ...factors], days)
  const predictors = factors.map((_, i) => rows.map(row => row.values[assets.length + i]))
  const fits = assets.map((_, i) => fitFactors(rows.map(row => row.values[i]), predictors))
  if (fits.some(fit => !fit)) return null
  return { observations: rows.length, exposures: factors.map((_, i) => fits.map(fit => fit!.coefficients[i])) }
}

export function stressPoint(capital: number, allocation: RiskAllocation[], a: ShockAxis, b: ShockAxis, x: number, y: number, base: number[] = []) {
  const contributions = allocation.map(({ symbol, weight }, i) => {
    const rawShock = (base[i] ?? 0) + a.exposure[i] * x + b.exposure[i] * y
    const shock = Math.max(-100, rawShock)
    return { symbol, weight, shock, pnl: capital * weight * shock / 100, floored: rawShock < -100 }
  })
  const pnl = contributions.reduce((sum, item) => sum + item.pnl, 0)
  return { pnl, endingValue: capital + pnl, contributions, worst: [...contributions].sort((left, right) => left.pnl - right.pnl).find(item => item.pnl < 0) }
}
