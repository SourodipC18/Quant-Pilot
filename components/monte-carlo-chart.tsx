'use client'

import { useId, useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, usePlotArea, useXAxisScale, useYAxisScale, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { priceLabel } from '@/lib/market-instruments'
import type { MonteCarloResult } from '@/lib/analytics'

const chartConfig = {
  up: { label: 'Ends at or above start', color: 'var(--chart-1)' },
  down: { label: 'Ends below start', color: 'var(--chart-5)' },
  p05: { label: '5th percentile', color: 'var(--chart-5)' },
  median: { label: 'Median', color: 'var(--chart-1)' },
  p95: { label: '95th percentile', color: 'var(--chart-2)' },
} satisfies ChartConfig

function getChartDomain(fan: MonteCarloResult['fan'], paths: number[][], capital: number, fullRange: boolean): [number, number] {
  let low = capital
  let high = capital
  for (const point of fan) {
    low = Math.min(low, point.p05)
    high = Math.max(high, point.p95)
  }
  if (fullRange) {
    for (const path of paths) for (const value of path) {
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
  }
  const padding = Math.max((high - low) * 0.14, capital * 0.0001, 0.05)
  return [Math.max(0, low - padding), high + padding]
}

function TrajectoryCloud({ paths, capital }: { paths: number[][]; capital: number }) {
  const clipId = useId()
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  const strokes = useMemo(() => {
    if (!xScale || !yScale || !paths.length) return null
    const xCoords = paths[0].map((_, step) => xScale(step, { position: 'middle' })?.toFixed(1))
    if (xCoords.some(x => x === undefined)) return null
    return paths.map((path, index) => ({
      index,
      aboveStart: path.at(-1)! >= capital,
      d: path.map((value, step) => `${step === 0 ? 'M' : 'L'}${xCoords[step]},${yScale(value)?.toFixed(1)}`).join(''),
    }))
  }, [paths, capital, xScale, yScale])

  if (!plot || !strokes) return null
  return <g className="monte-carlo-trajectories" aria-hidden="true" pointerEvents="none" fill="none" strokeOpacity={0.21}>
    <defs><clipPath id={clipId}><rect {...plot} /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      {strokes.map(({ index, aboveStart, d }) => <path key={index} d={d} stroke={aboveStart ? 'var(--color-up)' : 'var(--color-down)'} />)}
    </g>
  </g>
}

export function MonteCarloChart({ currency, simulation, density, capital, fullRange }: { currency?: string; simulation: MonteCarloResult; density: number; capital: number; fullRange: boolean }) {
  const paths = useMemo(() => simulation.trajectories.slice(0, density), [simulation.trajectories, density])
  const data = useMemo(() => simulation.fan.map(point => ({ ...point, interval: [point.p05, point.p95] })), [simulation.fan])
  const domain = useMemo(() => getChartDomain(simulation.fan, paths, capital, fullRange), [simulation.fan, paths, capital, fullRange])
  const tickFormat = useMemo(() => {
    const span = domain[1] - domain[0]
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      ...(currency ? { style: 'currency', currency, minimumFractionDigits: 0 } : {}), notation: span >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: span < 50 || span >= 100_000 ? 2 : 0,
    })
  }, [currency, domain])

  return <>
    <div className="simulation-chart-legend" aria-label="Monte Carlo chart legend">
      <span><i className="legend-path-up" aria-hidden="true" />Ends at or above start</span>
      <span><i className="legend-path-down" aria-hidden="true" />Ends below start</span>
      <span><i className="legend-range" aria-hidden="true" />5th–95th percentile</span>
      <span><i className="legend-median" aria-hidden="true" />Median</span>
    </div>
    <ChartContainer config={chartConfig} className="advanced-chart monte-carlo-chart">
      <ComposedChart data={data} accessibilityLayer margin={{ top: 12, right: 18, bottom: 18, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
        <XAxis dataKey="step" tickLine={false} axisLine={false} minTickGap={32} interval="preserveStartEnd" label={{ value: 'Forward sessions', position: 'insideBottom', offset: -10 }} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={value => tickFormat.format(value)} tickMargin={8} width="auto" domain={domain} allowDataOverflow />
        <ChartTooltip
          cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }}
          itemSorter={item => item.dataKey === 'p05' ? 0 : item.dataKey === 'median' ? 1 : 2}
          content={<ChartTooltipContent
            labelFormatter={(_, payload) => `Session ${payload[0]?.payload?.step ?? '—'}`}
            formatter={(value, name) => <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{name}</span><span className="font-mono tabular-nums">{priceLabel(Number(value), currency)}</span></div>}
          />}
        />
        <Area dataKey="interval" stroke="none" fill="var(--color-p95)" fillOpacity={0.24} tooltipType="none" isAnimationActive={false} />
        <TrajectoryCloud paths={paths} capital={capital} />
        <Line dataKey="p05" name={chartConfig.p05.label} stroke="var(--color-p05)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
        <Line dataKey="p95" name={chartConfig.p95.label} stroke="var(--color-p95)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
        <Line dataKey="median" name={chartConfig.median.label} stroke="var(--color-median)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
    <p className="method-note">{fullRange ? 'Full range includes every displayed path. Percentiles use all simulated paths.' : 'Typical range focuses on the 5th–95th percentile band. Switch to Full range to see paths that extend beyond the chart.'}</p>
  </>
}
