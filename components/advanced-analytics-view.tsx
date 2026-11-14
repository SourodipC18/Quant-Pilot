'use client'

import { useMemo, useState } from 'react'
import { Activity, BarChart3, CircleHelp, Gauge, Layers3, Shield, SlidersHorizontal, Waves, X } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { BacktestConfig, BacktestResult, historicalCVaR, monteCarloBootstrap, PricePoint, regressionRiskMetrics, runBacktest, tradeExpectancy, walkForwardValidation } from '@/lib/analytics'

type AnalyticsTab = 'Risk & factors' | 'Costs & trades' | 'Walk-forward' | 'Monte Carlo' | 'Stress lab'
type Scenario = { id: number; label: string; shock: number }
type NumericBar = PricePoint & { high?: number; low?: number; volume?: number }

const chartConfig = {
  strategy: { label: 'Strategy', color: 'var(--chart-1)' },
  benchmark: { label: 'Buy & hold', color: 'var(--chart-2)' },
  drawdown: { label: 'Drawdown', color: 'var(--chart-5)' },
  p05: { label: '5th percentile', color: 'var(--chart-5)' },
  median: { label: 'Median', color: 'var(--chart-1)' },
  p95: { label: '95th percentile', color: 'var(--chart-2)' },
  return: { label: 'Trade return', color: 'var(--chart-3)' },
  cost: { label: 'Estimated cost', color: 'var(--chart-4)' },
} satisfies ChartConfig

const tabs: { label: AnalyticsTab; icon: typeof Activity; description: string }[] = [
  { label: 'Risk & factors', icon: Gauge, description: 'Regression, drawdown, and return behavior' },
  { label: 'Costs & trades', icon: SlidersHorizontal, description: 'Execution assumptions and trade economics' },
  { label: 'Walk-forward', icon: Layers3, description: 'Training windows and held-out periods' },
  { label: 'Monte Carlo', icon: Waves, description: 'Bootstrap outcome distributions' },
  { label: 'Stress lab', icon: Shield, description: 'Editable shock scenarios' },
]

const money = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: digits })
const number = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
const percent = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`

function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel app-panel ${className}`}><header className="app-panel-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</header>{children}</section>
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'positive' | 'negative' }) {
  return <article className="metric-card"><span>{label}</span><strong className={tone}>{value}</strong><small>{note}</small></article>
}

function NumberField({ id, label, value, min, max, step = 1, onChange, suffix }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string }) {
  return <Field className="analytics-field"><FieldLabel htmlFor={id}>{label}{suffix && <span className="input-inline-value">{suffix}</span>}</FieldLabel><input id={id} type="number" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></Field>
}

function drawdownPath(equity: BacktestResult['equity']) {
  let peak = 0
  return equity.map(point => {
    peak = Math.max(peak, point.value)
    return { date: point.datetime.slice(0, 10), drawdown: peak ? point.value / peak - 1 : 0 }
  })
}

function recoveryStats(equity: BacktestResult['equity']) {
  let peakValue = -Infinity, peakIndex = 0, longestRecoveryBars = 0
  equity.forEach((point, index) => {
    if (point.value >= peakValue) {
      longestRecoveryBars = Math.max(longestRecoveryBars, index - peakIndex)
      peakValue = point.value
      peakIndex = index
    }
  })
  return { longestRecoveryBars, currentDrawdownBars: equity.length ? equity.length - 1 - peakIndex : 0 }
}

function makeHistogram(values: number[], count = 12) {
  if (!values.length) return []
  const min = Math.min(...values), max = Math.max(...values)
  const width = Math.max((max - min) / count, 0.0001)
  const bins = Array.from({ length: count }, (_, index) => ({ bin: String(index), count: 0, midpoint: min + width * (index + 0.5) }))
  for (const value of values) bins[Math.min(count - 1, Math.max(0, Math.floor((value - min) / width)))].count += 1
  return bins.map(bin => ({ ...bin, bin: `${(bin.midpoint * 100).toFixed(1)}%` }))
}

export function AdvancedAnalyticsView({ symbol, bars, config, result, loading, range, setRange }: { symbol: string; bars: NumericBar[]; config: BacktestConfig; result: BacktestResult; loading: boolean; range: string; setRange: (value: string) => void }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('Risk & factors')
  const [commissionBps, setCommissionBps] = useState(config.commissionBps)
  const [slippageBps, setSlippageBps] = useState(config.slippageBps)
  const [marketImpactBps, setMarketImpactBps] = useState(config.marketImpactBps ?? 0)
  const [capital, setCapital] = useState(config.initialCapital)
  const [allocationPct, setAllocationPct] = useState(config.allocationPct)
  const [riskFreeRate, setRiskFreeRate] = useState(0)
  const [confidence, setConfidence] = useState(95)
  const [trainingBars, setTrainingBars] = useState(252)
  const [testingBars, setTestingBars] = useState(63)
  const [rollingWindow, setRollingWindow] = useState(false)
  const [simulationDays, setSimulationDays] = useState(252)
  const [simulationPaths, setSimulationPaths] = useState(1200)
  const [simulationSeed, setSimulationSeed] = useState(42)
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 1, label: 'Broad risk-off', shock: -20 },
    { id: 2, label: 'Volatility spike', shock: -12 },
    { id: 3, label: 'Rate shock', shock: -8 },
    { id: 4, label: 'Positive repricing', shock: 10 },
  ])
  const [customLabel, setCustomLabel] = useState('Custom event')
  const [customShock, setCustomShock] = useState(-15)

  const pricedBars = useMemo(() => bars.map(({ datetime, close, open, high, low }) => ({ datetime, close, open, high, low })), [bars])
  const costResult = useMemo(() => runBacktest(pricedBars, { ...config, initialCapital: capital, allocationPct, commissionBps, slippageBps, marketImpactBps }), [pricedBars, config, capital, allocationPct, commissionBps, slippageBps, marketImpactBps])
  const strategyReturns = useMemo(() => costResult.equity.slice(1).map((point, index) => point.value / costResult.equity[index].value - 1), [costResult.equity])
  const benchmarkReturns = useMemo(() => costResult.equity.slice(1).map((point, index) => point.benchmark / costResult.equity[index].benchmark - 1), [costResult.equity])
  const factorMetrics = useMemo(() => regressionRiskMetrics(strategyReturns, benchmarkReturns, riskFreeRate / 100), [strategyReturns, benchmarkReturns, riskFreeRate])
  const expectancy = useMemo(() => tradeExpectancy(costResult.trades), [costResult.trades])
  const regressionData = useMemo(() => strategyReturns.map((strategyReturn, index) => ({ benchmark: benchmarkReturns[index] * 100, strategy: strategyReturn * 100 })), [strategyReturns, benchmarkReturns])
  const drawdowns = useMemo(() => drawdownPath(costResult.equity), [costResult.equity])
  const recovery = useMemo(() => recoveryStats(costResult.equity), [costResult.equity])
  const historyReturns = useMemo(() => strategyReturns.filter(Number.isFinite), [strategyReturns])
  const simulations = useMemo(() => monteCarloBootstrap(historyReturns, capital, simulationDays, simulationPaths, simulationSeed), [historyReturns, capital, simulationDays, simulationPaths, simulationSeed])
  const folds = useMemo(() => walkForwardValidation(pricedBars, { ...config, initialCapital: capital, commissionBps, slippageBps, marketImpactBps }, { trainBars: trainingBars, testBars: testingBars, rolling: rollingWindow, candidates: [
    { fastWindow: config.fastWindow, slowWindow: config.slowWindow },
    { fastWindow: config.fastWindow + 5, slowWindow: config.slowWindow + 10 },
    { fastWindow: config.fastWindow + 10, slowWindow: config.slowWindow + 20 },
    { fastWindow: config.fastWindow + 15, slowWindow: config.slowWindow + 30 },
  ] }), [pricedBars, config, capital, commissionBps, slippageBps, marketImpactBps, trainingBars, testingBars, rollingWindow])
  const tradeHistogram = useMemo(() => makeHistogram(costResult.trades.map(trade => trade.return)), [costResult.trades])
  const estimatedTradeCosts = costResult.trades.reduce((sum, trade) => sum + trade.costs, 0)
  const costShares = commissionBps + slippageBps + marketImpactBps || 1
  const costBreakdown = [
    { name: 'Commission', value: estimatedTradeCosts * commissionBps / costShares },
    { name: 'Slippage', value: estimatedTradeCosts * slippageBps / costShares },
    { name: 'Market impact', value: estimatedTradeCosts * marketImpactBps / costShares },
  ]
  const returnsSorted = [...historyReturns].sort((a, b) => a - b)
  const varIndex = Math.max(0, Math.floor((100 - confidence) / 100 * (returnsSorted.length - 1)))
  const varLevel = returnsSorted.length ? returnsSorted[varIndex] : null
  const expectedShortfall = historicalCVaR(historyReturns, confidence / 100)
  const stressData = scenarios.map(scenario => ({ ...scenario, pnl: capital * allocationPct / 100 * scenario.shock / 100 }))
  const canCalculate = pricedBars.length >= 60 && !loading

  function updateScenario(id: number, field: 'label' | 'shock', value: string) {
    setScenarios(items => items.map(item => item.id === id ? { ...item, [field]: field === 'shock' ? Number(value) : value } : item))
  }

  function addScenario() {
    const id = Math.max(0, ...scenarios.map(item => item.id)) + 1
    setScenarios(items => [...items, { id, label: customLabel.trim() || `Scenario ${id}`, shock: Math.max(-100, Math.min(100, customShock)) }])
  }

  return <div className="advanced-analytics" aria-label={`${symbol} advanced analytics`}>
    <div className="analytics-toolbar panel">
      <div><span className="eyebrow">Quant research suite · {symbol}</span><strong>Configurable model diagnostics</strong><small>Change assumptions to recalculate every related chart and estimate.</small></div>
      <div className="analytics-source"><span className="status-dot" />{pricedBars.length.toLocaleString()} daily observations<span className="toolbar-divider" />{costResult.trades.length} closed trades<span className="toolbar-divider" /><div className="range-tabs" role="group" aria-label="Analytics history range">{['1M', '3M', '6M', '1Y', '3Y', 'All'].map(value => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)} className={range === value ? 'active' : ''}>{value}</button>)}</div></div>
    </div>
    <div className="analytics-tabs" role="tablist" aria-label="Advanced analytics modules">{tabs.map(({ label, icon: Icon, description }) => <button id={`analytics-tab-${label.replaceAll(' ', '-').replace('&', 'and').toLowerCase()}`} aria-controls="analytics-panel" aria-selected={activeTab === label} role="tab" type="button" key={label} className={activeTab === label ? 'active' : ''} onClick={() => setActiveTab(label)} title={description}><Icon aria-hidden="true" />{label}</button>)}</div>
    {!canCalculate && <div className="analytics-notice panel" role="status"><CircleHelp aria-hidden="true" /><span>{loading ? 'Loading provider-sourced price history…' : 'At least 60 daily observations are needed for stable, comparable analytics.'}</span></div>}
    <section id="analytics-panel" role="tabpanel" aria-labelledby={`analytics-tab-${activeTab.replaceAll(' ', '-').replace('&', 'and').toLowerCase()}`} className="analytics-tab-panel">
      {activeTab === 'Risk & factors' && <>
        <div className="metrics-grid advanced-metrics"><Metric label="Annualized alpha" value={percent(factorMetrics.alpha)} note="OLS intercept vs buy-and-hold" tone={(factorMetrics.alpha ?? 0) >= 0 ? 'positive' : 'negative'} /><Metric label="Asset beta" value={number(factorMetrics.beta, 3)} note="Sensitivity vs buy-and-hold" /><Metric label={`${confidence}% historical VaR`} value={percent(varLevel)} note="Single-session empirical tail" tone="negative" /><Metric label="Tracking error" value={percent(factorMetrics.trackingError)} note={`IR ${number(factorMetrics.informationRatio)}`} /></div>
        <div className="analytic-chart-grid"><Panel title="Strategy drawdown profile" eyebrow="Peak-to-trough equity loss" className="advanced-chart-panel"><ChartContainer config={chartConfig} className="advanced-chart"><AreaChart data={drawdowns} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={35} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `${(Number(value) * 100).toFixed(0)}%`} width={46} /><ChartTooltip content={<ChartTooltipContent formatter={value => percent(Number(value))} />} /><Area dataKey="drawdown" type="monotone" stroke="var(--color-drawdown)" fill="var(--color-drawdown)" fillOpacity={0.15} strokeWidth={1.8} dot={false} /></AreaChart></ChartContainer><p className="method-note">Current max drawdown: {percent(costResult.maxDrawdown)} · daily close-based equity path.</p></Panel>
          <Panel title="Return sensitivity" eyebrow="Strategy vs buy-and-hold daily return" className="advanced-chart-panel"><ChartContainer config={chartConfig} className="advanced-chart"><ScatterChart accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis type="number" dataKey="benchmark" name="Benchmark return" unit="%" tickLine={false} axisLine={false} /><YAxis type="number" dataKey="strategy" name="Strategy return" unit="%" tickLine={false} axisLine={false} width={42} /><ZAxis range={[24, 24]} /><ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltipContent formatter={value => `${number(Number(value), 2)}%`} />} /><Scatter data={regressionData} fill="var(--color-strategy)" fillOpacity={0.45} /></ScatterChart></ChartContainer><div className="analytics-inline-stats"><span>Correlation <strong>{number(factorMetrics.correlation, 3)}</strong></span><span>Annualized vol <strong>{percent(costResult.annualizedVolatility)}</strong></span><span>Expected shortfall <strong>{percent(expectedShortfall)}</strong></span><span>Sortino <strong>{number(costResult.sortino)}</strong></span><span>Exposure <strong>{percent(costResult.exposure)}</strong></span><span>Turnover <strong>{number(costResult.turnover, 2)}×</strong></span><span>Longest recovery <strong>{recovery.longestRecoveryBars} bars</strong></span><span>Current underwater <strong>{recovery.currentDrawdownBars} bars</strong></span></div></Panel></div>
        <Panel title="Risk model assumptions" eyebrow="Editable annualization and confidence levels"><FieldGroup className="analytics-control-grid"><NumberField id="risk-free-rate" label="Annual risk-free rate" value={riskFreeRate} min={-10} max={30} step={0.1} suffix="%" onChange={setRiskFreeRate} /><NumberField id="var-confidence" label="VaR confidence" value={confidence} min={80} max={99} suffix="%" onChange={setConfidence} /></FieldGroup><p className="method-note">Alpha/beta use aligned daily strategy and benchmark returns. VaR is historical and does not forecast future losses.</p></Panel>
      </>}
      {activeTab === 'Costs & trades' && <>
        <Panel title="Execution and capital assumptions" eyebrow="Re-run the strategy with editable frictions"><FieldGroup className="analytics-control-grid"><NumberField id="initial-capital" label="Starting capital" value={capital} min={100} max={100000000} step={1000} onChange={setCapital} /><NumberField id="allocation" label="Position allocation" value={allocationPct} min={1} max={100} suffix="%" onChange={setAllocationPct} /><NumberField id="commission-bps" label="Commission" value={commissionBps} min={0} max={500} suffix="bps" onChange={setCommissionBps} /><NumberField id="slippage-bps" label="Slippage" value={slippageBps} min={0} max={500} suffix="bps" onChange={setSlippageBps} /><NumberField id="impact-bps" label="Market impact" value={marketImpactBps} min={0} max={1000} suffix="bps" onChange={setMarketImpactBps} /></FieldGroup><p className="method-note">All frictions are modeled as additive basis points on each executed notional; impact is a user assumption, not inferred from incomplete volume data.</p></Panel>
        <div className="metrics-grid advanced-metrics"><Metric label="Net expectancy / trade" value={money(expectancy.expectancy)} note={`${number(expectancy.winRate == null ? null : expectancy.winRate * 100, 1)}% wins`} tone={(expectancy.expectancy ?? 0) >= 0 ? 'positive' : 'negative'} /><Metric label="Profit factor" value={number(expectancy.profitFactor)} note={`Payoff ratio ${number(expectancy.payoffRatio)}`} /><Metric label="Estimated total costs" value={money(estimatedTradeCosts)} note="Commission + slippage + impact" tone="negative" /><Metric label="Net turnover" value={`${number(costResult.turnover, 2)}×`} note={`${number(costResult.exposure == null ? null : costResult.exposure * 100, 1)}% time invested`} /></div>
        <div className="analytic-chart-grid"><Panel title="Closed trade return distribution" eyebrow={`${costResult.trades.length} trades · net of configured costs`} className="advanced-chart-panel"><ChartContainer config={chartConfig} className="advanced-chart"><BarChart data={tradeHistogram} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="bin" tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" name="Trades" fill="var(--color-return)" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer><p className="method-note">Mean trade P&amp;L uses net proceeds after both-side transaction costs.</p></Panel>
          <Panel title="Estimated cost attribution" eyebrow={`${number(commissionBps + slippageBps + marketImpactBps, 1)} bps per side`} className="advanced-chart-panel"><ChartContainer config={chartConfig} className="advanced-chart"><BarChart data={costBreakdown} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `$${number(Number(value), 0)}`} width={52} /><ChartTooltip content={<ChartTooltipContent formatter={value => money(Number(value))} />} /><Bar dataKey="value" name="Estimated cost" fill="var(--color-cost)" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer><p className="method-note">Flat-bps approximation; excludes taxes, borrow fees, and nonlinear market impact.</p></Panel></div>
        <Panel title="Trade ledger" eyebrow="Execution-level results"><div className="table-scroll"><table className="data-table"><thead><tr><th>Entry</th><th>Exit</th><th>Entry px</th><th>Exit px</th><th>Net return</th><th>Net P&amp;L</th><th>Estimated costs</th><th>Bars</th></tr></thead><tbody>{costResult.trades.slice(-20).reverse().map((trade, index) => <tr key={`${trade.entryDate}-${index}`}><td>{trade.entryDate.slice(0, 10)}</td><td>{trade.exitDate.slice(0, 10)}</td><td>{money(trade.entryPrice, 2)}</td><td>{money(trade.exitPrice, 2)}</td><td className={trade.return >= 0 ? 'positive' : 'negative'}>{percent(trade.return)}</td><td className={trade.pnl >= 0 ? 'positive' : 'negative'}>{money(trade.pnl)}</td><td>{money(trade.costs)}</td><td>{trade.barsHeld}</td></tr>)}</tbody></table>{!costResult.trades.length && <div className="chart-placeholder">No completed trades under the current assumptions.</div>}</div></Panel>
      </>}
      {activeTab === 'Walk-forward' && <>
        <Panel title="Out-of-sample protocol" eyebrow="Choose training and held-out periods"><FieldGroup className="analytics-control-grid"><NumberField id="training-bars" label="Training window" value={trainingBars} min={60} max={2000} step={20} suffix="bars" onChange={setTrainingBars} /><NumberField id="testing-bars" label="Test window" value={testingBars} min={20} max={500} step={5} suffix="bars" onChange={setTestingBars} /><Field className="analytics-field"><FieldLabel htmlFor="rolling-window">Training scheme</FieldLabel><select id="rolling-window" value={rollingWindow ? 'rolling' : 'expanding'} onChange={event => setRollingWindow(event.target.value === 'rolling')}><option value="expanding">Expanding history</option><option value="rolling">Rolling fixed length</option></select></Field></FieldGroup><div className="analytics-inline-stats"><span>Fold count <strong>{folds.length}</strong></span><span>Average OOS return <strong className={(folds.reduce((sum, fold) => sum + (fold.outOfSampleReturn ?? 0), 0) >= 0) ? 'positive' : 'negative'}>{percent(folds.length ? folds.reduce((sum, fold) => sum + (fold.outOfSampleReturn ?? 0), 0) / folds.length : null)}</strong></span><span>Positive folds <strong>{folds.filter(fold => (fold.outOfSampleReturn ?? 0) > 0).length} / {folds.length}</strong></span></div><p className="method-note">Each fold chooses a fast/slow SMA pair on training data only, then reports the next held-out segment. Results are sequential, hypothetical, and sensitive to the candidate grid.</p></Panel>
        <Panel title="Held-out fold performance" eyebrow="No test-period parameter selection"><ChartContainer config={chartConfig} className="advanced-chart"><BarChart data={folds.map((fold, index) => ({ ...fold, fold: `Fold ${index + 1}`, oos: (fold.outOfSampleReturn ?? 0) * 100 }))} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="fold" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Number(value).toFixed(0)}%`} /><ChartTooltip content={<ChartTooltipContent formatter={value => `${number(Number(value))}%`} />} /><Bar dataKey="oos" name="Held-out return" fill="var(--color-strategy)" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer><div className="table-scroll"><table className="data-table"><thead><tr><th>Fold</th><th>Training period</th><th>Held-out period</th><th>Selected SMA</th><th>Train Sharpe</th><th>OOS return</th></tr></thead><tbody>{folds.map((fold, index) => <tr key={`${fold.testStart}-${index}`}><td>{index + 1}</td><td>{fold.trainStart.slice(0, 10)} → {fold.trainEnd.slice(0, 10)}</td><td>{fold.testStart.slice(0, 10)} → {fold.testEnd.slice(0, 10)}</td><td>{fold.fastWindow} / {fold.slowWindow}</td><td>{number(fold.trainingSharpe)}</td><td className={(fold.outOfSampleReturn ?? 0) >= 0 ? 'positive' : 'negative'}>{percent(fold.outOfSampleReturn)}</td></tr>)}</tbody></table>{!folds.length && <div className="chart-placeholder">Increase history or reduce the training window to create validation folds.</div>}</div></Panel>
      </>}
      {activeTab === 'Monte Carlo' && <>
        <Panel title="Bootstrap design" eyebrow="Resample net historical strategy returns with replacement"><FieldGroup className="analytics-control-grid"><NumberField id="simulation-days" label="Projection horizon" value={simulationDays} min={20} max={504} step={20} suffix="sessions" onChange={setSimulationDays} /><NumberField id="simulation-paths" label="Simulation paths" value={simulationPaths} min={100} max={2000} step={100} onChange={setSimulationPaths} /><NumberField id="simulation-seed" label="Random seed" value={simulationSeed} min={1} max={2147483647} onChange={setSimulationSeed} /><NumberField id="simulation-capital" label="Starting capital" value={capital} min={100} max={100000000} step={1000} onChange={setCapital} /></FieldGroup><div className="analytics-inline-stats"><span>5th percentile <strong>{money(simulations.terminalP05)}</strong></span><span>Median ending value <strong>{money(simulations.terminalMedian)}</strong></span><span>95th percentile <strong>{money(simulations.terminalP95)}</strong></span><span>Probability below start <strong>{percent(simulations.probabilityOfLoss)}</strong></span><span>5th percentile max drawdown <strong className="negative">{percent(simulations.maxDrawdownP05)}</strong></span></div><p className="method-note">Historical-return bootstrap assumes exchangeable observations. It does not model regime shifts, liquidity, changing volatility, or future costs; the fan is illustrative, not predictive.</p></Panel>
        <Panel title="Simulated terminal-value fan" eyebrow={`${number(simulationPaths, 0)} deterministic bootstrap paths · ${number(simulationDays, 0)} sessions`}><ChartContainer config={chartConfig} className="advanced-chart"><AreaChart data={simulations.fan} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="step" tickLine={false} axisLine={false} tickFormatter={value => `${value}`} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => money(Number(value))} width={70} /><ChartTooltip content={<ChartTooltipContent formatter={value => money(Number(value))} />} /><Area dataKey="p95" name="95th percentile" stroke="var(--color-p95)" fill="var(--color-p95)" fillOpacity={0.06} strokeWidth={1} dot={false} /><Area dataKey="p05" name="5th percentile" stroke="var(--color-p05)" fill="var(--color-p05)" fillOpacity={0.08} strokeWidth={1} dot={false} /><Line dataKey="median" name="Median" stroke="var(--color-median)" strokeWidth={2} dot={false} /></AreaChart></ChartContainer></Panel>
      </>}
      {activeTab === 'Stress lab' && <>
        <Panel title="Scenario definitions" eyebrow="Adjust shocks; impacts scale by invested notional"><FieldGroup className="analytics-control-grid">{scenarios.map(scenario => <div className="scenario-editor" key={scenario.id}><Field className="analytics-field"><FieldLabel htmlFor={`scenario-name-${scenario.id}`}>Scenario label</FieldLabel><input id={`scenario-name-${scenario.id}`} value={scenario.label} onChange={event => updateScenario(scenario.id, 'label', event.target.value)} maxLength={40} /></Field><NumberField id={`scenario-shock-${scenario.id}`} label="One-step shock" value={scenario.shock} min={-100} max={100} suffix="%" onChange={value => updateScenario(scenario.id, 'shock', String(value))} /><button className="icon-button danger-text" type="button" aria-label={`Remove ${scenario.label}`} onClick={() => setScenarios(items => items.filter(item => item.id !== scenario.id))}><X aria-hidden="true" /></button></div>)}<div className="scenario-add"><Field className="analytics-field"><FieldLabel htmlFor="custom-scenario-label">New scenario</FieldLabel><input id="custom-scenario-label" value={customLabel} onChange={event => setCustomLabel(event.target.value)} maxLength={40} /></Field><NumberField id="custom-scenario-shock" label="One-step shock" value={customShock} min={-100} max={100} suffix="%" onChange={setCustomShock} /><button className="button small" type="button" onClick={addScenario}>Add scenario</button></div></FieldGroup><p className="method-note">Stress loss = starting capital × allocation × shock. This is a transparent first-order sensitivity, not a full repricing model or historical market replay.</p></Panel>
        <div className="metrics-grid advanced-metrics"><Metric label="Worst configured shock" value={percent(scenarios.length ? Math.min(...scenarios.map(scenario => scenario.shock)) / 100 : null)} note="User-defined scenario set" tone="negative" /><Metric label="Worst-case modeled loss" value={money(Math.min(0, ...stressData.map(item => item.pnl)))} note="Current starting capital & allocation" tone="negative" /><Metric label="Position notional" value={money(capital * allocationPct / 100)} note={`${number(allocationPct, 1)}% of starting capital`} /></div>
        <Panel title="Shock sensitivity" eyebrow="Estimated one-step P&amp;L by scenario"><ChartContainer config={chartConfig} className="advanced-chart"><BarChart data={stressData} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => money(Number(value))} width={72} /><ChartTooltip content={<ChartTooltipContent formatter={value => money(Number(value))} />} /><Bar dataKey="pnl" name="Modeled P&amp;L" fill="var(--color-drawdown)" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer></Panel>
      </>}
    </section>
    <footer className="analytics-footnote"><BarChart3 aria-hidden="true" /><span>Models use source-provided daily bars and user-configured assumptions. Outputs are hypothetical research estimates, not financial advice or predictions.</span><span className="analytics-method"><CircleHelp aria-hidden="true" /> Methodology-aware</span></footer>
  </div>
}
