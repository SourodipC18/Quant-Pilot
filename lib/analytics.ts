export type PricePoint = { datetime: string; close: number; open?: number; high?: number; low?: number; volume?: number }
export type StrategyKind = 'sma-crossover' | 'ema-crossover' | 'rsi-reversal'
export type BacktestConfig = { strategy: StrategyKind; fastWindow: number; slowWindow: number; initialCapital: number; commissionBps: number; slippageBps: number; marketImpactBps?: number; allocationPct: number; rsiOversold: number; rsiOverbought: number }
export type BacktestTrade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; return: number; pnl: number; costs: number; shares: number; barsHeld: number }
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

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = { strategy: 'sma-crossover', fastWindow: 20, slowWindow: 50, initialCapital: 100000, commissionBps: 5, slippageBps: 2, marketImpactBps: 0, allocationPct: 100, rsiOversold: 30, rsiOverbought: 70 }
function emptyBacktest(): BacktestResult { return { equity: [], trades: [], totalReturn: null, annualizedReturn: null, annualizedVolatility: null, sharpe: null, sortino: null, maxDrawdown: null, winRate: null, profitFactor: null, exposure: null, turnover: null } }

export function runBacktest(input: PricePoint[], config: BacktestConfig): BacktestResult {
  const bars = cleanPrices(input)
  const { strategy, fastWindow, slowWindow, initialCapital, commissionBps, slippageBps, marketImpactBps = 0, allocationPct, rsiOversold, rsiOverbought } = config
  if (bars.length < Math.max(3, slowWindow + 2) || !Number.isInteger(fastWindow) || !Number.isInteger(slowWindow) || fastWindow < 2 || fastWindow >= slowWindow || !Number.isFinite(initialCapital) || initialCapital <= 0 || !Number.isFinite(commissionBps) || commissionBps < 0 || !Number.isFinite(slippageBps) || slippageBps < 0 || !Number.isFinite(marketImpactBps) || marketImpactBps < 0 || allocationPct <= 0 || allocationPct > 100) return emptyBacktest()
  const closes = bars.map(bar => bar.close)
  const fast = strategy === 'ema-crossover' ? exponentialMovingAverage(closes, fastWindow) : simpleMovingAverage(closes, fastWindow)
  const slow = strategy === 'ema-crossover' ? exponentialMovingAverage(closes, slowWindow) : simpleMovingAverage(closes, slowWindow)
  const rsi = strategy === 'rsi-reversal' ? rsiSeries(closes, fastWindow) : []
  const friction = (commissionBps + slippageBps + marketImpactBps) / 10_000
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
      trades.push({ entryDate, exitDate: bars[index].datetime, entryPrice, exitPrice: executionPrice, return: (executionPrice * (1 - friction)) / (entryPrice * (1 + friction)) - 1, pnl, costs: shares * (entryPrice + executionPrice) * friction, shares, barsHeld: index - entryIndex })
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

export type RegressionRiskMetrics = { alpha: number | null; beta: number | null; correlation: number | null; trackingError: number | null; informationRatio: number | null }
export function regressionRiskMetrics(strategyReturns: number[], benchmarkReturns: number[], annualRiskFreeRate = 0, periods = TRADING_PERIODS_PER_YEAR): RegressionRiskMetrics {
  const length = Math.min(strategyReturns.length, benchmarkReturns.length)
  if (length < 2 || periods <= 0) return { alpha: null, beta: null, correlation: null, trackingError: null, informationRatio: null }
  const strategy = strategyReturns.slice(-length), benchmark = benchmarkReturns.slice(-length)
  const strategyExcess = strategy.map(value => value - annualRiskFreeRate / periods)
  const benchmarkExcess = benchmark.map(value => value - annualRiskFreeRate / periods)
  const benchmarkStd = sampleStandardDeviation(benchmarkExcess) ?? 0
  const benchmarkVariance = benchmarkStd ** 2
  const strategyMean = mean(strategyExcess) ?? 0, benchmarkMean = mean(benchmarkExcess) ?? 0
  const beta = benchmarkVariance ? strategyExcess.reduce((sum, value, index) => sum + (value - strategyMean) * (benchmarkExcess[index] - benchmarkMean), 0) / ((length - 1) * benchmarkVariance) : null
  const active = strategy.map((value, index) => value - benchmark[index])
  const trackingError = annualizedVolatility(active, periods)
  return { alpha: beta == null ? null : ((mean(strategyExcess) ?? 0) - beta * (mean(benchmarkExcess) ?? 0)) * periods, beta, correlation: correlation(strategy, benchmark), trackingError, informationRatio: trackingError && trackingError > 0 ? (mean(active) ?? 0) * periods / trackingError : null }
}

export type TradeExpectancy = { expectancy: number | null; averageWin: number | null; averageLoss: number | null; payoffRatio: number | null; winRate: number | null; profitFactor: number | null }
export function tradeExpectancy(trades: BacktestTrade[]): TradeExpectancy {
  if (!trades.length) return { expectancy: null, averageWin: null, averageLoss: null, payoffRatio: null, winRate: null, profitFactor: null }
  const winners = trades.filter(trade => trade.pnl > 0), losers = trades.filter(trade => trade.pnl < 0)
  const averageWin = mean(winners.map(trade => trade.pnl)), averageLoss = mean(losers.map(trade => trade.pnl))
  const winRate = winners.length / trades.length
  const payoffRatio = averageWin != null && averageLoss != null && averageLoss !== 0 ? averageWin / Math.abs(averageLoss) : null
  return { expectancy: mean(trades.map(trade => trade.pnl)), averageWin, averageLoss, payoffRatio, winRate, profitFactor: losers.length ? winners.reduce((sum, trade) => sum + trade.pnl, 0) / Math.abs(losers.reduce((sum, trade) => sum + trade.pnl, 0)) : null }
}

export type WalkForwardFold = { trainStart: string; trainEnd: string; testStart: string; testEnd: string; fastWindow: number; slowWindow: number; trainingSharpe: number | null; outOfSampleReturn: number | null }
export function walkForwardValidation(input: PricePoint[], config: BacktestConfig, options: { trainBars: number; testBars: number; rolling?: boolean; candidates?: { fastWindow: number; slowWindow: number }[] }): WalkForwardFold[] {
  const bars = cleanPrices(input), { trainBars, testBars, rolling = false, candidates = [{ fastWindow: 10, slowWindow: 30 }, { fastWindow: 20, slowWindow: 50 }, { fastWindow: 30, slowWindow: 100 }] } = options
  if (!Number.isInteger(trainBars) || !Number.isInteger(testBars) || trainBars < 5 || testBars < 1 || !candidates.length) return []
  const folds: WalkForwardFold[] = []
  for (let testStart = trainBars; testStart < bars.length; testStart += testBars) {
    const trainStart = rolling ? Math.max(0, testStart - trainBars) : 0
    const train = bars.slice(trainStart, testStart)
    const testEnd = Math.min(bars.length, testStart + testBars)
    const valid = candidates.filter(candidate => candidate.fastWindow >= 2 && candidate.fastWindow < candidate.slowWindow && train.length >= candidate.slowWindow + 2)
    if (!valid.length || testEnd <= testStart) continue
    const selected = valid.map(candidate => ({ ...candidate, result: runBacktest(train, { ...config, strategy: 'sma-crossover', ...candidate }) })).sort((a, b) => (b.result.sharpe ?? -Infinity) - (a.result.sharpe ?? -Infinity))[0]
    const fullResult = runBacktest(bars.slice(0, testEnd), { ...config, strategy: 'sma-crossover', fastWindow: selected.fastWindow, slowWindow: selected.slowWindow })
    const startEquity = fullResult.equity[testStart - 2]?.value
    const endEquity = fullResult.equity.at(-1)?.value
    folds.push({ trainStart: train[0].datetime, trainEnd: train.at(-1)!.datetime, testStart: bars[testStart].datetime, testEnd: bars[testEnd - 1].datetime, fastWindow: selected.fastWindow, slowWindow: selected.slowWindow, trainingSharpe: selected.result.sharpe, outOfSampleReturn: startEquity && endEquity != null ? endEquity / startEquity - 1 : null })
  }
  return folds
}

export type MonteCarloResult = { fan: { step: number; p05: number; median: number; p95: number }[]; terminalP05: number | null; terminalMedian: number | null; terminalP95: number | null; probabilityOfLoss: number | null; maxDrawdownP05: number | null; paths: number; steps: number }
export function monteCarloBootstrap(returns: number[], initialCapital: number, steps = 252, paths = 1000, seed = 42): MonteCarloResult {
  if (returns.length < 2 || !Number.isFinite(initialCapital) || initialCapital <= 0 || !Number.isInteger(steps) || steps < 1 || !Number.isInteger(paths) || paths < 1) return { fan: [], terminalP05: null, terminalMedian: null, terminalP95: null, probabilityOfLoss: null, maxDrawdownP05: null, paths: 0, steps: 0 }
  const generator = { value: (seed >>> 0) || 1 }
  const random = () => { generator.value = (1664525 * generator.value + 1013904223) >>> 0; return generator.value / 4_294_967_296 }
  const samples: number[][] = Array.from({ length: steps + 1 }, () => [])
  const drawdowns: number[] = [], terminalValues: number[] = []
  const safeReturns = returns.filter(value => Number.isFinite(value) && value > -1)
  if (safeReturns.length < 2) return { fan: [], terminalP05: null, terminalMedian: null, terminalP95: null, probabilityOfLoss: null, maxDrawdownP05: null, paths: 0, steps: 0 }
  for (let path = 0; path < paths; path += 1) {
    let value = initialCapital, peak = value, maxDD = 0
    samples[0].push(value)
    for (let step = 1; step <= steps; step += 1) {
      value *= 1 + safeReturns[Math.floor(random() * safeReturns.length)]
      peak = Math.max(peak, value)
      maxDD = Math.min(maxDD, value / peak - 1)
      samples[step].push(value)
    }
    terminalValues.push(value); drawdowns.push(maxDD)
  }
  const fan = samples.map((values, step) => ({ step, p05: quantile(values, 0.05)!, median: quantile(values, 0.5)!, p95: quantile(values, 0.95)! }))
  return { fan, terminalP05: quantile(terminalValues, 0.05), terminalMedian: quantile(terminalValues, 0.5), terminalP95: quantile(terminalValues, 0.95), probabilityOfLoss: terminalValues.filter(value => value < initialCapital).length / paths, maxDrawdownP05: quantile(drawdowns, 0.05), paths, steps }
}
