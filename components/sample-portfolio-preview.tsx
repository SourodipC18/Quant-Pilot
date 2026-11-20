'use client'

import { Area, AreaChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { priceLabel, symbolParts } from '@/lib/market-instruments'
import { SAMPLE_CAPITAL, SAMPLE_MIN_RETURNS, type SampleHolding, type SamplePortfolio } from '@/lib/sample-portfolios'
import type { useSampleHistory } from '@/components/use-sample-history'

export const allocationColor = (index: number) => `var(--chart-${index % 5 + 1})`
const performanceConfig = { close: { label: 'Portfolio index', color: 'var(--chart-1)' } }
const percentage = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(2)}%`

export function SampleAllocationBar({ holdings }: { holdings: SampleHolding[] }) {
  return <div className="sample-allocation-bar" aria-hidden="true">{holdings.map(({ symbol, weightBps }, i) => <span key={symbol} style={{ flexGrow: weightBps, backgroundColor: allocationColor(i) }} />)}</div>
}

export function SampleHistoryPreview({ sample, history, valid }: { sample: SamplePortfolio; history: ReturnType<typeof useSampleHistory>; valid: boolean }) {
  const { data, analytics, isLoading, retry } = history
  const portions = sample.holdings.filter(holding => holding.weightBps > 0).map((holding, index) => ({ name: symbolParts(holding.symbol).symbol, weight: holding.weightBps / 100, fill: allocationColor(index) }))
  return <div className="sample-preview-grid">
    <section className="panel app-panel">
      <header className="app-panel-header"><div><span className="eyebrow">01 / Composition</span><h2>Target allocation</h2></div></header>
      {portions.length ? <div className="sample-donut" aria-hidden="true"><ChartContainer config={{}} className="h-44 w-full aspect-auto"><PieChart accessibilityLayer={false}><Pie data={portions} dataKey="weight" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none" isAnimationActive={false} /></PieChart></ChartContainer><span><strong>{sample.holdings.length}</strong>instruments</span></div> : <p className="method-note">Enter positive allocations to draw the chart.</p>}
      <div className="sample-donut-key">{sample.holdings.map((holding, i) => <span key={holding.symbol}><i style={{ background: allocationColor(i) }} aria-hidden="true" />{symbolParts(holding.symbol).symbol} <strong>{holding.weightBps / 100}%</strong></span>)}</div>
      <p className="method-note">Position estimates use {priceLabel(SAMPLE_CAPITAL[sample.currency], sample.currency, 0)} of illustrative capital, not your buying power.</p>
    </section>
    <section className="panel app-panel" aria-busy={isLoading}>
      <header className="app-panel-header"><div><span className="eyebrow">02 / Observed history</span><h2>Historical performance</h2></div>{data && !analytics?.series.length && <button type="button" className="button small" disabled={isLoading} onClick={() => void retry()}>Retry history</button>}</header>
      {analytics?.series.length ? <>
        <div className="sample-metrics">{[['Period return', percentage(analytics.totalReturn)], ['Annualized volatility', percentage(analytics.annualizedRisk)], ['Historical Sharpe', analytics.sharpe?.toFixed(2) ?? '—'], ['Maximum drawdown', percentage(analytics.drawdown)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <ChartContainer config={performanceConfig} className="h-44 min-w-0 w-full aspect-auto"><AreaChart accessibilityLayer data={analytics.series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="datetime" tickFormatter={value => String(value).slice(0, 7)} minTickGap={35} tickLine={false} axisLine={false} /><YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={42} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="close" stroke="var(--color-close)" fill="var(--color-close)" fillOpacity={0.12} isAnimationActive={false} /></AreaChart></ChartContainer>
        <p className="method-note">{analytics.series[0].datetime} to {analytics.series.at(-1)?.datetime} · {analytics.observations} aligned returns · starts at 100{analytics.skipped ? ` · ${analytics.skipped} incomplete or long intervals skipped` : ''}.</p>
      </> : <div className="empty-block" role="status"><strong>{isLoading ? 'Checking provider history…' : !valid ? 'Complete your allocation' : 'Historical metrics unavailable'}</strong><p>{isLoading ? 'Daily closes are checked for each selected instrument.' : !valid ? 'Use 3–8 unique holdings totaling 100%.' : `At least ${SAMPLE_MIN_RETURNS} aligned daily returns are needed. No returns are estimated from missing data.`}</p></div>}
      <p className="method-note">Daily target-weight rebalancing, a 0% risk-free rate and up to 252 valid returns. No transaction costs or dividend reinvestment. {sample.currency === 'INR' ? 'Upstox closes are used as reported; corporate actions can affect results.' : 'Twelve Data closes are split-adjusted.'}</p>
    </section>
  </div>
}
