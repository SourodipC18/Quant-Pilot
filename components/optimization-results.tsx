'use client'

import dynamic from 'next/dynamic'
import { Component, useCallback, useMemo, useState, type ReactNode } from 'react'
import { RotateCcw, Table2 } from 'lucide-react'
import type { LabPoint, LabResult } from '@/lib/optimization-lab'

const Frontier3D = dynamic(() => import('@/components/optimization-frontier-3d'), {
  ssr: false,
  loading: () => <p className="optimization-plot-message" role="status">Loading the 3D view…</p>,
})
const names: Record<LabPoint['kind'], string> = { current: 'Current portfolio', minimum: 'Minimum variance', sharpe: 'Maximum Sharpe', frontier: 'Efficient frontier', candidate: 'Feasible candidate' }
const pct = (value: number) => `${(value * 100).toFixed(2)}%`
const ratio = (value: number | null) => value == null ? 'Undefined' : value.toFixed(2)
const allocation = (point: LabPoint, symbols: string[]) => point.weights.map((weight, index) => `${symbols[index]} ${pct(weight)}`).join(' · ')
const unavailable = <p className="optimization-plot-message" role="status">The 3D view is unavailable in this browser. All results are available in the table below.</p>

class PlotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? unavailable : this.props.children }
}

function ResultRows({ points, symbols }: { points: LabPoint[]; symbols: string[] }) {
  return points.map(point => <tr key={point.id}>
    <th scope="row">{names[point.kind]}{point.kind === 'frontier' || point.kind === 'candidate' ? ` ${point.id.slice('candidate-'.length)}` : ''}</th>
    <td>{pct(point.volatility)}</td><td>{pct(point.expectedReturn)}</td><td>{ratio(point.sharpe)}</td><td>{allocation(point, symbols)}</td>
  </tr>)
}

function ResultsTable({ caption, points, symbols }: { caption: string; points: LabPoint[]; symbols: string[] }) {
  return <div className="table-scroll optimization-table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table className="optimization-table">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">Portfolio</th><th scope="col">Volatility</th><th scope="col">Expected return</th><th scope="col">Sharpe ratio</th><th scope="col">Asset weights</th></tr></thead>
      <tbody><ResultRows points={points} symbols={symbols} /></tbody>
    </table>
  </div>
}

export function OptimizationResults({ result, cap, window, dark, sources, oldestFetch, sampleTarget }: { result: LabResult; cap: number; window: string; dark: boolean; sources: string; oldestFetch?: string; sampleTarget?: boolean }) {
  const [hover, setHover] = useState<LabPoint | null>(null)
  const [selected, setSelected] = useState('minimum')
  const [reset, setReset] = useState(0)
  const [failed, setFailed] = useState(false)
  const onUnavailable = useCallback(() => setFailed(true), [])
  const { current, minimum, maximum, candidates, frontier } = result
  const highlights = useMemo(() => [current, minimum, maximum].filter((point): point is LabPoint => point !== null), [current, minimum, maximum])
  const points = useMemo(() => [...candidates, ...frontier, ...highlights], [candidates, frontier, highlights])
  const visiblePoint = hover ?? points.find(point => point.id === selected) ?? result.minimum
  const hasPlot = points.some(point => point.sharpe != null)
  const chartPoints = [...result.frontier, ...result.candidates]
  const currentNote = sampleTarget
    ? result.current ? 'Current portfolio shows the illustrative target weights, without applying the candidate weight cap.' : 'The target-weight point is shown when the selection includes every sample holding.'
    : result.current ? `The current portfolio uses saved shares valued at the common ${result.valuationDate} close, without applying the candidate weight cap.`
      : 'The current portfolio is shown only when the selection covers all saved holdings with positive shares.'

  return <>
    <section className="panel app-panel" aria-labelledby="optimization-frontier-title">
      <header className="app-panel-header optimization-header"><div><span className="eyebrow">02 / Risk–return space</span><h2 id="optimization-frontier-title">3D Efficient Frontier</h2></div><a className="text-button" href="#optimization-table"><Table2 size={14} aria-hidden="true" /> View 2D table</a></header>
      <div className="optimization-provenance"><span>{result.start} to {result.end}</span><span>{result.samples} aligned returns</span><span>{result.currency}</span><span>{window} · {cap}% cap</span></div>
      <p className="optimization-copy">The frontier highlights sampled allocations with the highest expected return at a given risk level. Sharpe adds a third view of the same return and volatility data.</p>
      <ul className="optimization-legend" aria-label="Chart legend">{(['candidate', 'frontier', 'current', 'minimum', 'sharpe'] as const).map(kind => <li key={kind}><span className="optimization-swatch" data-kind={kind} aria-hidden="true" />{names[kind]}</li>)}</ul>
      <figure className="optimization-chart">
        <figcaption className="optimization-chart-tools"><span>X · Volatility (%) &nbsp; Y · Expected return (%) &nbsp; Z · Sharpe ratio</span>{hasPlot && !failed && <button type="button" className="button small" onClick={() => { setHover(null); setReset(value => value + 1) }}><RotateCcw size={13} aria-hidden="true" /> Reset view</button>}</figcaption>
        {!hasPlot ? <p className="optimization-plot-message">No allocation has a defined Sharpe ratio. See the 2D results below.</p> : failed ? unavailable : <div className="optimization-plot-area">
          <PlotBoundary><Frontier3D {...{ points, frontier, dark, reset, onUnavailable }} onHover={setHover} onSelect={point => setSelected(point.id)} /></PlotBoundary>
          {hover && <div className="optimization-tooltip" aria-hidden="true"><strong>{names[hover.kind]}</strong><p>{pct(hover.volatility)} risk · {pct(hover.expectedReturn)} return · {ratio(hover.sharpe)} Sharpe</p><p>{allocation(hover, result.symbols)}</p></div>}
        </div>}
        {hasPlot && !failed && <p className="optimization-plot-help">Drag to rotate · Scroll or pinch to zoom · Hover or tap a point to inspect it</p>}
      </figure>
      <section className="optimization-inspector" aria-label="Selected portfolio metrics">
        <div className="optimization-inspector-top"><div><span className="eyebrow">Point inspector</span><h3>{names[visiblePoint.kind]}</h3></div><div className="optimization-highlight-actions" aria-label="Highlighted portfolios">{highlights.map(point => <button type="button" className="button small" aria-pressed={selected === point.id} key={point.id} onClick={() => { setHover(null); setSelected(point.id) }}><span className="optimization-swatch" data-kind={point.kind} aria-hidden="true" />{names[point.kind]}</button>)}</div></div>
        <dl className="optimization-point-metrics">
          <div><dt>Annualized volatility</dt><dd>{pct(visiblePoint.volatility)}</dd></div><div><dt>Expected annual return</dt><dd>{pct(visiblePoint.expectedReturn)}</dd></div><div><dt>Sharpe ratio</dt><dd>{ratio(visiblePoint.sharpe)}</dd></div>
        </dl>
        <p className="optimization-copy"><strong>Asset weights:</strong> {allocation(visiblePoint, result.symbols)}</p>
      </section>
    </section>
    <section className="panel app-panel optimization-results" id="optimization-table" aria-labelledby="optimization-table-title" tabIndex={-1}>
      <header className="app-panel-header"><div><span className="eyebrow">03 / Accessible data view</span><h2 id="optimization-table-title">2D results table</h2></div></header>
      <p className="optimization-copy">{currentNote}{!result.maximum && ' Maximum Sharpe is unavailable because candidate volatility is zero.'}</p>
      <ResultsTable caption="Highlighted portfolios" points={highlights} symbols={result.symbols} />
      <details><summary>Frontier and candidate allocations ({chartPoints.length})</summary><ResultsTable caption="Displayed feasible and frontier portfolios" points={chartPoints} symbols={result.symbols} /></details>
      <div className="optimization-method">
        <h3>Method & limitations</h3>
        <p>Source: {sources || 'market data provider'}. {oldestFetch && `Oldest provider fetch: ${oldestFetch}. `}Uses aligned weekday closes (Twelve Data split-adjusted; Upstox as reported), arithmetic mean returns and sample covariance, annualized over 252 trading days. Sharpe assumes a 0% risk-free rate. {result.skippedIntervals > 0 && `${result.skippedIntervals} date intervals were omitted because a close was missing or a gap was too long. `}No forward-filling, FX conversion, dividends, fees, or taxes.</p>
        <p>Long-only, fully invested portfolios were searched on a {result.step}-percentage-point starting grid and adjusted to respect the {cap}% per-asset cap. {result.searched.toLocaleString()} distinct allocations were evaluated; the chart and table show a sample plus the best grid results, not exact continuous optima. Portfolios with undefined Sharpe are table-only. Historical estimates do not guarantee future performance.</p>
      </div>
    </section>
  </>
}
