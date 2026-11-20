import { cleanPrices, covarianceMatrix, DEFAULT_ANNUAL_RISK_FREE_RATE, mean, TRADING_PERIODS_PER_YEAR, type OptimizationPoint, type PricePoint } from './analytics'

export const MAX_LAB_ASSETS = 8
export const MIN_LAB_SAMPLES = 30
export const LAB_WINDOWS = { '6M': 183, '1Y': 365, '2Y': 730 } as const
export type LabWindow = keyof typeof LAB_WINDOWS
export type LabAsset = { symbol: string; currency?: string; points: PricePoint[] }
export type LabPoint = OptimizationPoint & { id: string; kind: 'candidate' | 'frontier' | 'current' | 'minimum' | 'sharpe' }
export type LabResult = {
  symbols: string[]; currency: string; start: string; end: string; valuationDate: string
  samples: number; skippedIntervals: number; searched: number; step: number
  current: LabPoint | null; minimum: LabPoint; maximum: LabPoint | null
  candidates: LabPoint[]; frontier: LabPoint[]
}

const DAY_MS = 86_400_000
const EPSILON = 1e-10

export function labConstraintError(count: number, cap: number) {
  if (count < 2 || count > MAX_LAB_ASSETS) return `Select 2–${MAX_LAB_ASSETS} assets.`
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) return 'Enter a maximum asset weight from 1% to 100% in whole percentages.'
  if (count * cap < 100) return `These limits cannot reach 100% invested. Increase the cap to at least ${Math.ceil(100 / count)}% or select more assets.`
  return null
}

function alignDailyPrices(assets: LabAsset[], window: LabWindow) {
  const maps = assets.map(asset => new Map(cleanPrices(asset.points).flatMap(point => {
    const day = new Date(`${point.datetime}T00:00:00Z`).getUTCDay()
    return day >= 1 && day <= 5 ? [[point.datetime, point.close] as const] : []
  })))
  const allDates = [...new Set(maps.flatMap(map => [...map.keys()]))].sort()
  const isCommon = (date: string) => maps.every(map => map.has(date))
  const valuationDate = allDates.findLast(isCommon)
  if (!valuationDate) return null

  const cutoff = new Date(Date.parse(valuationDate) - LAB_WINDOWS[window] * DAY_MS).toISOString().slice(0, 10)
  const dates = allDates.filter(date => date >= cutoff && date <= valuationDate)
  const returns: number[][] = maps.map(() => [])
  let start = '', end = '', skippedIntervals = 0
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1], current = dates[index]
    if (!isCommon(previous) || !isCommon(current) || Date.parse(current) - Date.parse(previous) > 7 * DAY_MS) {
      skippedIntervals += 1
      continue
    }
    const row = maps.map(map => map.get(current)! / map.get(previous)! - 1)
    if (row.some(value => !Number.isFinite(value))) { skippedIntervals += 1; continue }
    start ||= previous
    end = current
    row.forEach((value, assetIndex) => returns[assetIndex].push(value))
  }
  return { returns, start, end, valuationDate, skippedIntervals, latestCloses: maps.map(map => map.get(valuationDate)!) }
}

function capWeights(weights: number[], cap: number) {
  const result = [...weights]
  // Move excess into uncapped positions equally; repeat when redistribution hits another cap.
  while (result.some(weight => weight > cap + EPSILON)) {
    const excess = result.reduce((total, weight) => total + Math.max(0, weight - cap), 0)
    const free = result.filter(weight => weight < cap).length
    result.forEach((weight, index) => { result[index] = weight >= cap ? cap : weight + excess / free })
  }
  return result
}

function* weightLattice(count: number, remaining: number, current: number[] = []): Generator<number[]> {
  if (current.length === count - 1) { yield [...current, remaining]; return }
  for (let weight = 0; weight <= remaining; weight += 1) yield* weightLattice(count, remaining - weight, [...current, weight])
}

function evenlySample<T>(values: T[], limit: number) {
  if (values.length <= limit) return values
  return Array.from({ length: limit }, (_, index) => values[Math.round(index * (values.length - 1) / (limit - 1))])
}

export function calculateOptimizationLab(assets: LabAsset[], window: LabWindow, maxWeightPercent: number, currentShares?: number[]): { result: LabResult } | { error: string } {
  const constraintError = labConstraintError(assets.length, maxWeightPercent)
  if (constraintError) return { error: constraintError }
  const symbols = assets.map(asset => asset.symbol)
  const currency = assets[0].currency
  if (!currency || assets.some(asset => asset.currency !== currency)) return { error: 'The selected assets must have the same verified quote currency. Select a same-currency basket; the lab does not convert FX.' }
  if (assets.some(asset => !asset.points.length)) return { error: 'Daily price history is missing for one or more selected assets. Check coverage or change the basket.' }

  const aligned = alignDailyPrices(assets, window)
  const samples = aligned?.returns[0].length ?? 0
  if (!aligned || samples < MIN_LAB_SAMPLES) return { error: `Only ${samples} aligned daily returns are available. At least ${MIN_LAB_SAMPLES} are required. Try a longer period or assets with overlapping histories.` }

  const means = aligned.returns.map(series => mean(series)! * TRADING_PERIODS_PER_YEAR)
  const covariance = covarianceMatrix(aligned.returns).map(row => row.map(value => value * TRADING_PERIODS_PER_YEAR))
  if (means.some(value => !Number.isFinite(value)) || covariance.some(row => row.some(value => !Number.isFinite(value)))) return { error: 'Price history produced invalid return estimates for this basket.' }
  const point = (weights: number[], id: string, kind: LabPoint['kind']): LabPoint => {
    const expectedReturn = weights.reduce((sum, weight, index) => sum + weight * means[index], 0)
    const variance = weights.reduce((sum, weight, i) => sum + weight * weights.reduce((inner, other, j) => inner + other * covariance[i][j], 0), 0)
    const volatility = Math.sqrt(Math.max(variance, 0))
    const sharpe = volatility > EPSILON ? (expectedReturn - DEFAULT_ANNUAL_RISK_FREE_RATE) / volatility : null
    return { id, kind, weights, expectedReturn, volatility, sharpe }
  }

  const cap = maxWeightPercent / 100
  const step = assets.length <= 3 ? 1 : assets.length === 4 ? 2 : assets.length === 5 ? 5 : 10
  const units = 100 / step
  const candidates: LabPoint[] = []
  const seen = new Set<string>()
  function add(weights: number[]) {
    const key = weights.map(weight => weight.toFixed(9)).join(',')
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(point(weights, `candidate-${candidates.length + 1}`, 'candidate'))
  }
  add(assets.map(() => 1 / assets.length))
  for (const allocation of weightLattice(assets.length, units)) add(capWeights(allocation.map(value => value / units), cap))

  candidates.sort((a, b) => a.volatility - b.volatility || b.expectedReturn - a.expectedReturn)
  const minimum = { ...candidates[0], id: 'minimum', kind: 'minimum' } as const
  let bestSharpe: LabPoint | null = null
  let bestReturn = -Infinity
  const frontier: LabPoint[] = [], interior: LabPoint[] = []
  for (const candidate of candidates) {
    if (candidate.sharpe != null && (bestSharpe?.sharpe == null || candidate.sharpe > bestSharpe.sharpe)) bestSharpe = candidate
    if (candidate.expectedReturn > bestReturn + EPSILON) {
      bestReturn = candidate.expectedReturn
      frontier.push({ ...candidate, kind: 'frontier' })
    } else interior.push(candidate)
  }
  const maximum = bestSharpe ? { ...bestSharpe, id: 'sharpe', kind: 'sharpe' } as const : null
  const values = currentShares?.length === assets.length && currentShares.every(shares => Number.isFinite(shares) && shares > 0)
    ? currentShares.map((shares, index) => shares * aligned.latestCloses[index]) : []
  const totalValue = values.reduce((sum, value) => sum + value, 0)
  const current = Number.isFinite(totalValue) && totalValue > 0 ? point(values.map(value => value / totalValue), 'current', 'current') : null

  return { result: {
    symbols, currency, start: aligned.start, end: aligned.end, valuationDate: aligned.valuationDate,
    samples, skippedIntervals: aligned.skippedIntervals, searched: candidates.length, step, current, minimum, maximum,
    candidates: evenlySample(interior, 180), frontier: evenlySample(frontier, 90),
  } }
}
