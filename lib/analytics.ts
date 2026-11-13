export type PricePoint = { datetime: string; close: number; open?: number; high?: number; low?: number; volume?: number }
export type StrategyKind = 'sma-crossover' | 'ema-crossover' | 'rsi-reversal'
export type BacktestConfig = { strategy: StrategyKind; fastWindow: number; slowWindow: number; initialCapital: number; commissionBps: number; slippageBps: number; allocationPct: number; rsiOversold: number; rsiOverbought: number }
export type BacktestTrade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; return: number; pnl: number; shares: number; barsHeld: number }
export type EquityPoint = { datetime: string; value: number; benchmark: number }
export type BacktestResult = { equity: EquityPoint[]; trades: BacktestTrade[]; totalReturn: number | null; annualizedReturn: number | null; annualizedVolatility: number | null; sharpe: number | null; sortino: number | null; maxDrawdown: number | null; winRate: number | null; profitFactor: number | null; exposure: number | null; turnover: number | null }

export function cleanPrices(points: PricePoint[]): PricePoint[] { return points.filter(point => Number.isFinite(point.close) && point.close > 0 && point.datetime).sort((a, b) => a.datetime.localeCompare(b.datetime)) }
export function dailyReturns(points: PricePoint[]): number[] { const prices = cleanPrices(points); return prices.slice(1).map((point, index) => point.close / prices[index].close - 1).filter(Number.isFinite) }
export function mean(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
export function sampleStandardDeviation(values: number[]): number | null { if (values.length < 2) return null; const average = mean(values) ?? 0; return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) }
export function annualizedVolatility(values: number[], periods = 252): number | null { const deviation = sampleStandardDeviation(values); return deviation == null ? null : deviation * Math.sqrt(periods) }
export function sharpeRatio(values: number[], annualRiskFreeRate = 0, periods = 252): number | null { const deviation = sampleStandardDeviation(values); if (deviation == null || deviation === 0) return null; return ((mean(values) ?? 0) - annualRiskFreeRate / periods) / deviation * Math.sqrt(periods) }
export function downsideDeviation(values: number[], minimumAcceptableReturn = 0): number | null { if (!values.length) return null; return Math.sqrt(values.reduce((sum, value) => sum + Math.min(value - minimumAcceptableReturn, 0) ** 2, 0) / values.length) }
export function sortinoRatio(values: number[], annualRiskFreeRate = 0, periods = 252): number | null { if (values.length < 2) return null; const target = annualRiskFreeRate / periods; const downside = downsideDeviation(values, target); if (downside == null || downside === 0) return null; return ((mean(values) ?? 0) - target) / downside * Math.sqrt(periods) }
export function quantile(values: number[], probability: number): number | null { if (!values.length || probability < 0 || probability > 1) return null; const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * probability; const lower = Math.floor(position); const upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower) }
export function historicalVaR(values: number[], confidence = 0.95): number | null { return confidence <= 0 || confidence >= 1 ? null : quantile(values, 1 - confidence) }
export function historicalCVaR(values: number[], confidence = 0.95): number | null { const threshold = historicalVaR(values, confidence); if (threshold == null) return null; return mean(values.filter(value => value <= threshold)) }
export function maxDrawdown(points: PricePoint[]): number | null { const prices = cleanPrices(points).map(point => point.close); if (!prices.length) return null; let peak = prices[0], drawdown = 0; for (const price of prices) { peak = Math.max(peak, price); drawdown = Math.min(drawdown, price / peak - 1) } return drawdown }
export function periodReturn(points: PricePoint[]): number | null { const prices = cleanPrices(points); return prices.length >= 2 ? prices.at(-1)!.close / prices[0].close - 1 : null }
export function compoundAnnualGrowthRate(points: PricePoint[], periods = 252): number | null { const prices = cleanPrices(points); if (prices.length < 2) return null; const elapsedDays = Math.max(1, (Date.parse(prices.at(-1)!.datetime) - Date.parse(prices[0].datetime)) / 86_400_000); return (prices.at(-1)!.close / prices[0].close) ** (365.2425 / elapsedDays) - 1 }
export function calmarRatio(points: PricePoint[]): number | null { const drawdown = maxDrawdown(points), cagr = compoundAnnualGrowthRate(points); return cagr == null || drawdown == null || drawdown === 0 ? null : cagr / Math.abs(drawdown) }
export function simpleMovingAverage(values: number[], window: number): (number | null)[] { if (!Number.isInteger(window) || window < 1) return values.map(() => null); return values.map((_, index) => index + 1 < window ? null : mean(values.slice(index + 1 - window, index + 1))) }
export function exponentialMovingAverage(values: number[], window: number): (number | null)[] { if (!Number.isInteger(window) || window < 1 || values.length < window) return values.map(() => null); const result: (number | null)[] = values.map(() => null); let previous = mean(values.slice(0, window)); result[window - 1] = previous; const multiplier = 2 / (window + 1); for (let index = window; index < values.length; index += 1) { previous = (values[index] - (previous ?? values[index])) * multiplier + (previous ?? values[index]); result[index] = previous } return result }
export function relativeStrengthIndex(values: number[], window = 14): number | null { if (values.length <= window || window < 1) return null; const changes = values.slice(1).map((value, index) => value - values[index]); let averageGain = mean(changes.slice(0, window).map(value => Math.max(value, 0))) ?? 0; let averageLoss = mean(changes.slice(0, window).map(value => Math.max(-value, 0))) ?? 0; for (const change of changes.slice(window)) { averageGain = (averageGain * (window - 1) + Math.max(change, 0)) / window; averageLoss = (averageLoss * (window - 1) + Math.max(-change, 0)) / window } return averageLoss === 0 ? averageGain === 0 ? 50 : 100 : 100 - 100 / (1 + averageGain / averageLoss) }
export function rsiSeries(values: number[], window = 14): (number | null)[] { return values.map((_, index) => index < window ? null : relativeStrengthIndex(values.slice(0, index + 1), window)) }
export function correlation(left: number[], right: number[]): number | null { const length = Math.min(left.length, right.length); if (length < 2) return null; const x = left.slice(-length), y = right.slice(-length), mx = mean(x) ?? 0, my = mean(y) ?? 0; const covariance = x.reduce((sum, value, index) => sum + (value - mx) * (y[index] - my), 0); const denominator = Math.sqrt(x.reduce((sum, value) => sum + (value - mx) ** 2, 0) * y.reduce((sum, value) => sum + (value - my) ** 2, 0)); return denominator ? covariance / denominator : null }

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = { strategy: 'sma-crossover', fastWindow: 20, slowWindow: 50, initialCapital: 100000, commissionBps: 5, slippageBps: 2, allocationPct: 100, rsiOversold: 30, rsiOverbought: 70 }
function emptyBacktest(): BacktestResult { return { equity: [], trades: [], totalReturn: null, annualizedReturn: null, annualizedVolatility: null, sharpe: null, sortino: null, maxDrawdown: null, winRate: null, profitFactor: null, exposure: null, turnover: null } }

export function runBacktest(input: PricePoint[], config: BacktestConfig): BacktestResult {
  const bars = cleanPrices(input)
  const { strategy, fastWindow, slowWindow, initialCapital, commissionBps, slippageBps, allocationPct, rsiOversold, rsiOverbought } = config
  if (bars.length < Math.max(3, slowWindow + 2) || !Number.isInteger(fastWindow) || !Number.isInteger(slowWindow) || fastWindow < 2 || fastWindow >= slowWindow || !Number.isFinite(initialCapital) || initialCapital <= 0 || commissionBps < 0 || slippageBps < 0 || allocationPct <= 0 || allocationPct > 100) return emptyBacktest()
  const closes = bars.map(bar => bar.close)
  const fast = strategy === 'ema-crossover' ? exponentialMovingAverage(closes, fastWindow) : simpleMovingAverage(closes, fastWindow)
  const slow = strategy === 'ema-crossover' ? exponentialMovingAverage(closes, slowWindow) : simpleMovingAverage(closes, slowWindow)
  const rsi = strategy === 'rsi-reversal' ? rsiSeries(closes, fastWindow) : []
  const friction = (commissionBps + slippageBps) / 10_000
  let cash = initialCapital, shares = 0, entryPrice = 0, entryDate = '', entryIndex = 0, investedBars = 0, turnover = 0
  const equity: EquityPoint[] = [], trades: BacktestTrade[] = []
  for (let index = 1; index < bars.length; index += 1) {
    const signalIndex = index - 1
    const previousIndex = signalIndex - 1
    const enter = strategy === 'rsi-reversal'
      ? rsi[previousIndex] != null && rsi[signalIndex] != null && rsi[previousIndex]! <= rsiOversold && rsi[signalIndex]! > rsiOversold
      : fast[previousIndex] != null && slow[previousIndex] != null && fast[signalIndex] != null && slow[signalIndex] != null && fast[previousIndex]! <= slow[previousIndex]! && fast[signalIndex]! > slow[signalIndex]!
    const exit = strategy === 'rsi-reversal'
      ? rsi[previousIndex] != null && rsi[signalIndex] != null && rsi[previousIndex]! < rsiOverbought && rsi[signalIndex]! >= rsiOverbought
      : fast[previousIndex] != null && slow[previousIndex] != null && fast[signalIndex] != null && slow[signalIndex] != null && fast[previousIndex]! >= slow[previousIndex]! && fast[signalIndex]! < slow[signalIndex]!
    const executionPrice = index === bars.length - 1 && shares > 0 && !exit ? bars[index].close : bars[index].open ?? bars[index].close
    if (shares === 0 && enter) {
      const notional = cash * allocationPct / 100
      shares = notional / (executionPrice * (1 + friction))
      cash -= shares * executionPrice * (1 + friction)
      entryPrice = executionPrice
      entryDate = bars[index].datetime
      entryIndex = index
      turnover += shares * executionPrice
    } else if (shares > 0 && (exit || index === bars.length - 1)) {
      const proceeds = shares * executionPrice * (1 - friction)
      const pnl = proceeds - shares * entryPrice * (1 + friction)
      cash += proceeds
      turnover += shares * executionPrice
      trades.push({ entryDate, exitDate: bars[index].datetime, entryPrice, exitPrice: executionPrice, return: (executionPrice * (1 - friction)) / (entryPrice * (1 + friction)) - 1, pnl, shares, barsHeld: index - entryIndex })
      shares = 0
    }
    if (shares > 0) investedBars += 1
    const value = cash + shares * bars[index].close
    equity.push({ datetime: bars[index].datetime, value, benchmark: initialCapital * bars[index].close / bars[0].close })
  }
  const values = equity.map(point => point.value), returns = values.slice(1).map((value, index) => value / values[index] - 1).filter(Number.isFinite)
  const totalReturn = values.length ? values.at(-1)! / initialCapital - 1 : null
  const drawdown = maxDrawdown(equity.map(point => ({ datetime: point.datetime, close: point.value })))
  const winners = trades.filter(trade => trade.pnl > 0), losers = trades.filter(trade => trade.pnl < 0)
  return { equity, trades, totalReturn, annualizedReturn: compoundAnnualGrowthRate(equity.map(point => ({ datetime: point.datetime, close: point.value }))), annualizedVolatility: annualizedVolatility(returns), sharpe: sharpeRatio(returns), sortino: sortinoRatio(returns), maxDrawdown: drawdown, winRate: trades.length ? winners.length / trades.length : null, profitFactor: losers.length ? winners.reduce((sum, trade) => sum + trade.pnl, 0) / Math.abs(losers.reduce((sum, trade) => sum + trade.pnl, 0)) : null, exposure: bars.length > 1 ? investedBars / (bars.length - 1) : null, turnover: turnover / initialCapital }
}
export function backtestSmaCrossover(points: PricePoint[], fastWindow = 20, slowWindow = 50, initialCapital = 100000, commissionBps = 5, slippageBps = 2): BacktestResult { return runBacktest(points, { ...DEFAULT_BACKTEST_CONFIG, fastWindow, slowWindow, initialCapital, commissionBps, slippageBps }) }
export function portfolioWeightedReturn(series: { points: PricePoint[]; weight: number }[]): PricePoint[] { if (!series.length || series.some(item => item.weight < 0) || Math.abs(series.reduce((sum, item) => sum + item.weight, 0) - 1) > .001) return []; const maps = series.map(({ points }) => new Map(cleanPrices(points).map(point => [point.datetime, point.close]))); const dates = [...maps[0].keys()].filter(date => maps.every(map => map.has(date))).sort(); if (!dates.length) return []; const bases = maps.map(map => map.get(dates[0])!); return dates.map(datetime => ({ datetime, close: series.reduce((sum, item, index) => sum + item.weight * maps[index].get(datetime)! / bases[index], 0) })) }
export function safeNumber(value: number | null): number | null { return value != null && Number.isFinite(value) ? value : null }
export const DEFAULT_ANNUAL_RISK_FREE_RATE = 0
export const TRADING_PERIODS_PER_YEAR = 252
