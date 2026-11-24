'use client'

import { useMemo, useState } from 'react'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { ROLLING_WINDOWS, type rollingRiskCorrelation } from '@/lib/portfolio-risk-lab'
import { RiskChart, RiskHeatmap, RiskPanel, riskCsv } from './risk-chart'
import type { SurfaceData } from './surface-view'

function correlationSurface(result: ReturnType<typeof rollingRiskCorrelation>, filter: string, thinning: boolean, dark: boolean): SurfaceData | null {
  const pairs = result.pairs.filter(pair => !filter || pair.id === filter)
  if (!pairs.length || !result.dates.length) return null
  const columns = pairs.map(pair => result.pairs.indexOf(pair))
  const valid = result.values.map(row => columns.some(i => row[i] != null))
  if (!valid.some(Boolean)) return null
  const stride = thinning ? Math.ceil(result.dates.length / 220) : 1
  const indexes = result.dates.flatMap((_, i) => {
    const changesAt = (j: number) => j > 0 && j < result.dates.length && columns.some(column => (result.values[j][column] == null) !== (result.values[j - 1][column] == null))
    return i % stride === 0 || i === result.dates.length - 1 || changesAt(i) || changesAt(i + 1) ? [i] : []
  })
  const dates = indexes.map(i => result.dates[i]), labels = pairs.map(pair => pair.label)
  return {
    x: indexes, y: pairs.map((_, i) => i), z: indexes.map(i => columns.map(j => result.values[i][j])), linearAxes: true,
    labels: ['Session date', 'Asset pair', 'Pearson correlation'], ticks: [dates, labels],
    formatValue: value => value.toFixed(2),
    describe: (i, j, value) => `${dates[i]} · ${labels[j]} · ρ ${value.toFixed(3)}`,
    scale: { extent: 1, colors: ['#2978b8', dark ? '#536073' : '#d1d5dc', '#c75527'], legend: 'Negative ← correlation → positive · Blank cells = no valid window' },
  }
}

export function RiskCorrelation({ result, window, onWindow, dark, observations, loading }: { result: ReturnType<typeof rollingRiskCorrelation> | null; window: typeof ROLLING_WINDOWS[number]; onWindow: (value: typeof ROLLING_WINDOWS[number]) => void; dark: boolean; observations: number; loading: boolean }) {
  const [pair, setPair] = useState('')
  const all = useMemo(() => result ? correlationSurface(result, pair, false, dark) : null, [result, pair, dark])
  const surface = useMemo(() => result ? correlationSurface(result, pair, true, dark) : null, [result, pair, dark])
  const trendPair = result?.pairs.find(item => item.id === pair) ?? result?.pairs.find(item => item.label === result.highest?.label)
  const trendIndex = trendPair && result ? result.pairs.indexOf(trendPair) : -1
  const endpoint = result && trendIndex >= 0 ? result.values.at(-1)?.[trendIndex] : null
  const earlierIndex = result ? result.values.length - 21 : -1
  const earlier = result && trendIndex >= 0 && earlierIndex >= 0 ? result.values[earlierIndex][trendIndex] : null
  const trend = earlier != null && endpoint != null ? endpoint - earlier : null
  return <RiskPanel index="03 / Dependence" title="Rolling correlation" subtitle="See when holdings started moving together — or apart.">
    <FieldGroup className="risk-fields">
      <Field className="analytics-field"><FieldLabel htmlFor="risk-corr-window">Rolling window</FieldLabel><select id="risk-corr-window" value={window} onChange={event => onWindow(Number(event.target.value) as typeof window)}>{ROLLING_WINDOWS.map(value => <option key={value} value={value}>{value} sessions</option>)}</select></Field>
      <Field className="analytics-field"><FieldLabel htmlFor="risk-corr-pair">Asset pair</FieldLabel><select id="risk-corr-pair" value={pair} onChange={event => setPair(event.target.value)}><option value="">All pairs</option>{result?.pairs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    </FieldGroup>
    {trendPair && endpoint != null && <div className="risk-insight"><strong>{trendPair.label}</strong><span>Latest ρ {endpoint.toFixed(2)}{trend != null ? ` · ${trend >= 0 ? '+' : ''}${trend.toFixed(2)} vs. 20 matched observations earlier · ${Math.abs(trend) < 0.005 ? 'Little change in co-movement' : trend > 0 ? 'Stronger co-movement by correlation' : 'Weaker co-movement by correlation'}` : ''}</span></div>}
    {all && surface && result ? <RiskChart surface={surface} dark={dark} heatmap={<RiskHeatmap key={`${window}:${pair}:${all.x.length}`} data={all} caption="Rolling asset-pair correlation by session date" />}
      onExport={() => riskCsv('quantpilot-rolling-correlation.csv', [['session_date', 'window_sessions', 'asset_a', 'asset_b', 'correlation'], ...result.dates.flatMap((date, i) => result.pairs.flatMap((item, j) => !pair || item.id === pair ? [[date, window, item.left, item.right, result.values[i][j]]] : []))])} />
      : <p className="risk-empty" role="status">{loading ? 'Loading provider-verified closes…' : !result?.pairs.length ? 'Correlation needs at least two holdings with verified prices.' : `No valid ${window}-session windows across ${observations} matched returns. Try a shorter window, a longer period, or a different pair.`}</p>}
    <p className="method-note">Pearson correlation of same-session close-to-close returns. Windows cannot cross missing sessions or use constant-price series. The 3D view samples dates for readability; 2D and CSV retain every window. Pair spacing is categorical.</p>
  </RiskPanel>
}
