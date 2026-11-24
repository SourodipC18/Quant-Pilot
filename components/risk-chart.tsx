'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, Download, Grid2X2, Maximize2, Minimize2 } from 'lucide-react'
import { SurfaceView, type SurfaceData } from './surface-view'

export function riskCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map(row => row.map(value => {
    if (value == null) return ''
    if (typeof value === 'number') return String(value)
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function RiskPanel({ index, title, subtitle, children }: { index: string; title: string; subtitle: string; children: ReactNode }) {
  return <section className="panel app-panel risk-panel">
    <header className="app-panel-header"><div><span className="eyebrow">{index}</span><h2>{title}</h2><p className="method-note">{subtitle}</p></div></header>
    {children}
  </section>
}

export function RiskChart({ surface, heatmap, dark, onExport, default3d = false }: { surface: SurfaceData; heatmap: ReactNode; dark: boolean; onExport: () => void; default3d?: boolean }) {
  const [is3d, set3d] = useState(default3d)
  const [failed, setFailed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [notice, setNotice] = useState('')
  const shell = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shell.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const show3d = is3d && !failed
  const scale = surface.scale!
  return <div className="risk-chart" ref={shell}>
    <div className="risk-chart-toolbar">
      <div className="range-tabs" role="group" aria-label={`${surface.labels[2]} view`}>
        <button type="button" aria-pressed={show3d} disabled={failed} className={show3d ? 'active' : ''} onClick={() => set3d(true)}><Box size={14} aria-hidden="true" />3D surface</button>
        <button type="button" aria-pressed={!show3d} className={!show3d ? 'active' : ''} onClick={() => set3d(false)}><Grid2X2 size={14} aria-hidden="true" />2D heatmap</button>
      </div>
      <div className="risk-chart-actions">
        <button className="button small" type="button" onClick={onExport}><Download size={14} aria-hidden="true" /> Export CSV</button>
        <button className="button small" type="button" onClick={async () => {
          try {
            if (document.fullscreenElement === shell.current) await document.exitFullscreen()
            else await shell.current?.requestFullscreen()
            setNotice('')
          } catch { setNotice('Fullscreen is unavailable in this browser or preview.') }
        }}>{fullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
      </div>
    </div>
    {notice && <p className="method-note" role="status">{notice}</p>}
    {failed && <p className="method-note" role="status">WebGL unavailable. The 2D heatmap and CSV contain the same underlying data.</p>}
    {show3d ? <SurfaceView data={surface} dark={dark} embedded onUnavailable={() => setFailed(true)} /> : heatmap}
    <div className="risk-legend">
      <div className="risk-legend-scale"><span aria-hidden="true" style={{ background: `linear-gradient(90deg, ${scale.colors.join(',')})` }} /><div><span>{surface.formatValue?.(-scale.extent)}</span><span>0</span><span>{surface.formatValue?.(scale.extent)}</span></div></div>
      <span>{scale.legend}</span>
    </div>
  </div>
}

export function RiskHeatmap({ data, caption, selected, onSelect, pageSize = 30 }: { data: SurfaceData; caption: string; selected?: [number, number]; onSelect?: (i: number, j: number) => void; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(data.x.length / pageSize))
  const [pageOffset, setPageOffset] = useState(0)
  const [focused, setFocused] = useState<[number, number] | null>(null)
  const ref = useRef<HTMLTableElement>(null)
  const page = Math.max(0, pages - 1 - pageOffset)
  const start = page * pageSize, end = Math.min(data.x.length, start + pageSize)
  const current = selected && selected[0] >= start && selected[0] < end ? selected : [start, 0]
  const scale = data.scale!
  const describe = (i: number, j: number) => {
    const value = data.z[i][j]
    return value == null ? `${data.ticks?.[0][i] ?? data.x[i]} · ${data.ticks?.[1][j] ?? data.y[j]} · Not available` : data.describe?.(i, j, value) ?? String(value)
  }
  const details = focused && focused[0] >= start && focused[0] < end && focused[1] < data.y.length ? focused : current
  return <div className="risk-heatmap">
    {pages > 1 && <div className="risk-chart-toolbar"><span className="method-note">{data.ticks?.[0][start]} to {data.ticks?.[0][end - 1]}</span><div className="risk-chart-actions"><button className="button small" disabled={page === 0} onClick={() => setPageOffset(pages - page)}>Earlier</button><button className="button small" disabled={page === pages - 1} onClick={() => setPageOffset(pages - page - 2)}>Later</button></div></div>}
    <div className="risk-grid-scroll" onPointerLeave={() => setFocused(null)}>
      <table className="risk-grid" ref={ref}>
        <caption className="sr-only">{caption}. Use arrow keys to move between cells.</caption>
        <thead><tr><th scope="col">{data.labels[1]} ↓ / {data.labels[0]} →</th>{data.x.slice(start, end).map((x, k) => <th scope="col" key={x}>{data.ticks?.[0][start + k] ?? x}</th>)}</tr></thead>
        <tbody>{data.y.map((y, j) => <tr key={y}><th scope="row">{data.ticks?.[1][j] ?? y}</th>{data.x.slice(start, end).map((x, k) => {
          const i = start + k, value = data.z[i][j], active = selected?.[0] === i && selected[1] === j
          const color = value == null ? undefined : `color-mix(in srgb, ${scale.colors[value < 0 ? 0 : 2]} ${Math.min(100, Math.abs(value) / scale.extent * 100)}%, ${scale.colors[1]})`
          return <td key={x}><button type="button" data-cell={`${i}:${j}`} data-selected={active || undefined} aria-label={describe(i, j)} aria-pressed={onSelect ? active : undefined} title={describe(i, j)} tabIndex={i === details[0] && j === details[1] ? 0 : -1}
            style={{ background: color }} onPointerEnter={() => setFocused([i, j])} onFocus={() => setFocused([i, j])} onClick={() => onSelect?.(i, j)}
            onKeyDown={event => {
              const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
              const step = steps[event.key as keyof typeof steps]
              if (!step) return
              event.preventDefault()
              const nextI = Math.max(start, Math.min(end - 1, i + step[0])), nextJ = Math.max(0, Math.min(data.y.length - 1, j + step[1]))
              ref.current?.querySelector<HTMLButtonElement>(`[data-cell="${nextI}:${nextJ}"]`)?.focus()
            }} /></td>
        })}</tr>)}</tbody>
      </table>
    </div>
    <p className="method-note" aria-live="polite">{describe(details[0], details[1])}</p>
  </div>
}
