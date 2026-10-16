export type PricePoint = { datetime: string; close: number }

export function cleanPrices(points: PricePoint[]): PricePoint[] {
  return points
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && point.datetime)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
}

export function dailyReturns(points: PricePoint[]): number[] {
  const prices = cleanPrices(points)
  return prices.slice(1).map((point, index) => point.close / prices[index].close - 1).filter(Number.isFinite)
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null
  const average = mean(values) ?? 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

export function annualizedVolatility(values: number[], periods = 252): number | null {
  const deviation = sampleStandardDeviation(values)
  return deviation == null ? null : deviation * Math.sqrt(periods)
}

export function sharpeRatio(values: number[], annualRiskFreeRate = 0, periods = 252): number | null {
  const deviation = sampleStandardDeviation(values)
  if (deviation == null || deviation === 0) return null
  return ((mean(values) ?? 0) - annualRiskFreeRate / periods) / deviation * Math.sqrt(periods)
}

export function downsideDeviation(values: number[], minimumAcceptableReturn = 0): number | null {
  if (!values.length) return null
  return Math.sqrt(values.reduce((sum, value) => sum + Math.min(value - minimumAcceptableReturn, 0) ** 2, 0) / values.length)
}

export function historicalVaR(values: number[], confidence = 0.95): number | null {
  if (!values.length || confidence <= 0 || confidence >= 1) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((1 - confidence) * sorted.length) - 1))
  return sorted[index]
}

export function historicalCVaR(values: number[], confidence = 0.95): number | null {
  const threshold = historicalVaR(values, confidence)
  if (threshold == null) return null
  const tail = values.filter((value) => value <= threshold)
  return tail.length ? mean(tail) : null
}

export function maxDrawdown(points: PricePoint[]): number | null {
  const prices = cleanPrices(points).map((point) => point.close)
  if (!prices.length) return null
  let peak = prices[0]
  let drawdown = 0
  for (const price of prices) {
    peak = Math.max(peak, price)
    drawdown = Math.min(drawdown, price / peak - 1)
  }
  return drawdown
}

export function periodReturn(points: PricePoint[]): number | null {
  const prices = cleanPrices(points)
  return prices.length >= 2 ? prices.at(-1)!.close / prices[0].close - 1 : null
}

export function calmarRatio(points: PricePoint[], periods = 252): number | null {
  const prices = cleanPrices(points)
  const result = periodReturn(prices)
  const drawdown = maxDrawdown(prices)
  if (result == null || drawdown == null || drawdown === 0 || prices.length < 2) return null
  const days = Math.max(1, (Date.parse(prices.at(-1)!.datetime) - Date.parse(prices[0].datetime)) / 86400000)
  const annualized = (1 + result) ** (periods / days) - 1
  return annualized / Math.abs(drawdown)
}

export function quantile(values: number[], probability: number): number | null {
  if (!values.length || probability < 0 || probability > 1) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function safeNumber(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

// Risk-free rate defaults to zero because this screen only has market prices and no treasury curve input.
export const DEFAULT_ANNUAL_RISK_FREE_RATE = 0
export const TRADING_PERIODS_PER_YEAR = 252
