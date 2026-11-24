'use client'
import { useCallback, useMemo, useState } from 'react'
import type { BacktestConfig, PricePoint } from '@/lib/analytics'
import {
  evaluateGrid,
  metricLabels,
  type GridSpec,
  type MetricKey,
} from '@/lib/strategy-surface'
import { SurfaceView, type SurfaceData } from './surface-view'

const fields = {
  fastMin: 'Fast minimum',
  fastMax: 'Fast maximum',
  slowMin: 'Slow minimum',
  slowMax: 'Slow maximum',
  step: 'Period step',
} as const
export function StrategySurface({
  bars,
  config,
  dark,
  source,
}: {
  bars: PricePoint[]
  config: BacktestConfig
  dark: boolean
  source: string
}) {
  const [draft, setDraft] = useState<GridSpec>({
      fastMin: 5,
      fastMax: 25,
      slowMin: 20,
      slowMax: 60,
      step: 5,
    }),
    [spec, setSpec] = useState<GridSpec | null>(null),
    [metric, setMetric] = useState<MetricKey>('sharpe'),
    [view, setView] = useState('2D heatmap'),
    [failed, setFailed] = useState(false)
  const evaluated = useMemo(() => {
    if (!spec) return null
    try {
      return { result: evaluateGrid(bars, config, spec, metric) }
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Evaluation unavailable.',
      }
    }
  }, [bars, config, spec, metric])
  const result = evaluated?.result,
    best = result?.best,
    ratio = metric === 'sharpe' || metric === 'profitFactor',
    fmt = (v: number | null) =>
      v == null
        ? 'Unavailable'
        : ratio
          ? v.toFixed(3)
          : `${(100 * v).toFixed(2)}%`
  const flag = useCallback(
    (r: { fast: number; slow: number }) =>
      [
        r.fast === config.fastWindow && r.slow === config.slowWindow
          ? 'Current'
          : '',
        r.fast === best?.fast && r.slow === best?.slow ? 'Training best' : '',
      ]
        .filter(Boolean)
        .join(' + '),
    [config.fastWindow, config.slowWindow, best],
  )
  const surface = useMemo<SurfaceData | null>(() => {
    if (!result) return null
    const z = result.fast.map((_, i) =>
      result.rows
        .slice(i * result.slow.length, (i + 1) * result.slow.length)
        .map((r) => (r.value == null ? null : r.value * (ratio ? 1 : 100))),
    )
    return {
      x: result.fast,
      y: result.slow,
      z,
      labels: [
        'Fast (sessions)',
        'Slow (sessions)',
        `${metricLabels[metric]}${ratio ? '' : ' (%)'}`,
      ],
      markers: result.rows.flatMap((r) =>
        r.value != null &&
        (r === best ||
          (r.fast === config.fastWindow && r.slow === config.slowWindow))
          ? [
              {
                i: result.fast.indexOf(r.fast),
                j: result.slow.indexOf(r.slow),
                color: r === best ? '#e0b064' : '#75b7e8',
                label: flag(r),
              },
            ]
          : [],
      ),
    }
  }, [result, ratio, metric, best, flag, config.fastWindow, config.slowWindow])
  const values =
      result?.rows.flatMap((r) => (r.value == null ? [] : [r.value])) ?? [],
    min = Math.min(...values),
    max = Math.max(...values)
  function download() {
    if (!result) return
    const rows = [
      [
        'fast',
        'slow',
        'metric',
        'training_value',
        'configuration',
        'held_out_value',
        'training_period',
        'testing_period',
      ],
      ...result.rows.map((r) => [
        r.fast,
        r.slow,
        metric,
        r.value ?? '',
        flag(r),
        r === best ? (result.heldOut ?? '') : '',
        result.train,
        result.test,
      ]),
    ]
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(',')).join('\r\n')], {
        type: 'text/csv',
      }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `strategy-${config.strategy}-${metric}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="panel app-panel">
      <header className="app-panel-header">
        <div>
          <span className="eyebrow">Parameter research · {source}</span>
          <h2>Strategy optimization</h2>
        </div>
      </header>
      <p className="method-note">
        Compare crossover periods on the earliest 70% of up to 1,000 sessions.
        The selected pair starts flat on the remaining 30%, with fresh indicator
        warm-up and the same execution costs. Historical optimization does not
        guarantee future performance.
      </p>
      <div className="analytics-control-grid">
        {(Object.keys(fields) as (keyof GridSpec)[]).map((k) => (
          <label key={k} className="analytics-field">
            {fields[k]}
            <input
              type="number"
              min={k === 'step' ? 1 : 2}
              max={252}
              value={draft[k]}
              onChange={(e) => {
                setDraft({ ...draft, [k]: Number(e.target.value) })
                setSpec(null)
              }}
            />
          </label>
        ))}
        <label className="analytics-field">
          Performance metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
          >
            {Object.entries(metricLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="button primary"
        onClick={() => setSpec({ ...draft })}
      >
        Evaluate grid
      </button>
      <p className="method-note">
        Current: {config.fastWindow} / {config.slowWindow} · Commission{' '}
        {config.commissionBps} bps · Slippage {config.slippageBps} bps
      </p>
      {evaluated?.error && <p role="status">{evaluated.error}</p>}
      {result && surface && (
        <>
          <div className="analytics-inline-stats">
            <span>
              Training · {result.train}
              <strong>
                {best
                  ? `${best.fast} / ${best.slow} · ${fmt(best.value)}`
                  : 'No finite training scores'}
              </strong>
            </span>
            <span>
              Held out · {result.test}
              <strong>{fmt(result.heldOut)}</strong>
            </span>
          </div>
          <div
            className="range-tabs"
            role="group"
            aria-label="Strategy visualization"
          >
            {['2D heatmap', '3D surface', 'Comparison table'].map((v) => (
              <button
                key={v}
                type="button"
                disabled={v === '3D surface' && (failed || !values.length)}
                aria-pressed={view === v}
                className={view === v ? 'active' : ''}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {failed && (
            <p role="status">WebGL unavailable. Use the heatmap or table.</p>
          )}
          {view === '3D surface' && values.length > 0 ? (
            <SurfaceView
              data={surface}
              dark={dark}
              onUnavailable={() => {
                setFailed(true)
                setView('2D heatmap')
              }}
            />
          ) : view === 'Comparison table' ? (
            <div className="table-scroll">
              <table className="data-table">
                <caption>Training configurations</caption>
                <thead>
                  <tr>
                    <th>Fast</th>
                    <th>Slow</th>
                    <th>{metricLabels[metric]}</th>
                    <th>Selection</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={`${r.fast}/${r.slow}`}>
                      <td>{r.fast}</td>
                      <td>{r.slow}</td>
                      <td>{fmt(r.value)}</td>
                      <td>{flag(r) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption>
                  Training heatmap · {metricLabels[metric]} · higher scores in
                  green
                </caption>
                <thead>
                  <tr>
                    <th>Fast / Slow</th>
                    {result.slow.map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.fast.map((f, i) => (
                    <tr key={f}>
                      <th>{f}</th>
                      {result.slow.map((s, j) => {
                        const r = result.rows[i * result.slow.length + j],
                          t =
                            max === min
                              ? 0.5
                              : ((r.value ?? min) - min) / (max - min)
                        return (
                          <td
                            key={s}
                            title={`Fast ${f}, slow ${s}: ${fmt(r.value)}`}
                            style={{
                              background:
                                r.value == null
                                  ? undefined
                                  : `hsla(${210 - 120 * t},60%,45%,0.35)`,
                            }}
                          >
                            {fmt(r.value)}
                            {flag(r) && <small> · {flag(r)}</small>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="method-note">
            Unavailable cells have invalid periods, insufficient history or an
            undefined metric. Drawdowns are negative; closer to zero ranks
            higher. Current configuration is marked when present in the grid.
          </p>
          <button type="button" className="button small" onClick={download}>
            Export grid as CSV
          </button>
        </>
      )}
    </section>
  )
}
