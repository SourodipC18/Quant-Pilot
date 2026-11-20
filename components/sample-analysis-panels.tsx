'use client'

import { useState } from 'react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { SampleHistoryPreview } from '@/components/sample-portfolio-preview'
import type { useSampleHistory } from '@/components/use-sample-history'
import { historicalCVaR, historicalVaR } from '@/lib/analytics'
import { priceLabel, symbolParts } from '@/lib/market-instruments'
import { basketStressPnl } from '@/lib/sample-analytics'
import { SAMPLE_CAPITAL, SAMPLE_PORTFOLIOS, type SamplePortfolio } from '@/lib/sample-portfolios'

type History = ReturnType<typeof useSampleHistory>

export function SampleAnalysisSource({ sample, available, tool, onChange, onBrowse }: { sample?: SamplePortfolio; available: SamplePortfolio[]; tool: string; onChange: (id: string) => void; onBrowse: () => void }) {
  const isCorrelation = tool === 'Correlation'
  const fallback = tool === 'Portfolio Risk' || tool === 'Optimization Lab' ? 'Workspace holdings' : isCorrelation ? 'Select a portfolio' : 'Instrument mode'
  return <section className="panel app-panel" aria-label={`${tool} sample portfolio source`}>
    <div className="sample-analysis-source"><Field className="analytics-field"><FieldLabel htmlFor="sample-analysis-source">Illustrative portfolio source</FieldLabel><select id="sample-analysis-source" value={sample?.id ?? ''} onChange={event => onChange(event.target.value)}><option value="">{fallback}</option>{available.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</select></Field><div className="paper-inline">
      {!sample && <button type="button" className="button small" onClick={() => onChange(SAMPLE_PORTFOLIOS[0].id)}><FlaskConical size={14} aria-hidden="true" /> Try Sample Portfolio</button>}
      <button type="button" className="text-button" onClick={onBrowse}>{sample ? 'Open allocation editor' : 'Browse library'} <ArrowRight size={14} aria-hidden="true" /></button>
    </div></div>
    <p className="method-note">{sample ? 'You are analyzing target weights. No holdings are saved and no trades are placed.' : 'Choose an illustrative allocation to run this tool without creating holdings or placing trades.'}</p>
  </section>
}

export function SampleHistoryIssue({ history }: { history: History }) {
  const failures = history.data?.map(item => item.coverage).filter(coverage => coverage.error) ?? []
  if (!failures.length) return null
  return <section className="panel app-panel" role="status"><header className="app-panel-header"><div><span className="eyebrow">Provider coverage</span><h2>Historical data unavailable</h2></div><button className="button small" type="button" disabled={history.isLoading} onClick={() => void history.retry()}>Retry history</button></header><ul className="method-note">{failures.map(issue => <li key={issue.symbol}>{symbolParts(issue.symbol).symbol}: {issue.error}</li>)}</ul></section>
}

export function SampleRiskPanel({ sample, history }: { sample: SamplePortfolio; history: History }) {
  const risk = history.analytics
  const percent = (value: number | null) => value == null ? '—' : `${(100 * value).toFixed(2)}%`
  return <><SampleHistoryPreview sample={sample} history={history} valid /><SampleHistoryIssue history={history} />{risk?.returns.length ? <section className="panel app-panel"><header className="app-panel-header"><div><span className="eyebrow">03 / Aligned historical returns</span><h2>Portfolio tail risk</h2></div></header><div className="sample-metrics"><div><span>Historical 95% VaR</span><strong>{percent(historicalVaR(risk.returns))}</strong></div><div><span>Historical 95% CVaR</span><strong>{percent(historicalCVaR(risk.returns))}</strong></div></div><p className="method-note">Daily 5th-percentile return and mean return at or below that threshold. These are historical estimates, not loss limits.</p></section> : null}</>
}

export function SampleCorrelationPanel({ sample, history }: { sample?: SamplePortfolio; history: History }) {
  const metrics = history.analytics
  return <><section className="panel app-panel" aria-busy={history.isLoading}><header className="app-panel-header"><div><span className="eyebrow">Pearson correlation / Daily closes</span><h2>Cross-asset correlation</h2></div></header>
    {sample && metrics?.correlation.length ? <>
      <div className="table-scroll"><table className="data-table sample-correlation"><caption className="sr-only">Pearson correlation of matched daily returns</caption><thead><tr><th scope="col">Instrument</th>{sample.holdings.map(asset => <th key={asset.symbol} scope="col">{symbolParts(asset.symbol).symbol}</th>)}</tr></thead><tbody>{metrics.correlation.map((row, index) => <tr key={sample.holdings[index].symbol}><th scope="row">{symbolParts(sample.holdings[index].symbol).symbol}</th>{row.map((value, col) => <td key={sample.holdings[col].symbol} style={value == null ? undefined : { background: `color-mix(in srgb, var(--chart-${value >= 0 ? 1 : 5}) ${Math.round(Math.abs(value) * 22)}%, transparent)` }}>{value?.toFixed(2) ?? '—'}</td>)}</tr>)}</tbody></table></div>
      <p className="method-note">{metrics.observations} matched daily return intervals. Correlations are historical and can change. An undefined coefficient indicates insufficient variation.</p>
    </> : <div className="empty-block" role="status"><strong>{history.isLoading ? 'Loading aligned history…' : sample ? 'Correlation unavailable' : 'Choose a basket to compare holdings'}</strong><p>{sample ? 'All instruments need overlapping, verified daily history.' : 'Select a sample above to see how the holdings have moved together.'}</p></div>}
  </section><SampleHistoryIssue history={history} /></>
}

export function SampleStressPanel({ sample }: { sample: SamplePortfolio }) {
  const [capital, setCapital] = useState(SAMPLE_CAPITAL[sample.currency])
  const [shocks, setShocks] = useState<Record<string, number>>({})
  const scenario = Object.fromEntries(sample.holdings.map(asset => [asset.symbol, shocks[asset.symbol] ?? -10]))
  const valid = Number.isFinite(capital) && capital > 0 && capital <= 100_000_000 && Object.values(scenario).every(value => Number.isFinite(value) && Math.abs(value) <= 100)
  const money = (value: number | null) => priceLabel(value, sample.currency)
  return <section className="panel app-panel"><header className="app-panel-header"><div><span className="eyebrow">Hypothetical one-step sensitivity</span><h2>Portfolio shock scenario</h2></div><span className="paper-tag">{sample.currency}</span></header>
    <Field className="analytics-field"><FieldLabel htmlFor="sample-stress-capital">Starting capital ({sample.currency})</FieldLabel><input id="sample-stress-capital" type="number" min="1" max="100000000" value={capital} onChange={event => setCapital(Number(event.target.value))} /></Field>
    <FieldGroup className="sample-stress-fields">{sample.holdings.map((asset, index) => <Field className="analytics-field" key={asset.symbol}><FieldLabel htmlFor={`sample-shock-${index}`}>{symbolParts(asset.symbol).symbol} shock (%)</FieldLabel><input id={`sample-shock-${index}`} type="number" min="-100" max="100" step="0.1" value={scenario[asset.symbol]} onChange={event => setShocks(current => ({ ...current, [asset.symbol]: event.target.valueAsNumber }))} /></Field>)}</FieldGroup>
    <div className="sample-metrics"><div><span>Estimated basket impact</span><strong>{money(valid ? basketStressPnl(capital, sample.holdings, scenario) : null)}</strong></div><div><span>Estimated ending value</span><strong>{money(valid ? capital + basketStressPnl(capital, sample.holdings, scenario) : null)}</strong></div></div>
    {!valid && <p role="alert" className="method-note negative">Enter positive capital up to 100 million and shocks between −100% and +100%.</p>}
    <div className="table-scroll"><table className="data-table"><caption className="sr-only">Per-instrument scenario contribution</caption><thead><tr><th scope="col">Instrument</th><th scope="col">Target</th><th scope="col">Impact</th></tr></thead><tbody>{sample.holdings.map(asset => <tr key={asset.symbol}><th scope="row">{symbolParts(asset.symbol).symbol}</th><td>{asset.weightBps / 100}%</td><td>{money(valid ? basketStressPnl(capital, [asset], scenario) : null)}</td></tr>)}</tbody></table></div>
    <p className="method-note">Starting capital × target weight × explicit user shock, summed across holdings. These are not historical shocks or predictions; no price history or FX is assumed.</p></section>
}
