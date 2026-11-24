'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { historicalValues, type Valuation } from '@/lib/advanced-risk'
import { SYMBOL_PATTERN } from '@/lib/market-instruments'
import { RISK_BENCHMARKS } from '@/lib/risk-proxies'
import { AdvancedRiskView } from './advanced-risk-view'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { PAPER_PORTFOLIO, portfolioHoldingsFor, type PortfolioHolding, type PortfolioOption } from '@/lib/portfolio-adapter'
import { type PaperPortfolio } from '@/lib/paper-trading-types'
import { allocationError, SAMPLE_CAPITAL, type SamplePortfolio } from '@/lib/sample-portfolios'
import { markedAllocation, portfolioRiskMetrics, riskReturns, rollingRiskCorrelation, RISK_PERIODS, ROLLING_WINDOWS, type RiskSeries } from '@/lib/portfolio-risk-lab'
import { paperPortfolioEndpoint, paperRequest } from './paper-order-ticket'
import { useRiskHistory } from './use-risk-history'
import { RiskPanel } from './risk-chart'
import { RiskStress } from './risk-stress'
import { RiskCorrelation } from './risk-correlation'

const INSTRUMENT = 'risk-single-instrument'

export function PortfolioRiskLab({ samples, initialSample, initialSymbol, portfolios, holdings, benchmarks, dark }: { samples: SamplePortfolio[]; initialSample?: SamplePortfolio; initialSymbol: string; portfolios?: PortfolioOption[]; holdings?: PortfolioHolding[]; benchmarks?: Record<string, string>; dark: boolean }) {
  const [selectedId, setSelected] = useState(initialSample?.id ?? samples[0]?.id ?? INSTRUMENT)
  const [instrument, setInstrument] = useState(initialSymbol)
  const [draft, setDraft] = useState(initialSymbol)
  const [instrumentError, setInstrumentError] = useState('')
  const isInstrument = selectedId === INSTRUMENT
  function selectInstrument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = draft.trim().toUpperCase()
    if (!SYMBOL_PATTERN.test(value)) { setInstrumentError('Enter a valid listing, such as AAPL or RELIANCE:NSE.'); return }
    setInstrumentError('')
    setInstrument(value)
  }
  const [period, setPeriod] = useState<keyof typeof RISK_PERIODS>('3Y')
  const [window, setWindow] = useState<typeof ROLLING_WINDOWS[number]>(30)
  const sample = samples.find(item => item.id === selectedId)
  const portfolio = portfolios?.find(item => item.id === selectedId)
  const isPaper = portfolio?.id === PAPER_PORTFOLIO.id
  const paper = useSWR<PaperPortfolio>(isPaper ? paperPortfolioEndpoint : null, paperRequest, { revalidateOnFocus: false, shouldRetryOnError: false })
  const positions = useMemo(() => portfolioHoldingsFor(portfolio, holdings, paper.data), [portfolio, holdings, paper.data])
  const symbols = useMemo(() => isInstrument ? [instrument] : [...new Set(sample?.holdings.map(item => item.symbol) ?? positions.map(item => item.symbol))], [sample, positions, isInstrument, instrument])
  const shares = useMemo(() => isInstrument ? [1] : symbols.map(symbol => positions.reduce((sum, item) => sum + (item.symbol === symbol ? Number(item.shares) : 0), 0)), [isInstrument, symbols, positions])
  const validation = sample ? allocationError(sample.currency, sample.holdings) : positions.some(item => !Number.isFinite(Number(item.shares)) || Number(item.shares) <= 0) ? 'Every saved position needs a positive share count.' : null
  const tooMany = symbols.length > 10
  const expected = sample?.currency ?? (isPaper ? 'USD' : null)
  const history = useRiskHistory(!validation && !tooMany ? symbols : [], expected)
  const currency = history.data?.currency ?? expected ?? undefined
  const series = useMemo((): RiskSeries[] => history.data?.currency ? symbols.map(symbol => history.data!.entries.find(entry => entry.symbol === symbol)!) : [], [symbols, history.data])
  const cash = isPaper ? paper.data?.cash ?? NaN : 0
  const marks = useMemo(() => !sample && series.length ? markedAllocation(series, shares, cash) : null, [sample, series, shares, cash])
  const days = RISK_PERIODS[period]
  const values = useMemo(() => {
    const valuation: Valuation = sample ? { kind: 'targets', weights: symbols.map(symbol => (sample.holdings.find(item => item.symbol === symbol)?.weightBps ?? 0) / 10_000), capital: SAMPLE_CAPITAL[sample.currency] } : { kind: 'shares', shares, cash }
    return historicalValues(series, days, valuation)
  }, [series, days, sample, symbols, shares, cash])
  const benchmarkChoice = portfolio ? (benchmarks?.[portfolio.id] ?? portfolio.benchmark).trim().toUpperCase() : 'AUTO'
  const benchmark = benchmarkChoice && benchmarkChoice !== 'AUTO' ? benchmarkChoice : currency ? RISK_BENCHMARKS[currency] : undefined
  const allocation = useMemo(() => sample && !validation ? sample.holdings.map(item => ({ symbol: item.symbol, weight: item.weightBps / 10_000 })) : marks?.allocation ?? [], [sample, marks, validation])
  const rows = useMemo(() => riskReturns(series, RISK_PERIODS[period]), [series, period])
  const historical = useMemo(() => portfolioRiskMetrics(rows, allocation), [rows, allocation])
  const correlation = useMemo(() => series.length >= 2 ? rollingRiskCorrelation(rows, symbols, window) : null, [series, rows, symbols, window])
  const loading = history.isLoading || paper.isLoading
  const errors = history.data?.errors ?? []
  const newest = rows.at(-1)?.date, oldest = rows[0]?.from
  const sourceName = sample ? 'Sample target allocation · no idle cash' : isPaper ? 'Simulated shares and idle cash' : isInstrument ? `${instrument} · one share · no cash` : 'Saved shares · no idle cash'
  const basis = sample ? 'Verified closes revalue the sample target allocation, rebalanced daily with no idle cash. This is not recorded account equity.'
    : isPaper ? 'Verified closes revalue current paper shares and constant idle cash. This is not a record of past positions, trades, or account equity.'
      : isInstrument ? 'Verified daily closes value one share. No idle cash is included.' : 'Verified closes revalue current saved share quantities. Weights drift with prices; no idle cash or past trades are included.'
  const priceWarnings = history.data?.entries.filter(entry => entry.stale || entry.unusual) ?? []
  return <div className="risk-lab" aria-label="Portfolio Risk Lab">
    <RiskPanel index="Data setup" title="Analysis universe" subtitle="Choose an allocation, then explore its downside and changing diversification from the same verified closes.">
      <FieldGroup className="risk-fields risk-source-fields">
        <Field className="analytics-field"><FieldLabel htmlFor="risk-portfolio">Instrument or portfolio</FieldLabel><select id="risk-portfolio" value={selectedId} onChange={event => setSelected(event.target.value)}><option value={INSTRUMENT}>Individual instrument · {instrument}</option><optgroup label="Sample portfolios">{samples.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</optgroup>{Boolean(portfolios?.length) && <optgroup label="Workspace portfolios">{portfolios?.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === PAPER_PORTFOLIO.id ? ' · paper USD' : ' · saved'}</option>)}</optgroup>}</select></Field>
        <Field className="analytics-field"><FieldLabel htmlFor="risk-lookback">Historical period</FieldLabel><select id="risk-lookback" value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="6M">6 months</option><option value="1Y">1 year</option><option value="3Y">3 years</option></select></Field>
        <button type="button" className="button small risk-reload" disabled={loading || (!symbols.length && !isPaper)} onClick={() => { if (isPaper) void paper.mutate(); void history.mutate() }}><RefreshCw size={14} aria-hidden="true" /> Refresh prices</button>
      </FieldGroup>
      {isInstrument && <form onSubmit={selectInstrument}><FieldGroup className="risk-fields risk-instrument-form"><Field className="analytics-field" data-invalid={Boolean(instrumentError)}><FieldLabel htmlFor="risk-instrument">Instrument listing</FieldLabel><input id="risk-instrument" aria-invalid={Boolean(instrumentError)} aria-describedby={instrumentError ? 'risk-instrument-error' : undefined} value={draft} onChange={event => setDraft(event.target.value)} maxLength={65} autoComplete="off" placeholder="AAPL or RELIANCE:NSE" required /></Field><button type="submit" className="button small risk-reload">Load instrument</button></FieldGroup>{instrumentError && <p className="method-note" id="risk-instrument-error" role="alert">{instrumentError}</p>}</form>}
      <div className="risk-provenance"><span>{sourceName}</span><span>{currency ?? 'Awaiting verified currency'}</span><span>{history.data?.sources || 'Awaiting data provider'}</span><span>{rows.length} matched returns{oldest && newest ? ` · ${oldest} to ${newest}` : ''}</span>{marks && <span>Holdings marked {marks.date}{isPaper ? ` · ${(100 * marks.cashWeight).toFixed(1)}% idle cash` : ''}</span>}</div>
      {!portfolios?.length && <p className="method-note">Saved portfolios and paper positions appear when a workspace is available.</p>}
      {loading && <p className="method-note" role="status">Loading verified portfolio history…</p>}
      {validation && <p className="risk-empty" role="status">{validation}</p>}
      {tooMany && <p className="risk-empty" role="status">This lab supports up to ten unique holdings. No partial portfolio is calculated.</p>}
      {paper.error && <p className="risk-empty" role="status">Unable to load the paper account: {paper.error.message}</p>}
      {!loading && !symbols.length && !paper.error && <p className="risk-empty" role="status">No invested holdings. Add holdings or choose another portfolio.</p>}
      {!loading && Boolean(symbols.length) && !sample && !marks && !errors.length && !tooMany && !validation && <p className="risk-empty" role="status">No common valuation date and valid share marks are available.</p>}
      {Boolean(errors.length) && <div className="risk-empty" role="status"><strong>Verified portfolio history is incomplete</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul><p>{sample ? 'Hypothetical shocks can still use the labeled sample weights; observed metrics require all holdings.' : 'No currency conversion or partial analytics are shown.'}</p></div>}
      {Boolean(priceWarnings.length) && <p className="method-note">Data quality flags: {priceWarnings.map(item => `${item.symbol} (${[item.stale && 'stale', item.unusual && 'unusual price move'].filter(Boolean).join(', ')})`).join('; ')}.</p>}
      <p className="method-note">Lookback ends at the latest shared close. Twelve Data uses split-adjusted closes; Upstox uses closes as reported, so corporate actions may affect results. The stress and correlation tools below retain their existing current-weight methodology.</p>
    </RiskPanel>
    <AdvancedRiskView rows={values} assets={series} currency={currency} days={days} dark={dark} benchmark={benchmark} basis={basis} />
    <RiskStress key={`${selectedId}:${symbols.join(',')}:${allocation.length}`} allocation={allocation} currency={currency} initialCapital={sample ? SAMPLE_CAPITAL[sample.currency] : marks?.capital} dark={dark} days={RISK_PERIODS[period]} series={series} historical={historical} highest={correlation?.highest ?? null} observations={rows.length} window={window} />
    <RiskCorrelation key={selectedId} result={correlation} window={window} onWindow={setWindow} dark={dark} observations={rows.length} loading={loading} />
  </div>
}
