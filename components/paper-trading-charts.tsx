'use client'

import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { priceLabel } from '@/lib/market-instruments'
import type { PaperAccount } from '@/lib/paper-trading-types'

const config = {
  close: { label: 'Close', color: 'var(--chart-1)' }, equity: { label: 'Equity', color: 'var(--chart-1)' },
  pnl: { label: 'Net P&L', color: 'var(--chart-1)' }, realized: { label: 'Realized', color: 'var(--chart-2)' }, unrealized: { label: 'Unrealized', color: 'var(--chart-3)' },
}
const compactUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 })
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const shortTime = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' })
const short = (stamp: string) => shortDate.format(new Date(stamp))
const axis = { axisLine: false, tickLine: false, tick: { fill: 'var(--muted)', fontSize: 10 } }

export function PaperPriceChart({ values,account,symbol }: { values: { datetime: string; close: number }[]; account?:PaperAccount;symbol:string }) {
  const pos=account?.positions.find(p=>p.symbol===symbol), levels=account?.orders.filter(o=>o.symbol===symbol&&o.status==='pending').flatMap(o=>(['limit','stop','target'] as const).filter(k=>o[k]).map(k=>({id:o.id+k,label:k,value:o[k]!})))??[]
  const days=new Set(values.map(v=>v.datetime)), fills=account?.trades.filter(t=>t.symbol===symbol&&days.has(t.markDate.slice(0,10)))??[]
  const id = useId()
  return <ChartContainer config={config} className="paper-price-chart w-full" aria-label="Verified USD prices and simulated trade levels">
    <AreaChart accessibilityLayer data={values} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-close)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--color-close)" stopOpacity={0.015} /></linearGradient></defs>
      <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
      <XAxis dataKey="datetime" tickFormatter={short} minTickGap={25} tickMargin={10} {...axis} />
      <YAxis orientation="right" width={54} domain={['auto', 'auto']} tickFormatter={value => compactUsd.format(value)} {...axis} />
      <ChartTooltip content={<ChartTooltipContent labelFormatter={value => short(String(value))} formatter={value => priceLabel(Number(value), 'USD')} />} />
      <Area type="linear" dataKey="close" stroke="var(--color-close)" fill={`url(#${id})`} strokeWidth={2} isAnimationActive={false} />
      {pos&&<ReferenceLine y={pos.averageCost} ifOverflow="extendDomain" stroke="var(--chart-2)" strokeDasharray="3 3" label="Avg. entry"/>}
      {levels.map(l=><ReferenceLine key={l.id} y={l.value} ifOverflow="extendDomain" stroke="var(--chart-3)" strokeDasharray="5 4" label={l.label}/>)}
      {fills.map(t=><ReferenceDot key={t.id} x={t.markDate.slice(0,10)} y={t.fillPrice} ifOverflow="extendDomain" r={4} fill={t.side==='buy'?'var(--chart-2)':'var(--chart-3)'} label={t.side==='buy'?'B':'S'}/>)}
    </AreaChart>
  </ChartContainer>
}

export function PaperEquityHistory({ history }: { history: PaperAccount['history'] }) {
  const [mode, setMode] = useState<'equity' | 'pnl'>('equity')
  const series = mode === 'equity' ? ['equity'] as const : ['pnl', 'realized', 'unrealized'] as const
  return <>
    <div className="paper-inline paper-history-controls" role="group" aria-label="Account history metric">
      <button type="button" className="button small" aria-pressed={mode === 'equity'} onClick={() => setMode('equity')}>Account equity</button>
      <button type="button" className="button small" aria-pressed={mode === 'pnl'} onClick={() => setMode('pnl')}>Profit &amp; loss</button>
    </div>
    {history.length === 1 && <p className="paper-note">Only the opening balance is recorded. Fills and updated position marks add points to this chart.</p>}
    <ChartContainer config={config} className="h-52 w-full" aria-label={mode === 'equity' ? 'Account equity history' : 'Account profit and loss history'}>
      <LineChart accessibilityLayer data={history} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={history.length > 1 && history[0].date.slice(0, 10) === history.at(-1)?.date.slice(0, 10) ? value => shortTime.format(new Date(value)) : short} minTickGap={25} tickMargin={8} {...axis} />
        <YAxis domain={['auto', 'auto']} orientation="right" width={65} tickFormatter={value => compactUsd.format(value)} {...axis} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={value => new Date(String(value)).toLocaleString()} formatter={(value, name) => <span>{config[name as keyof typeof config]?.label}: {priceLabel(Number(value), 'USD')}</span>} />} />
        {series.map(key => <Line key={key} dataKey={key} stroke={`var(--color-${key})`} strokeWidth={2} dot={history.length === 1} isAnimationActive={false} />)}
      </LineChart>
    </ChartContainer>
    <div className="paper-inline paper-history-legend">{series.map(key => <span key={key}><i style={{ backgroundColor: config[key].color }} />{config[key].label}</span>)}</div>
  </>
}
