'use client'

import { useMemo, type ReactNode } from 'react'
import type { SurfaceCell, ValueInterval } from '@/lib/advanced-risk'
import { RiskChart, RiskHeatmap, riskCsv } from './risk-chart'
import type { SurfaceData } from './surface-view'

const MAX_MESH_DATES = 128
export const percentage = (value: number) => `${(100 * value).toFixed(2)}%`
export const coefficient = (value: number) => value.toFixed(3)

type Props = {
  dates: ReadonlyArray<Pick<ValueInterval, 'date' | 'segment'>>
  grid: (SurfaceCell | null)[][]
  title: string
  axis: string
  categories: string[]
  format: (value: number) => string
  dark: boolean
  domain?: 'positive' | 'negative'
  markers?: number[]
  empty: string
  secondary?: ReactNode
}

export function RiskSurfaceGrid({ dates, grid, title, axis, categories, format, dark, domain, markers, empty, secondary }: Props) {
  const { all, mesh, available, latest } = useMemo(() => {
    const z = grid.map(row => row.map(item => item?.value ?? null))
    const extent = grid.reduce((max, row) => row.reduce((current, item) => Math.max(current, Math.abs(item?.value ?? 0)), max), domain ? 0.0001 : 0.01)
    const latest = z.findLastIndex(row => row.some(value => value != null))
    const available = latest !== -1
    const describe = (i: number, j: number, value: number) => {
      const item = grid[i][j]!
      return `${categories[j]} · ${format(value)} · ${item.from} to ${dates[i].date} · n=${item.observations}${item.rSquared == null ? '' : ` · R² ${percentage(item.rSquared)}`}${item.peak ? ` · Peak ${item.peak}` : ''}`
    }
    const all: SurfaceData = {
      x: dates.map((_, i) => i), y: categories.map((_, i) => i), z,
      labels: ['Trading date', axis, title], ticks: [dates.map(row => row.date), categories],
      formatValue: format, describe,
      scale: {
        extent, domain,
        colors: dark ? ['#ef786e', '#3b4b62', '#69c9ef'] : ['#ad392d', '#e0e8f3', '#1676b4'],
        legend: 'Blank cells are unavailable. Only the 3D date grid is thinned; 2D and CSV retain every observation.',
      },
    }
    const count = Math.min(dates.length, MAX_MESH_DATES)
    const indices = [...new Set([...Array.from({ length: count }, (_, i) => Math.round(i * (dates.length - 1) / Math.max(1, count - 1))), ...(markers ?? []).filter(i => i >= 0), ...(latest >= 0 ? [latest] : [])])].sort((a, b) => a - b)
    const mesh: SurfaceData = {
      ...all, x: indices, z: indices.map(i => z[i]),
      ticks: [indices.map(i => dates[i].date), categories],
      linearAxes: true,
      connectX: indices.map((i, k) => categories.map((_, j) => k > 0 && dates[i].segment === dates[indices[k - 1]].segment && z.slice(indices[k - 1], i + 1).every(row => row[j] != null))),
      describe: (i, j, value) => describe(indices[i], j, value),
      markers: markers?.flatMap((i, j) => i >= 0 ? [{ i: indices.indexOf(i), j, color: dark ? '#fff1b5' : '#5d2921', label: `Deepest · ${describe(i, j, z[i][j]!)}` }] : []),
    }
    return { all, mesh, available, latest }
  }, [dates, grid, title, axis, categories, format, dark, domain, markers])
  if (!available) return <><p className="risk-empty" role="status">{empty}</p>{secondary}</>
  const first = grid.findIndex(row => row.some(Boolean))
  const usable = grid.reduce((count, row) => count + row.filter(Boolean).length, 0)
  return <>
    <p className="method-note">Calculated endpoints: {dates[first].date} to {dates[latest].date} · {usable.toLocaleString()} estimates. Inspect a point for its exact period and observation count.</p>
    <RiskChart surface={mesh} dark={dark} default3d heatmap={<><RiskHeatmap data={all} caption={title} highlighted={markers} />{secondary}</>} onExport={() => riskCsv(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.csv`, [
      ['Date', axis, `${title} (${format === percentage ? 'decimal' : 'ratio'})`, 'Period start', 'Observations', 'R-squared', 'Peak date', 'Peak value', 'End value'],
      ...dates.flatMap(({ date }, i) => categories.map((category, j) => {
        const item = grid[i][j]
        return [date, category, item?.value ?? null, item?.from ?? null, item?.observations ?? null, item?.rSquared ?? null, item?.peak ?? null, item?.peakValue ?? null, item?.endValue ?? null]
      })),
    ])} />
  </>
}
