'use client'

import { useId, useMemo, useState } from 'react'
import { ANNUAL_SESSIONS, CONFIDENCE, drawdownRecovery, FACTOR_WINDOWS, fullDrawdown, riskStatistics, RISK_METRICS, rollingDrawdown, rollingRisk, SURFACE_WINDOWS, TAIL_OBSERVATIONS, trackingStatistics, worstByWindow, type RiskMetric, type ValueInterval } from '@/lib/advanced-risk'
import type { SampleCurrency } from '@/lib/sample-portfolios'
import type { RiskSeries } from '@/lib/portfolio-risk-lab'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { RiskPanel } from './risk-chart'
import { DrawdownChart } from './risk-drawdown-chart'
import { RiskSurfaceGrid, coefficient, percentage } from './risk-surface-grid'
import { useRiskComparisons, type RiskComparisons } from './use-risk-comparisons'

const views = { risk: 'Rolling risk', drawdown: 'Drawdown', factors: 'Factor exposure' } as const
type View = keyof typeof views
const risks = Object.entries(RISK_METRICS) as [RiskMetric, (typeof RISK_METRICS)[RiskMetric]][]
type DataProps = { rows: ValueInterval[]; assets: RiskSeries[]; currency?: SampleCurrency; days: number; dark: boolean }

export function AdvancedRiskView({ rows, assets, currency, days, dark, benchmark, basis }: DataProps & { benchmark?: string; basis: string }) {
  const [view, setView] = useState<View>('risk')
  const [factorWindow, setFactorWindow] = useState<number>(60)
  const comparison = useRiskComparisons({ rows, assets, currency, benchmark, days, window: factorWindow })
  const statistics = useMemo(() => riskStatistics(rows.map(row => row.change)), [rows])
  const drawdowns = useMemo(() => fullDrawdown(rows), [rows])
  const tracking = useMemo(() => trackingStatistics(rows, comparison.benchmarkReturns), [rows, comparison.benchmarkReturns])
  const marketBeta = comparison.status[0]?.fit
  const summary = [
    ...risks.map(([key, info]) => ({ label: info.label, value: key === 'tracking' ? tracking.value : statistics[key], format: info.percent ? percentage : coefficient })),
    { label: 'Market beta', value: marketBeta?.value, format: coefficient },
    { label: 'Maximum drawdown', value: drawdowns.maximum, format: percentage },
  ].filter(item => item.value != null && Number.isFinite(item.value))
  return <>
    <RiskPanel index="Advanced risk · overview" title="Historical risk dashboard" subtitle={basis}>
      <div className="risk-provenance"><span>{rows.length} valid returns{rows.length > 0 ? ` · ${rows[0].from} to ${rows.at(-1)!.date}` : ''}</span><span>{ANNUAL_SESSIONS} sessions/year</span><span>0% risk-free rate and downside target</span><span>95% one-session VaR / CVaR</span></div>
      {summary.length ? <div className="risk-metrics" aria-label="Available risk metrics">{summary.map(item => <div className="metric-card" key={item.label}><span>{item.label}</span><strong>{item.format(item.value!)}</strong></div>)}</div> : <p className="risk-empty" role="status">Insufficient verified history. At least 20 aligned daily returns are required for the basic risk metrics.</p>}
      <p className="method-note">{benchmark ? `Benchmark ${benchmark} · ${tracking.observations} matched returns${tracking.value == null ? ' · tracking error unavailable' : ` · ${comparison.benchmarkMatches[0].from} to ${comparison.benchmarkMatches.at(-1)!.date}`}.` : 'No verified-currency benchmark selected.'} {comparison.benchmarkError} Tail metrics need at least {TAIL_OBSERVATIONS} observations. Ratios are unavailable if their denominator is zero.</p>
      {currency && <><h3 className="advanced-risk-heading">Current factor exposures</h3><p className="method-note">Trailing {factorWindow} aligned sessions ending {comparison.latest ?? 'at the latest available portfolio close'}. Change the regression window in Factor exposure.</p><FactorCards comparison={comparison} /></>}
      {comparison.loading && <p className="method-note" role="status">Checking benchmark and factor history…</p>}
      {!comparison.loading && comparison.hasRequestErrors && <button type="button" className="button small self-start" onClick={() => void comparison.refresh()}>Retry comparison history</button>}
    </RiskPanel>
    <RiskPanel index="Advanced risk · surfaces" title="Explore risk over time" subtitle="Compare trailing trading-session windows, historical drawdowns, and changing regional proxy exposures.">
      <div className="advanced-risk-tabs" role="group" aria-label="Risk surface type">{Object.entries(views).map(([id, label]) => <button type="button" key={id} className="button small" aria-pressed={view === id} onClick={() => setView(id as View)}>{label}</button>)}</div>
      {view === 'factors' ? <FactorSurface rows={rows} comparison={comparison} dark={dark} window={factorWindow} onWindow={setFactorWindow} />
        : <WindowSurface key={view} rows={rows} drawdowns={drawdowns} currency={currency} dark={dark} view={view} comparison={comparison} benchmark={benchmark} />}
    </RiskPanel>
  </>
}

function WindowSurface({ rows, drawdowns, currency, dark, view, comparison, benchmark }: { rows: ValueInterval[]; drawdowns: ReturnType<typeof fullDrawdown>; currency?: SampleCurrency; dark: boolean; view: 'risk' | 'drawdown'; comparison: RiskComparisons; benchmark?: string }) {
  const [windows, setWindows] = useState<number[]>([...SURFACE_WINDOWS])
  const [metric, setMetric] = useState<RiskMetric>('volatility')
  const id = useId()
  const drawdown = view === 'drawdown'
  const grid = useMemo(() => drawdown ? rollingDrawdown(rows, windows) : rollingRisk(rows, metric, windows, comparison.benchmarkReturns), [drawdown, rows, windows, metric, comparison.benchmarkReturns])
  const categories = useMemo(() => windows.map(window => `${window} sessions`), [windows])
  const markers = useMemo(() => drawdown ? worstByWindow(grid, windows.length) : undefined, [drawdown, grid, windows.length])
  const title = drawdown ? 'Rolling drawdown' : RISK_METRICS[metric].label
  return <>
    {!drawdown && <FieldGroup className="risk-fields"><Field className="analytics-field"><FieldLabel htmlFor={id}>Risk metric</FieldLabel><select id={id} value={metric} onChange={event => setMetric(event.target.value as RiskMetric)}>{risks.map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}</select></Field></FieldGroup>}
    <fieldset className="advanced-risk-windows"><legend>Rolling windows (trading sessions)</legend><div>{SURFACE_WINDOWS.map(window => <label key={window}><input type="checkbox" checked={windows.includes(window)} disabled={windows.length === 1 && windows.includes(window)} onChange={event => setWindows(event.target.checked ? [...windows, window].sort((a, b) => a - b) : windows.filter(value => value !== window))} />{window}</label>)}</div></fieldset>
    <p className="method-note">{drawdown ? 'Rolling drawdown compares each closing value with the highest observed value in that trailing window, including its opening close. Markers show the deepest observation for each window.' : `${ANNUAL_SESSIONS} sessions/year · 0% risk-free rate and downside target · ${Math.round(CONFIDENCE * 100)}% empirical confidence for one-session VaR and CVaR (minimum ${TAIL_OBSERVATIONS} returns).${metric === 'tracking' ? ` Benchmark: ${benchmark ?? 'not available'}.` : ''}`}</p>
    <RiskSurfaceGrid key={metric} dates={rows} grid={grid} title={title} axis="Lookback" categories={categories} format={drawdown || RISK_METRICS[metric].percent ? percentage : coefficient} dark={dark} domain={drawdown ? 'negative' : RISK_METRICS[metric].percent ? 'positive' : undefined} markers={markers} empty={metric === 'tracking' ? 'No selected window has enough contiguous, aligned benchmark history.' : 'No selected window has enough contiguous daily data to calculate this metric.'} secondary={drawdown && currency ? <DrawdownChart result={drawdowns} currency={currency} /> : undefined} />
    {drawdown && markers?.some(index => index >= 0) && <div className="risk-comparison" aria-label="Deepest rolling losses by window">{markers.flatMap((i, j) => {
      const item = grid[i]?.[j]
      if (!item || item.peakValue == null) return []
      const { recovery, recoverySessions } = drawdownRecovery(rows, i, item.peakValue)
      return [<article key={categories[j]}><strong>{categories[j]} · {percentage(item.value)}</strong><span>Peak {item.peak} → trough {rows[i].date}</span><span>{recovery ? `Recovered ${recovery} · ${recoverySessions} sessions after trough` : 'Recovery not observed in this span'}</span></article>]
    })}</div>}
  </>
}

function FactorCards({ comparison }: { comparison: RiskComparisons }) {
  const broad = comparison.definitions[0]?.symbol
  return <div className="advanced-risk-factors">{comparison.status.map(({ name, symbol, url, fit, reason, warning }, index) => <article key={symbol}>
    <strong>{name}</strong><span><a href={url} target="_blank" rel="noreferrer">{symbol}</a>{index > 0 && ` − ${broad}`}</span>
    {fit ? <span><strong>{coefficient(fit.value)}</strong> · R² {percentage(fit.rSquared!)} · n={fit.observations}</span> : <span className="method-note">{reason}</span>}
    {warning && <span className="method-note">Data quality: {warning}.</span>}
  </article>)}</div>
}

function FactorSurface({ rows, comparison, dark, window, onWindow }: { rows: ValueInterval[]; comparison: RiskComparisons; dark: boolean; window: number; onWindow: (value: number) => void }) {
  const id = useId()
  const categories = useMemo(() => comparison.definitions.map(proxy => proxy.name), [comparison.definitions])
  return <>
    <FieldGroup className="risk-fields"><Field className="analytics-field"><FieldLabel htmlFor={id}>Regression window</FieldLabel><select id={id} value={window} onChange={event => onWindow(Number(event.target.value))}>{FACTOR_WINDOWS.map(value => <option key={value} value={value}>{value} trading sessions</option>)}</select></Field></FieldGroup>
    <p className="method-note">Separate regressions with an intercept: broad-market ETF returns, or other ETF returns minus that market proxy. Coefficients are sensitivities, not weights, and do not sum to one. These are price-return proxies, not official Fama–French factors.</p>
    <RiskSurfaceGrid dates={rows} grid={comparison.grid} title="Rolling regression coefficient" axis="Market factor" categories={categories} dark={dark} format={coefficient} empty={comparison.loading ? 'Loading verified proxy history…' : 'No factor has enough verified, aligned returns for this regression window.'} />
  </>
}

export function StudioFactorSurface({ rows, assets, currency, days, dark }: DataProps) {
  const [window, setWindow] = useState<number>(60)
  const comparison = useRiskComparisons({ rows, assets, currency, days, window })
  return <>
    <FactorSurface rows={rows} comparison={comparison} dark={dark} window={window} onWindow={setWindow} />
    {currency && <FactorCards comparison={comparison} />}
    {!comparison.loading && comparison.hasRequestErrors && <button type="button" className="button small self-start" onClick={() => void comparison.refresh()}>Retry proxy history</button>}
  </>
}
