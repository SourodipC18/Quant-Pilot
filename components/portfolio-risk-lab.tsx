'use client'

import { useMemo, useState } from 'react'
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

export function PortfolioRiskLab({ samples, initialSample, portfolios, holdings, dark }: { samples: SamplePortfolio[]; initialSample?: SamplePortfolio; portfolios?: PortfolioOption[]; holdings?: PortfolioHolding[]; dark: boolean }) {
  const [selectedId, setSelected] = useState(initialSample?.id ?? samples[0]?.id ?? '')
  const [period, setPeriod] = useState<keyof typeof RISK_PERIODS>('3Y')
  const [window, setWindow] = useState<typeof ROLLING_WINDOWS[number]>(30)
  const sample = samples.find(item => item.id === selectedId)
  const portfolio = portfolios?.find(item => item.id === selectedId)
  const isPaper = portfolio?.id === PAPER_PORTFOLIO.id
  const paper = useSWR<PaperPortfolio>(isPaper ? paperPortfolioEndpoint : null, paperRequest, { revalidateOnFocus: false, shouldRetryOnError: false })
  const positions = useMemo(() => portfolioHoldingsFor(portfolio, holdings, paper.data), [portfolio, holdings, paper.data])
  const symbols = useMemo(() => [...new Set(sample?.holdings.map(item => item.symbol) ?? positions.map(item => item.symbol))], [sample, positions])
  const validation = sample ? allocationError(sample.currency, sample.holdings) : positions.some(item => !Number.isFinite(Number(item.shares)) || Number(item.shares) <= 0) ? 'Every saved position needs a positive share count.' : null
  const tooMany = symbols.length > 10
  const expected = sample?.currency ?? (isPaper ? 'USD' : null)
  const history = useRiskHistory(!validation && !tooMany ? symbols : [], expected)
  const currency = history.data?.currency ?? expected ?? undefined
  const series = useMemo((): RiskSeries[] => history.data?.currency ? symbols.map(symbol => history.data!.entries.find(entry => entry.symbol === symbol)!) : [], [symbols, history.data])
  const marks = useMemo(() => !sample && series.length ? markedAllocation(series, symbols.map(symbol => positions.reduce((sum, item) => sum + (item.symbol === symbol ? Number(item.shares) : 0), 0)), isPaper ? paper.data?.cash ?? NaN : 0) : null, [sample, series, symbols, positions, isPaper, paper.data])
  const allocation = useMemo(() => sample && !validation ? sample.holdings.map(item => ({ symbol: item.symbol, weight: item.weightBps / 10_000 })) : marks?.allocation ?? [], [sample, marks, validation])
  const rows = useMemo(() => riskReturns(series, RISK_PERIODS[period]), [series, period])
  const historical = useMemo(() => portfolioRiskMetrics(rows, allocation), [rows, allocation])
  const correlation = useMemo(() => series.length >= 2 ? rollingRiskCorrelation(rows, symbols, window) : null, [series, rows, symbols, window])
  const loading = history.isLoading || paper.isLoading
  const errors = history.data?.errors ?? []
  const newest = rows.at(-1)?.date, oldest = rows[0]?.from
  const sourceName = sample ? 'Sample target allocation' : isPaper ? 'Simulated shares and idle cash' : 'Saved shares, no idle cash'
  const priceWarnings = history.data?.entries.filter(entry => entry.stale || entry.unusual) ?? []
  return <div className="risk-lab" aria-label="Portfolio Risk Lab">
    <RiskPanel index="Data setup" title="Analysis universe" subtitle="Choose an allocation, then explore its downside and changing diversification from the same verified closes.">
      <FieldGroup className="risk-fields risk-source-fields">
        <Field className="analytics-field"><FieldLabel htmlFor="risk-portfolio">Portfolio</FieldLabel><select id="risk-portfolio" value={selectedId} onChange={event => setSelected(event.target.value)}><optgroup label="Sample portfolios">{samples.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</optgroup>{Boolean(portfolios?.length) && <optgroup label="Workspace portfolios">{portfolios?.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === PAPER_PORTFOLIO.id ? ' · paper USD' : ' · saved'}</option>)}</optgroup>}</select></Field>
        <Field className="analytics-field"><FieldLabel htmlFor="risk-lookback">Historical period</FieldLabel><select id="risk-lookback" value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="6M">6 months</option><option value="1Y">1 year</option><option value="3Y">3 years</option></select></Field>
        <button type="button" className="button small risk-reload" disabled={loading || (!symbols.length && !isPaper)} onClick={() => { if (isPaper) void paper.mutate(); void history.mutate() }}><RefreshCw size={14} aria-hidden="true" /> Refresh prices</button>
      </FieldGroup>
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
      <p className="method-note">Lookback ends at the latest shared close. Historical risk uses current fixed weights and aligned close-to-close returns, not account history. Twelve Data uses split-adjusted closes; Upstox uses closes as reported, so corporate actions may affect results.</p>
    </RiskPanel>
    <RiskStress key={`${selectedId}:${symbols.join(',')}:${allocation.length}`} allocation={allocation} currency={currency} initialCapital={sample ? SAMPLE_CAPITAL[sample.currency] : marks?.capital} dark={dark} days={RISK_PERIODS[period]} series={series} historical={historical} highest={correlation?.highest ?? null} observations={rows.length} window={window} />
    <RiskCorrelation key={selectedId} result={correlation} window={window} onWindow={setWindow} dark={dark} observations={rows.length} loading={loading} />
  </div>
}
