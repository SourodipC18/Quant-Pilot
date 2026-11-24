'use client'

import { useEffect, useMemo, useState } from 'react'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { HISTORICAL_WINDOWS, RISK_FACTORS, factorExposures, replayWindow, stressPoint, type RiskAllocation, type RiskSeries, type ShockAxis, type portfolioRiskMetrics, type rollingRiskCorrelation } from '@/lib/portfolio-risk-lab'
import { priceLabel } from '@/lib/market-instruments'
import type { SampleCurrency } from '@/lib/sample-portfolios'
import { useRiskHistory } from './use-risk-history'
import { RiskChart, RiskHeatmap, RiskPanel, riskCsv } from './risk-chart'
import type { SurfaceData } from './surface-view'

type Replay = NonNullable<ReturnType<typeof replayWindow>>
const formatPct = (value: number) => `${Number(value.toFixed(3))}%`
const ordered = (symbols: string[], data?: RiskSeries[]) => symbols.map(symbol => data?.find(entry => entry.symbol === symbol)).filter((entry): entry is RiskSeries => Boolean(entry))

function NumericField({ id, label, value, onValue, min, max, step = 'any' }: { id: string; label: string; value: string | number; onValue: (value: string) => void; min?: number; max?: number; step?: string }) {
  return <Field className="analytics-field"><FieldLabel htmlFor={id}>{label}</FieldLabel><input id={id} type="number" value={value} min={min} max={max} step={step} onChange={event => onValue(event.target.value)} /></Field>
}

function RiskSummary({ historical, highest, observations, window, scenario, currency }: { historical: ReturnType<typeof portfolioRiskMetrics>; highest: NonNullable<ReturnType<typeof rollingRiskCorrelation>>['highest']; observations: number; window: number; scenario: ScenarioSummary | null; currency?: SampleCurrency }) {
  const money = (value?: number) => priceLabel(value, currency, 2)
  const pct = (value: number | null | undefined) => value == null ? '—' : `${(100 * value).toFixed(2)}%`
  const metrics = [
    ['Estimated scenario loss', scenario ? priceLabel(Math.max(0, -scenario.pnl), currency, 0) : '—', scenario ? `Net P&L ${money(scenario.pnl)}` : 'Set a valid shock'],
    ['Portfolio volatility', pct(historical?.volatility), observations >= 30 ? `Annualized · ${observations} returns` : 'Needs ≥30 returns'],
    ['Historical VaR · 95%', pct(historical?.var95), 'One session · needs ≥100 returns'],
    ['Historical CVaR · 95%', pct(historical?.cvar95), 'Worst 5% of sessions · needs ≥100'],
    ['Maximum drawdown', pct(historical?.drawdown), historical?.drawdown != null ? `Worst covered span · ${historical.segmentCount} returns` : 'Needs ≥30 uninterrupted returns'],
    ['Worst asset contribution', scenario?.worst ? priceLabel(scenario.worst.pnl, currency, 0) : '—', scenario?.worst ? `${scenario.worst.symbol} · ${money(scenario.worst.pnl)}` : scenario ? 'No asset loss in this scenario' : 'Set a valid shock'],
    ['Peak observed correlation', highest ? highest.value.toFixed(3) : '—', highest ? `${highest.label} · ${highest.date}` : `Needs a valid ${window}-session window`],
  ]
  return <RiskPanel index="01 / Risk dashboard" title="Portfolio snapshot" subtitle="Scenario estimates alongside observed historical risk. An em dash means the inputs cannot support that metric."><div className="risk-metrics">{metrics.map(([name, value, note]) => <article key={name} className="metric-card"><span>{name}</span><strong>{value}</strong><small>{note}</small></article>)}</div></RiskPanel>
}

type StressProps = {
  allocation: RiskAllocation[]; currency?: SampleCurrency; initialCapital?: number; dark: boolean; days: number; series: RiskSeries[];
  historical: ReturnType<typeof portfolioRiskMetrics>; highest: NonNullable<ReturnType<typeof rollingRiskCorrelation>>['highest']; observations: number; window: number;
}

export function RiskStress({ allocation, currency, initialCapital, dark, days, series, historical, highest, observations, window }: StressProps) {
  const [mode, setMode] = useState<'assets' | 'factors'>('assets')
  const [assetA, setAssetA] = useState(allocation[0]?.symbol ?? '')
  const [assetB, setAssetB] = useState(allocation[1]?.symbol ?? '')
  const [factorA, setFactorA] = useState('')
  const [factorB, setFactorB] = useState('')
  const [capitalText, setCapital] = useState<string | null>(null)
  const [preset, setPreset] = useState('')
  const [draftDates, setDates] = useState({ start: '', end: '' })
  const [bounds, setBounds] = useState<{ start: string; end: string }>()
  const [dateError, setDateError] = useState('')
  const symbols = useMemo(() => allocation.map(item => item.symbol), [allocation])
  const factors = currency ? RISK_FACTORS[currency] : []
  const firstFactor = factorA || factors[0]?.symbol || '', secondFactor = factorB || factors[1]?.symbol || ''
  const useFactors = mode === 'factors'
  const factorHistory = useRiskHistory(useFactors && firstFactor && secondFactor ? [firstFactor, secondFactor] : [], currency ?? null)
  const replayHistory = useRiskHistory(!useFactors && preset && bounds ? symbols : [], currency ?? null, bounds)
  const replay = useMemo(() => preset && bounds && !useFactors && replayHistory.data?.currency ? replayWindow(ordered(symbols, replayHistory.data.entries), bounds.start, bounds.end) : null, [preset, bounds, useFactors, replayHistory.data, symbols])
  const fitted = useFactors && factorHistory.data?.currency ? factorExposures(series, ordered([firstFactor, secondFactor], factorHistory.data.entries), days) : null
  const capital = capitalText === null ? initialCapital ?? NaN : capitalText.trim() ? Number(capitalText) : NaN
  const validCapital = Number.isFinite(capital) && capital > 0 && capital <= 1e12
  const choiceA = useFactors ? firstFactor : assetA, choiceB = useFactors ? secondFactor : assetB
  const ia = symbols.indexOf(choiceA), ib = symbols.indexOf(choiceB)
  const [a, b] = useFactors ? [choiceA, choiceB].map((key, i) => fitted && { key, label: factors.find(factor => factor.symbol === key)?.name ?? key, exposure: fitted.exposures[i] }) : [ia, ib].map(index => index >= 0 ? { key: symbols[index], label: symbols[index], exposure: symbols.map((_, i) => Number(i === index)) } : null)
  const defaultX = !useFactors && replay ? replay.shocks[ia] : -15
  const defaultY = !useFactors && replay ? replay.shocks[ib] : -10
  const selected = useFactors || !preset || Boolean(replay)
  const [grid, setGrid] = useState<StressGridResult | null>(null)
  const gridKey = selected && a && b && a.key !== b.key ? `${mode}:${a.key}:${b.key}:${replay?.start ?? ''}:${replay?.end ?? ''}` : ''
  const point = validCapital && gridKey && grid?.key === gridKey && grid.capital === capital ? grid.point : null
  return <>
    <RiskSummary historical={historical} highest={highest} observations={observations} window={window} scenario={point} currency={currency} />
    <RiskPanel index="02 / Scenario analysis" title="Portfolio stress testing" subtitle="Shock two holdings or market proxies together. Inspect their estimated impact in your portfolio’s own currency.">
      <FieldGroup className="risk-fields">
        <Field className="analytics-field"><FieldLabel htmlFor="risk-shock-model">Shock model</FieldLabel><select id="risk-shock-model" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="assets">Direct holdings</option><option value="factors" disabled={!currency || !symbols.length}>Market factor proxies</option></select></Field>
        <NumericField id="risk-capital" label={`Portfolio capital${currency ? ` (${currency})` : ''}`} min={0.01} max={1e12} value={capitalText ?? (initialCapital == null ? '' : Number(initialCapital.toFixed(2)))} onValue={setCapital} />
        {[0, 1].map(i => <Field className="analytics-field" key={i}><FieldLabel htmlFor={`risk-axis-${i}`}>{i ? 'Y axis' : 'X axis'}</FieldLabel><select id={`risk-axis-${i}`} value={i ? choiceB : choiceA} onChange={event => (useFactors ? i ? setFactorB : setFactorA : i ? setAssetB : setAssetA)(event.target.value)}>
          <option value="" disabled>Select {useFactors ? 'factor' : 'holding'}</option>{(useFactors ? factors : symbols.map(symbol => ({ symbol, name: symbol }))).map(item => <option key={item.symbol} value={item.symbol} disabled={item.symbol === (i ? choiceA : choiceB)}>{item.name}</option>)}
        </select></Field>)}
        {!useFactors && <Field className="analytics-field"><FieldLabel htmlFor="risk-scenario-type">Scenario</FieldLabel><select id="risk-scenario-type" value={preset} onChange={event => {
          const id = event.target.value, definition = HISTORICAL_WINDOWS.find(item => item.id === id)
          const dates = definition ? { start: definition.start, end: definition.end } : (draftDates.start && draftDates.end ? draftDates : { start: HISTORICAL_WINDOWS[1].start, end: HISTORICAL_WINDOWS[1].end })
          setPreset(id); setDates(dates); setBounds(id ? dates : undefined); setDateError('')
        }}><option value="">Hypothetical · user-defined</option><optgroup label="Historical · verified data only">{HISTORICAL_WINDOWS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="custom">Custom historical dates</option></optgroup></select></Field>}
      </FieldGroup>
      {initialCapital != null && capitalText !== null && <div><button type="button" className="button small" onClick={() => setCapital(null)}>Reset capital</button></div>}
      {useFactors && <p className="method-note">Hypothetical only. Joint OLS betas for each holding use at least 60 aligned sessions; proxy return shocks are multiplied by the two betas. No intercept, cross term, or claim of causality. {fitted ? `${fitted.observations} matched observations.` : ''}</p>}
      {!useFactors && preset && <form className="risk-date-form" onSubmit={event => {
        event.preventDefault()
        const span = Date.parse(draftDates.end) - Date.parse(draftDates.start)
        if (!Number.isFinite(span) || span <= 0 || span > 730 * 86_400_000 || draftDates.end > new Date().toISOString().slice(0, 10)) { setDateError('Choose two past dates in order, up to two years apart.'); return }
        setDateError(''); setBounds(draftDates)
      }}><label className="risk-date-field" htmlFor="risk-replay-start">Replay start<input id="risk-replay-start" type="date" required value={draftDates.start} onChange={event => setDates({ ...draftDates, start: event.target.value })} /></label><label className="risk-date-field" htmlFor="risk-replay-end">Replay end<input id="risk-replay-end" type="date" required value={draftDates.end} onChange={event => setDates({ ...draftDates, end: event.target.value })} /></label><button type="submit" className="button small">Apply dates</button></form>}
      {dateError && <p className="method-note" role="status">{dateError}</p>}
      {!useFactors && preset && (replay ? <p className="risk-insight"><strong>Verified replay · {replay.start} to {replay.end}</strong><span>{replayHistory.data?.sources} · Current weights; the default marker uses observed asset moves. Editing a shock creates a hypothetical overlay; other holdings keep their observed moves.</span></p> : <div className="risk-empty" role="status">{replayHistory.isLoading ? 'Requesting verified closes within the replay window…' : 'Replay unavailable: every holding needs shared closes within seven calendar days of both requested endpoints.'}{Boolean(replayHistory.data?.errors.length) && <ul>{replayHistory.data?.errors.map(error => <li key={error}>{error}</li>)}</ul>}</div>)}
      {useFactors && !fitted && <div className="risk-empty" role="status">{factorHistory.isLoading ? 'Loading market proxy history…' : 'Factor exposures are unavailable. Verify price coverage, choose a longer period, or select a less collinear pair.'}{Boolean(factorHistory.data?.errors.length) && <ul>{factorHistory.data?.errors.map(error => <li key={error}>{error}</li>)}</ul>}</div>}
      {!useFactors && symbols.length < 2 && <p className="risk-empty">Direct two-axis testing requires two holdings. A single holding can use market factor mode once prices are verified.</p>}
      {gridKey && a && b && currency && <StressGrid key={gridKey} id={gridKey} a={a} b={b} base={replay?.shocks.map((shock, i) => i === ia || i === ib ? 0 : shock)} defaults={[defaultX ?? -15, defaultY ?? -10]} capital={capital} validCapital={validCapital} currency={currency} allocation={allocation} dark={dark} onResult={setGrid} eventLabel={preset && !useFactors ? HISTORICAL_WINDOWS.find(item => item.id === preset)?.label ?? 'Custom historical dates' : 'Hypothetical'} replay={replay} />}
      <p className="method-note">A holding contributes its weight × starting capital × price move. Unshocked positions and idle cash remain unchanged in hypothetical direct shocks. Estimated holding losses cannot exceed their marked value. No FX conversion, fees, or dividends.</p>
    </RiskPanel>
  </>
}

type ScenarioSummary = { pnl: number; worst?: { symbol: string; pnl: number } }
type StressGridResult = { key: string; capital: number; point: ScenarioSummary | null }
function StressGrid({ id, a, b, base, defaults, capital, validCapital, currency, allocation, dark, onResult, eventLabel, replay }: { id: string; a: ShockAxis; b: ShockAxis; base?: number[]; defaults: [number, number]; capital: number; validCapital: boolean; currency: SampleCurrency; allocation: RiskAllocation[]; dark: boolean; onResult: (value: StressGridResult) => void; eventLabel: string; replay: Replay | null }) {
  const [xText, setX] = useState<string | null>(null), [yText, setY] = useState<string | null>(null)
  const initial = (value: number) => [Math.max(-100, Math.min(-30, Math.floor(value / 10) * 10)), Math.max(30, Math.ceil(value / 10) * 10)]
  const [rangeText, setRange] = useState<string[]>(() => [...initial(defaults[0]), ...initial(defaults[1])].map(String))
  const [xMin, xMax, yMin, yMax] = rangeText.map(value => value.trim() ? Number(value) : NaN)
  const shockCeiling = Math.max(2000, xMax, yMax, ...defaults)
  const validRange = [xMin, xMax, yMin, yMax].every(Number.isFinite) && xMin >= -100 && yMin >= -100 && Math.max(xMax, yMax) <= Math.max(2000, ...defaults.map(value => Math.ceil(value / 10) * 10)) && xMax > xMin && yMax > yMin
  const read = (value: string | null, fallback: number) => value === null ? fallback : value.trim() ? Number(value) : NaN
  const sx = read(xText, defaults[0]), sy = read(yText, defaults[1])
  const validShock = sx >= xMin && sx <= xMax && sy >= yMin && sy <= yMax
  const point = validCapital && validRange && validShock ? stressPoint(capital, allocation, a, b, sx, sy, base) : null
  const pnl = point?.pnl, worstPnl = point?.worst?.pnl, worstSymbol = point?.worst?.symbol
  useEffect(() => {
    onResult({ key: id, capital, point: pnl == null ? null : { pnl, worst: worstPnl != null && worstSymbol ? { symbol: worstSymbol, pnl: worstPnl } : undefined } })
  }, [id, capital, pnl, worstPnl, worstSymbol, onResult])
  const money = (v: number) => priceLabel(v, currency, 2)
  const surface = ((): SurfaceData | null => {
    if (!validCapital || !validRange) return null
    const values = (min: number, max: number) => Array.from(new Set([...Array.from({ length: 13 }, (_, i) => min + (max - min) * i / 12), ...(min < 0 && max > 0 ? [0] : [])])).sort((l, r) => l - r)
    const withPoint = (arr: number[], value: number, include: boolean) => include ? [...new Set([...arr, value])].sort((l, r) => l - r) : arr
    const x = withPoint(values(xMin, xMax), sx, validShock), y = withPoint(values(yMin, yMax), sy, validShock)
    const z = x.map(xValue => y.map(yValue => stressPoint(capital, allocation, a, b, xValue, yValue, base).pnl))
    const format = (value: number) => priceLabel(value, currency, 2)
    return {
      x, y, z, linearAxes: true, labels: [`${a.label} shock (%)`, `${b.label} shock (%)`, `Portfolio P&L (${currency})`], ticks: [x.map(formatPct), y.map(formatPct)], formatValue: format,
      describe: (i, j, value) => `${a.label} ${formatPct(x[i])} · ${b.label} ${formatPct(y[j])} · P&L ${format(value)} · Ending value ${format(capital + value)}`,
      scale: { extent: Math.max(0.01, ...z.flat().map(Math.abs)), colors: ['#c34d43', dark ? '#536073' : '#d1d5dc', '#1f8c87'], legend: 'Loss ← net portfolio P&L → gain' },
      markers: validShock ? [{ i: x.indexOf(sx), j: y.indexOf(sy), color: dark ? '#fff2a8' : '#572b79', label: `Selected cell · ${format(stressPoint(capital, allocation, a, b, sx, sy, base).pnl)}` }] : [],
    }
  })()
  return <>
    <FieldGroup className="risk-fields risk-range-fields" aria-label="Shock ranges and active scenario">
      {['X minimum (%)', 'X maximum (%)', 'Y minimum (%)', 'Y maximum (%)'].map((label, i) => <NumericField key={label} id={`risk-bound-${i}`} label={label} value={rangeText[i]} min={-100} max={shockCeiling} onValue={value => setRange(current => current.map((old, j) => i === j ? value : old))} />)}
      <NumericField id="risk-selected-x" label="Selected X shock (%)" value={xText ?? formatPct(defaults[0]).slice(0, -1)} min={xMin} max={xMax} onValue={setX} />
      <NumericField id="risk-selected-y" label="Selected Y shock (%)" value={yText ?? formatPct(defaults[1]).slice(0, -1)} min={yMin} max={yMax} onValue={setY} />
    </FieldGroup>
    {!validCapital && <p className="risk-empty" role="status">Enter positive portfolio capital up to one trillion.</p>}
    {!validRange && <p className="risk-empty" role="status">Each minimum must be below its maximum. Use bounds from −100% to +2,000% (or the verified replay’s higher bound).</p>}
    {validRange && !validShock && <p className="risk-empty" role="status">Selected shocks must sit inside the displayed ranges.</p>}
    {surface && <RiskChart surface={surface} dark={dark} default3d heatmap={<RiskHeatmap data={surface} caption="Portfolio stress profit and loss" selected={validShock ? [surface.x.indexOf(sx), surface.y.indexOf(sy)] : undefined} onSelect={(i, j) => { setX(String(surface.x[i])); setY(String(surface.y[j])) }} />} onExport={() => riskCsv('quantpilot-portfolio-stress.csv', [['scenario', 'axis_a', 'axis_b', 'shock_a_pct', 'shock_b_pct', 'currency', 'starting_capital', 'pnl', 'ending_value', 'replay_start', 'replay_end', ...allocation.map(item => `${item.symbol} contribution`)], ...surface.x.flatMap(x => surface.y.map(y => {
      const estimate = stressPoint(capital, allocation, a, b, x, y, base)
      const label = replay && x === defaults[0] && y === defaults[1] ? 'Historical replay' : replay ? 'Hypothetical overlay' : 'Hypothetical'
      return [`${eventLabel} · ${label}`, a.key, b.key, x, y, currency, capital, estimate.pnl, estimate.endingValue, replay?.start ?? '', replay?.end ?? '', ...estimate.contributions.map(item => item.pnl)]
    }))])} />}
    {surface && <div className="risk-comparison" aria-label="Compare shock extremes">
      <article><strong>Lower-bound shocks</strong><span>{formatPct(xMin)} / {formatPct(yMin)} · {money(stressPoint(capital, allocation, a, b, xMin, yMin, base).pnl)} P&L</span></article>
      <article><strong>Upper-bound shocks</strong><span>{formatPct(xMax)} / {formatPct(yMax)} · {money(stressPoint(capital, allocation, a, b, xMax, yMax, base).pnl)} P&L</span></article>
      {point && <article><strong>{!replay ? 'Selected hypothetical' : sx === defaults[0] && sy === defaults[1] ? 'Selected historical replay' : 'Selected hypothetical overlay'}</strong><span>{money(point.endingValue)} ending value · {money(point.pnl)} P&L</span></article>}
    </div>}
    {point && <div className="risk-contributions"><div className="risk-grid-scroll"><table className="risk-ledger"><caption>Selected shock contributions</caption><thead><tr><th scope="col">Holding</th><th scope="col">Weight</th><th scope="col">Price move</th><th scope="col">P&L ({currency})</th></tr></thead><tbody>{point.contributions.map(item => <tr key={item.symbol}><th scope="row">{item.symbol}</th><td>{formatPct(item.weight * 100)}</td><td>{formatPct(item.shock)}{item.floored ? ' (floored)' : ''}</td><td className={item.pnl < 0 ? 'negative' : item.pnl > 0 ? 'positive' : undefined}>{money(item.pnl)}</td></tr>)}</tbody></table></div></div>}
  </>
}

