'use client'

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'
import { percentage } from './risk-surface-grid'
import { riskCsv } from './risk-chart'
import { priceLabel } from '@/lib/market-instruments'
import type { fullDrawdown } from '@/lib/advanced-risk'

const chart = { value: { label: 'Full-period drawdown', color: 'var(--accent-blue)' } }

export function DrawdownChart({ result, currency }: { result: ReturnType<typeof fullDrawdown>; currency: string }) {
  const { points, worst } = result
  if (points.length < 2) return null
  return <section className="advanced-drawdown-line" aria-label="Full-period drawdown">
    <div className="risk-chart-toolbar"><h3>Full-period drawdown</h3><button type="button" className="button small" onClick={() => riskCsv('full-period-drawdown.csv', [['Date', 'Drawdown (decimal)'], ...points.map(point => [point.date, point.value])])}>Export full-period CSV</button></div>
    <p className="method-note">Loss from the previous high over each uninterrupted span of the selected range, without a rolling lookback. Gaps restart the high-water mark. The highlighted worst period requires at least 20 uninterrupted returns.</p>
    {worst && <p className="risk-insight"><strong>{percentage(worst.value)} peak-to-trough</strong><span>{worst.peak} ({priceLabel(worst.peakValue, currency)}) → {worst.trough} ({priceLabel(worst.troughValue, currency)}) · {worst.recovery ? `Recovered ${worst.recovery} · ${worst.recoverySessions} sessions after trough` : 'Recovery not observed within the uninterrupted span'}</span></p>}
    <ChartContainer config={chart} className="advanced-drawdown-plot">
      <LineChart accessibilityLayer data={points} margin={{ right: 12, top: 10 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" minTickGap={45} tickLine={false} tickFormatter={(date: string) => date.slice(0, 7)} />
        <YAxis width={58} tickLine={false} domain={['dataMin', 0]} tickFormatter={percentage} />
        {worst && <ReferenceArea x1={worst.peak} x2={worst.recovery ?? worst.trough} fill="var(--color-value)" fillOpacity={0.09} />}
        {worst && <ReferenceDot x={worst.trough} y={worst.value} r={4} fill="var(--color-value)" />}
        <ChartTooltip content={<ChartTooltipContent formatter={value => typeof value === 'number' ? percentage(value) : 'Unavailable'} />} />
        <Line type="linear" dataKey="value" stroke="var(--color-value)" strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  </section>
}
