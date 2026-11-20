import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { PROVIDER_LABELS, providerForSymbol, symbolParts, SYMBOL_PATTERN, type ProviderId } from './market-instruments'
import { marketDataProvider, validateHistory, type ProviderHistory } from './market-data'
import { displayPercent as pct, methodInfo, type EvidenceChart, type ResearchEvidence } from './research-evidence'
import { allocationError, SAMPLE_HISTORY_SIZE } from './sample-portfolios'
import { readSampleHistory } from './sample-analytics'
import { alignDailyReturns, bootstrapScenarios, evaluateForecast, fitFactors, marketRegimes, quantile, REGIME_LABELS, type PriceObservation } from './research-methods'

const symbol = z.string().trim().toUpperCase().regex(SYMBOL_PATTERN)
const lookback = z.number().refine(value => [252, 504, 756].includes(value))
export const researchInput = z.discriminatedUnion('method', [
  z.object({ method: z.literal('regimes'), symbol, lookback }),
  z.object({ method: z.literal('factors'), symbols: z.array(symbol).min(1).max(3), lookback }),
  z.object({ method: z.literal('forecast'), symbol, lookback, horizon: z.number().refine(value => [1, 5, 10, 20].includes(value)) }),
  z.object({ method: z.literal('scenarios'), symbols: z.array(symbol).min(1).max(8), weightsBps: z.array(z.number().int().min(1).max(10_000)).min(3).max(8).optional(), lookback, horizon: z.number().int().min(5).max(252), paths: z.number().int().min(100).max(4000), seed: z.number().int().min(0).max(4294967295), block: z.number().int().min(1).max(20) }),
])
export type ResearchInput = z.input<typeof researchInput>
export class ResearchUnavailable extends Error {}

const proxyDefinitions = [
  { symbol: 'SPY', label: 'State Street / SPY', url: 'https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy' },
  { symbol: 'IWM', label: 'iShares / IWM', url: 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf' },
  { symbol: 'QQQ', label: 'Invesco / QQQ', url: 'https://www.invesco.com/qqq-etf/en/home.html' },
]
const indiaProxyDefinitions = [
  { symbol: 'NIFTYBEES:NSE', label: 'Nippon India / NIFTYBEES', url: 'https://www.nseindia.com/get-quotes/equity?symbol=NIFTYBEES' },
  { symbol: 'JUNIORBEES:NSE', label: 'Nippon India / JUNIORBEES', url: 'https://www.nseindia.com/get-quotes/equity?symbol=JUNIORBEES' },
  { symbol: 'BANKBEES:NSE', label: 'Nippon India / BANKBEES', url: 'https://www.nseindia.com/get-quotes/equity?symbol=BANKBEES' },
]
const fixed = (value: number, places = 3) => value.toFixed(places)
const asPercent = (value: number) => value * 100
const narrow = <T,>(points: T[], limit = 60) => points.length <= limit ? points : Array.from({ length: limit }, (_, i) => points[Math.round((i * (points.length - 1)) / (limit - 1))])

function distribution(values: number[], title: string, label: string): EvidenceChart {
  return { title, series: [label], unit: 'percent', points: Array.from({ length: 21 }, (_, index) => ({ label: `${index * 5}th`, primary: asPercent(quantile(values, index / 20)) })) }
}

export async function runResearch(input: ResearchInput, history = marketDataProvider.history.bind(marketDataProvider)): Promise<ResearchEvidence> {
  const symbols = 'symbols' in input ? input.symbols : [input.symbol]
  if (new Set(symbols).size !== symbols.length) throw new ResearchUnavailable('Enter each portfolio symbol only once.')
  if (input.method === 'scenarios' && input.block > input.horizon) throw new ResearchUnavailable('Block length cannot be longer than the simulation horizon.')
  const indian = symbols.every(ticker => providerForSymbol(ticker) === 'upstox')
  const sampleCurrency = indian ? 'INR' : 'USD'
  const sampleWeights = input.method === 'scenarios' ? input.weightsBps : undefined
  if (sampleWeights) {
    if (sampleWeights.length !== symbols.length) throw new ResearchUnavailable('Each sample holding requires exactly one target weight.')
    const invalid = allocationError(sampleCurrency, symbols.map((symbol, index) => ({ symbol, weightBps: sampleWeights[index] })))
    if (invalid) throw new ResearchUnavailable(invalid)
  } else if (input.method === 'scenarios' && symbols.length > 5) throw new ResearchUnavailable('Enter up to five symbols or choose a weighted sample portfolio.')
  const definitions = indian ? indiaProxyDefinitions : proxyDefinitions
  const proxies = definitions.map(proxy => proxy.symbol)
  const proxyTickers = proxies.map(ticker => symbolParts(ticker).symbol)
  if (input.method === 'factors' && symbols.some(ticker => proxyTickers.includes(symbolParts(ticker).symbol))) throw new ResearchUnavailable(`Choose targets other than ${proxyTickers.join(', ')} to keep the selected ETFs separate from the target.`)
  const requested = input.method === 'factors' ? [...symbols, ...proxies] : symbols
  const histories: ProviderHistory[] = await Promise.all(requested.map(ticker => history({ symbol: ticker, interval: '1day', adjustment: providerForSymbol(ticker) === 'upstox' ? 'none' : 'splits', outputsize: sampleWeights ? Math.max(SAMPLE_HISTORY_SIZE, input.lookback + 1) : input.lookback + 1 })))
  const verifiedSample = sampleWeights ? histories.map((entry, index) => readSampleHistory(symbols[index], sampleCurrency, entry)) : undefined
  const missingSample = verifiedSample?.find(entry => entry.coverage.error)
  if (missingSample) throw new ResearchUnavailable(`${missingSample.coverage.symbol}: ${missingSample.coverage.error}`)
  const warnings: string[] = []
  const source = histories.map((entry, index) => {
    const ticker = requested[index], currency = typeof entry.meta?.currency === 'string' && /^[A-Z]{3}$/.test(entry.meta.currency) ? entry.meta.currency : null
    const quality = validateHistory(entry.values, '1day')
    if (!quality.coverageStart || !quality.coverageEnd) throw new ResearchUnavailable(`No daily price history was returned for ${ticker}. Check the symbol or provider coverage.`)
    if (!currency) throw new ResearchUnavailable(`The provider did not verify a currency for ${ticker}. This analysis cannot compare unverified history.`)
    const provider: ProviderId = entry.source === 'upstox' ? 'upstox' : 'twelvedata'
    const providerName = PROVIDER_LABELS[provider]
    if (input.method === 'factors' && index >= symbols.length && (entry.meta?.symbol !== symbolParts(ticker).symbol || providerForSymbol(ticker) !== provider)) throw new ResearchUnavailable(`${providerName} did not verify the ${ticker} proxy identity.`)
    if (provider === 'upstox') warnings.push(`${ticker}: Upstox candles do not offer a selectable corporate-action adjustment; splits or dividends can affect the measured returns.`)
    if (quality.stale) warnings.push(`${ticker}: the latest available observation may be stale.`)
    if (quality.invalidOhlc || quality.abnormalMoves) warnings.push(`${ticker}: the provider history includes unusual prices or moves. Check Data Quality before relying on the results.`)
    if (quality.missingObservations) warnings.push(`${ticker}: the history has possible missing dates; the data check is not exchange-holiday-adjusted.`)
    return { symbol: ticker, currency, provider, syncedAt: entry.fetchedAt, first: quality.coverageStart, last: quality.coverageEnd }
  })
  if (source.some(item => item.currency !== source[0].currency) || input.method === 'factors' && source[0].currency !== (indian ? 'INR' : 'USD')) throw new ResearchUnavailable('Series and factor proxies must share the same verified currency. FX conversion is not applied.')
  const providerNames = [...new Set(source.map(item => PROVIDER_LABELS[item.provider]))].join(', ')
  const series: PriceObservation[][] = verifiedSample ? verifiedSample.map(entry => entry.points.slice(-(input.lookback + 1)).map(point => ({ date: point.datetime, close: point.close }))) : histories.map(entry => entry.values.map(bar => ({ date: bar.datetime, close: Number(bar.close) })))
  const aligned = alignDailyReturns(series)
  let longGaps = 0
  const rows = sampleWeights ? aligned.rows.flatMap(row => {
    if (Date.parse(row.date) - Date.parse(row.from) > 7 * 86_400_000) { longGaps++; return [] }
    return [{ ...row, segment: row.segment + longGaps }]
  }) : aligned.rows
  const dropped = aligned.dropped + aligned.rows.length - rows.length
  if (!rows.length) throw new ResearchUnavailable('There is not enough overlapping daily history to run this analysis.')
  if (dropped) warnings.push(`${dropped} unmatched or invalid daily intervals were excluded. No prices were carried forward.`)
  const report: ResearchEvidence = {
    id: randomUUID(), method: input.method, title: `${methodInfo[input.method].title} / ${symbols.join(', ')}`, createdAt: new Date().toISOString(),
    from: rows[0].from, to: rows.at(-1)!.date, sample: rows.length, sources: source, warnings, charts: [], tables: [],
    facts: [{ id: 'sample', label: 'Valid daily returns', value: String(rows.length), kind: 'Calculated metric' }, { id: 'frequency', label: 'Provider / frequency', value: `${providerNames} / daily`, kind: 'Provider fact' }],
    assumptions: [`Daily closes from ${providerNames}. Returns are close-to-close in the reported currency. ${indian ? 'Upstox prices are used as reported.' : 'Twelve Data prices are split-adjusted.'}`],
    limitations: ['Cash dividends, transaction costs and tax are not included. Data coverage follows the provider plan.', 'Dates use provider trading sessions. Closures and dates omitted by every series are not distinguished, and closing times across exchanges are not synchronized.'],
  }
  const evidence = (id: string, label: string, value: string, kind: 'Calculated metric' | 'Model output' = 'Model output', date?: string) => report.facts.push({ id, label, value, kind, date })

  if (input.method === 'regimes') {
    const labeled = marketRegimes(rows), latest = labeled.at(-1)
    if (!latest || latest.date !== report.to) throw new ResearchUnavailable('Market regimes need 20 consecutive valid returns ending at the latest aligned observation.')
    evidence('regime', 'Latest regime', latest.label, 'Calculated metric', latest.date)
    evidence('change', 'Trailing 20-session return', pct(latest.change), 'Calculated metric', latest.date)
    evidence('volatility', 'Annualized trailing volatility', pct(latest.volatility), 'Calculated metric', latest.date)
    evidence('labeled', 'Classified endpoints', String(labeled.length), 'Calculated metric')
    report.assumptions.push('Trailing 20 daily returns. High volatility takes priority at 30% annualized sample volatility (252 sessions/year); otherwise rising at +5% or more, falling at -5% or less, and range-bound between those thresholds.')
    report.limitations.push('Labels describe each date using only history available through that close. They do not predict future regimes or returns.')
    report.charts.push({ title: 'Recent regime inputs', series: ['Rolling return', 'Annualized volatility'], unit: 'percent', points: labeled.slice(-60).map(point => ({ label: point.date, primary: asPercent(point.change), secondary: asPercent(point.volatility) })) })
    report.tables.push(
      { caption: 'Classification counts across the selected window', headers: ['Regime', 'Endpoints'], rows: REGIME_LABELS.map(label => [label, String(labeled.filter(item => item.label === label).length)]) },
      { caption: 'Most recent classifications by date', headers: ['Observation date', 'Regime'], rows: labeled.slice(-5).reverse().map(item => [item.date, item.label]) },
    )
  } else if (input.method === 'factors') {
    const offset = symbols.length
    const y = rows.map(row => row.values.slice(0, offset).reduce((sum, value) => sum + value, 0) / offset)
    const columns = [rows.map(row => row.values[offset]), rows.map(row => row.values[offset + 1] - row.values[offset]), rows.map(row => row.values[offset + 2] - row.values[offset])]
    const fit = fitFactors(y, columns)
    if (!fit) throw new ResearchUnavailable('Factor regression needs at least 60 aligned returns, variation in the target, and independent proxy histories. This sample is insufficient or collinear.')
    evidence('fit', 'R-squared', pct(fit.rSquared))
    evidence('residual', 'Daily residual risk', pct(fit.residualRisk))
    evidence('intercept', 'Daily intercept', pct(fit.intercept, 3))
    const [market, secondary, tertiary] = proxyTickers
    evidence('market', `Market beta (${market})`, fixed(fit.coefficients[0]))
    report.assumptions.push(`Daily ordinary least squares with an intercept. ${indian ? 'NIFTYBEES (Nifty 50) proxies the broad market; JUNIORBEES (Nifty Next 50) minus NIFTYBEES proxies next-50 tilt; BANKBEES (Nifty Bank) minus NIFTYBEES proxies banking tilt.' : 'SPY (S&P 500 ETF) proxies the broad market; IWM (Russell 2000 ETF) minus SPY proxies small-cap tilt; QQQ (Nasdaq-100 ETF) minus SPY proxies Nasdaq tilt.'} These are price-return spreads, not academic or excess-return factors.`)
    report.limitations.push('Exposure is statistical association, not causality. Coefficient standard errors assume independent, constant-variance residuals and are descriptive, not significance tests.')
    if (offset > 1) report.assumptions.push('The target is a hypothetical equal-weight portfolio, rebalanced daily.')
    report.references = definitions.map(({ label, url }) => ({ label, url }))
    report.tables.push({ caption: 'Factor exposures', headers: ['Daily ETF proxy', 'Coefficient', 'OLS std. error'], rows: [`Market / ${market}`, `${indian ? 'Next-50' : 'Small-cap'} tilt / ${secondary} - ${market}`, `${indian ? 'Banking' : 'Nasdaq'} tilt / ${tertiary} - ${market}`].map((name, index) => [name, fixed(fit.coefficients[index]), fixed(fit.standardErrors[index])]) })
    report.charts.push({ title: 'Recent realized and fitted daily returns', series: ['Observed', 'OLS fitted'], unit: 'percent', points: rows.slice(-60).map((row, index, recent) => { const i = rows.length - recent.length + index; return { label: row.date, primary: asPercent(y[i]), secondary: asPercent(fit.fitted[i]) } }) })
  } else if (input.method === 'forecast') {
    const result = evaluateForecast(rows, input.horizon)
    if (!result) throw new ResearchUnavailable('Forecast evaluation needs at least 80 valid daily returns and five non-overlapping holdout outcomes. Try a shorter horizon or longer lookback.')
    evidence('model', 'Moving-average MAE', pct(result.mae))
    evidence('baseline', 'No-change MAE', pct(result.naiveMae))
    evidence('comparison', 'Holdout MAE comparison', Math.abs(result.mae - result.naiveMae) <= 1e-12 ? 'Tie' : result.mae < result.naiveMae ? 'Moving average lower' : 'No change lower')
    evidence('holdout', 'Evaluated holdout outcomes', String(result.estimates.length), 'Calculated metric')
    evidence('uncertainty', 'Empirical 10th–90th error percentile', result.errorRange ? `${pct(result.errorRange[0])} to ${pct(result.errorRange[1])}` : 'Unavailable (fewer than 20 outcomes)')
    report.assumptions.push(`Horizon: ${input.horizon} trading observations. Initial training ${result.trainStart} to ${result.trainEnd}; chronological holdout ${result.testStart} to ${result.testEnd}, with evaluated endpoints ${result.estimates[0].date} to ${result.estimates.at(-1)!.date}. Rolling 20-observation mean daily return compounded over the horizon versus a zero-return baseline. Each estimate uses only data through its origin close.`)
    report.limitations.push('Holdout error percentiles are descriptive, not a forward prediction interval. No target price is generated.')
    report.tables.push({ caption: 'Out-of-sample forecast errors', headers: ['Model', 'MAE', 'RMSE'], rows: [['Moving average', pct(result.mae), pct(result.rmse)], ['No change', pct(result.naiveMae), pct(result.naiveRmse)]] })
    report.charts.push({ title: 'Non-overlapping held-out returns (observed vs model)', series: ['Observed', 'Moving average'], unit: 'percent', points: narrow(result.estimates).map(point => ({ label: point.date, primary: asPercent(point.actual), secondary: asPercent(point.model) })) })
  } else {
    const simulated = bootstrapScenarios(rows, sampleWeights ? sampleWeights.map(weight => weight / 10_000) : symbols.map(() => 1 / symbols.length), input)
    if (!simulated) throw new ResearchUnavailable('Bootstrap needs at least 40 aligned returns and 20 eligible blocks. Try a shorter block or longer lookback.')
    evidence('loss', 'Paths ending in loss', pct(simulated.probabilityLoss))
    evidence('terminal', 'Median terminal return', pct(quantile(simulated.terminal, 0.5)))
    evidence('drawdown', '90th percentile maximum drawdown', pct(quantile(simulated.drawdown, 0.9)))
    evidence('blocks', 'Eligible historical starts', String(simulated.availableBlocks), 'Calculated metric')
    report.assumptions.push(`${input.block === 1 ? 'Independent daily draws' : `Moving blocks of ${input.block} consecutive observations`}; ${input.horizon} observations per path; ${input.paths} paths; seed ${input.seed}.`)
    if (symbols.length > 1) report.assumptions.push(`Each draw resamples all assets together on matched dates, preserving contemporaneous dependence. The hypothetical portfolio is rebalanced daily to ${sampleWeights ? 'its target weights' : 'equal weights'}.`)
    if (sampleWeights) report.tables.push({ caption: 'Illustrative target allocation', headers: ['Instrument', 'Target weight'], rows: symbols.map((ticker, index) => [ticker, pct(sampleWeights[index] / 10_000)]) })
    report.limitations.push('A distribution of historical resampling scenarios, not a forecast or a guaranteed probability of future loss. Possible market behavior absent from the historical window is not modeled.')
    report.tables.push({ caption: 'Simulated distributions', headers: ['Percentile', 'Terminal return', 'Maximum drawdown'], rows: [0.05, 0.5, 0.9, 0.95].map(q => [pct(q, 0), pct(quantile(simulated.terminal, q)), pct(quantile(simulated.drawdown, q))]) })
    report.charts.push(distribution(simulated.terminal, 'Terminal return distribution', 'Terminal return'), distribution(simulated.drawdown, 'Maximum drawdown distribution', 'Maximum drawdown'))
  }
  if (report.charts.some(chart => chart.points.some(point => !Number.isFinite(point.primary) || !Number.isFinite(point.secondary ?? 0))) || [...report.facts.map(fact => fact.value), ...report.tables.flatMap(table => table.rows.flat())].some(value => /^(?:-?Infinity|NaN)/.test(value))) {
    throw new ResearchUnavailable('An extreme or invalid observation made this result unreliable. Check the source history before retrying.')
  }
  return report
}
