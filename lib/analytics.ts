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

export function sortinoRatio(values: number[], annualRiskFreeRate = 0, periods = 252): number | null {
  if (values.length < 2) return null
  const target = annualRiskFreeRate / periods
  const downside = downsideDeviation(values, target)
  if (downside == null || downside === 0) return null
  return ((mean(values) ?? 0) - target) / downside * Math.sqrt(periods)
}

export function compoundAnnualGrowthRate(points: PricePoint[], periods = 252): number | null {
  const prices = cleanPrices(points)
  if (prices.length < 2 || prices[0].close <= 0 || prices.at(-1)!.close <= 0) return null
  return (prices.at(-1)!.close / prices[0].close) ** (periods / (prices.length - 1)) - 1
}

export function calmarRatio(points: PricePoint[], periods = 252): number | null {
  const drawdown = maxDrawdown(points)
  const cagr = compoundAnnualGrowthRate(points, periods)
  if (cagr == null || drawdown == null || drawdown === 0) return null
  return cagr / Math.abs(drawdown)
}

export function simpleMovingAverage(values: number[], window: number): (number | null)[] {
  if (!Number.isInteger(window) || window < 1) return values.map(() => null)
  return values.map((_, index) => index + 1 < window ? null : mean(values.slice(index + 1 - window, index + 1)))
}

export function exponentialMovingAverage(values: number[], window: number): (number | null)[] {
  if (!Number.isInteger(window) || window < 1 || values.length < window) return values.map(() => null)
  const result: (number | null)[] = values.map(() => null)
  let previous = mean(values.slice(0, window))
  result[window - 1] = previous
  const multiplier = 2 / (window + 1)
  for (let index = window; index < values.length; index += 1) {
    previous = (values[index] - (previous ?? values[index])) * multiplier + (previous ?? values[index])
    result[index] = previous
  }
  return result
}

export function relativeStrengthIndex(values: number[], window = 14): number | null {
  if (values.length <= window || window < 1) return null
  const changes = values.slice(1).map((value, index) => value - values[index])
  const gains = changes.slice(0, window).map((value) => Math.max(value, 0))
  const losses = changes.slice(0, window).map((value) => Math.max(-value, 0))
  let averageGain = mean(gains) ?? 0
  let averageLoss = mean(losses) ?? 0
  for (const change of changes.slice(window)) {
    averageGain = (averageGain * (window - 1) + Math.max(change, 0)) / window
    averageLoss = (averageLoss * (window - 1) + Math.max(-change, 0)) / window
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100
  return 100 - 100 / (1 + averageGain / averageLoss)
}

export function quantile(values: number[], probability: number): number | null {
  if (!values.length || probability < 0 || probability > 1) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export type BacktestTrade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; return: number; pnl: number }
export type BacktestResult = { equity: { datetime: string; value: number }[]; trades: BacktestTrade[]; totalReturn: number | null; maxDrawdown: number | null; winRate: number | null; profitFactor: number | null; exposure: number | null; turnover: number | null }

/** Deterministic next-bar-open SMA crossover simulation. Signals are formed at close and execute on the next bar. */
export function backtestSmaCrossover(points: PricePoint[], fastWindow = 20, slowWindow = 50, initialCapital = 100000, commissionBps = 5, slippageBps = 2): BacktestResult {
  const prices = cleanPrices(points)
  if (prices.length < slowWindow + 2 || fastWindow < 1 || fastWindow >= slowWindow) return { equity: [], trades: [], totalReturn: null, maxDrawdown: null, winRate: null, profitFactor: null, exposure: null, turnover: null }
  const closes = prices.map((point) => point.close)
  const fast = simpleMovingAverage(closes, fastWindow)
  const slow = simpleMovingAverage(closes, slowWindow)
  let cash = initialCapital
  let shares = 0
  let entryPrice = 0
  let entryDate = ''
  let invested = 0
  let turnover = 0
  const equity: { datetime: string; value: number }[] = []
  const trades: BacktestTrade[] = []
  const friction = (commissionBps + slippageBps) / 10000
  for (let index = 1; index < prices.length; index += 1) {
    const signal = fast[index - 1] != null && slow[index - 1] != null && fast[index - 1]! > slow[index - 1]!
    const open = prices[index].close
    if (signal && shares === 0) { shares = cash / (open * (1 + friction)); cash -= shares * open * (1 + friction); entryPrice = open; entryDate = prices[index].datetime; invested += 1 }
    if ((!signal || index === prices.length - 1) && shares > 0) { const exitPrice = open; const pnl = shares * (exitPrice - entryPrice) - shares * exitPrice * friction - shares * entryPrice * friction; cash += shares * exitPrice * (1 - friction); trades.push({ entryDate, exitDate: prices[index].datetime, entryPrice, exitPrice, return: exitPrice / entryPrice - 1 - friction * 2, pnl }); turnover += Math.abs(shares * entryPrice) + Math.abs(shares * exitPrice); shares = 0 }
    equity.push({ datetime: prices[index].datetime, value: cash + shares * open })
  }
  const values = equity.map((point) => point.value)
  const totalReturn = values.length ? values.at(-1)! / initialCapital - 1 : null
  const maxDrawdownValue = maxDrawdown(equity.map((point) => ({ datetime: point.datetime, close: point.value })))
  const winners = trades.filter((trade) => trade.pnl > 0), losers = trades.filter((trade) => trade.pnl < 0)
  return { equity, trades, totalReturn, maxDrawdown: maxDrawdownValue, winRate: trades.length ? winners.length / trades.length : null, profitFactor: losers.length ? winners.reduce((sum, trade) => sum + trade.pnl, 0) / Math.abs(losers.reduce((sum, trade) => sum + trade.pnl, 0)) : null, exposure: prices.length ? invested / prices.length : null, turnover: initialCapital ? turnover / initialCapital : null }
}

export function portfolioWeightedReturn(series: { points: PricePoint[]; weight: number }[]): PricePoint[] {
  if (!series.length) return []
  const maps = series.map(({ points }) => new Map(cleanPrices(points).map((point) => [point.datetime, point.close])))
  const dates = [...maps[0].keys()].filter((date) => maps.every((map) => map.has(date))).sort()
  if (!dates.length) return []
  const bases = maps.map((map) => map.get(dates[0])!)
  return dates.map((datetime) => ({ datetime, close: series.reduce((sum, item, index) => sum + item.weight * (maps[index].get(datetime)! / bases[index]), 0) }))
}

export function safeNumber(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

// Risk-free rate defaults to zero because this screen only has market prices and no treasury curve input.
export const DEFAULT_ANNUAL_RISK_FREE_RATE = 0
export const TRADING_PERIODS_PER_YEAR = 252
