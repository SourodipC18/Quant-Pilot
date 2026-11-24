'use client'
import dynamic from 'next/dynamic'
import { Component, useCallback, useRef, useState, type ReactNode } from 'react'
export type SurfaceData = {
  x: number[]
  y: number[]
  z: (number | null)[][]
  labels: [string, string, string]
  ticks?: [string[], string[]]
  linearAxes?: boolean
  formatValue?: (value: number) => string
  describe?: (i: number, j: number, value: number) => string
  scale?: { extent: number; colors: [string, string, string]; legend: string }
  markers?: { i: number; j: number; color: string; label: string }[]
  curves?: { values: number[]; color: string; label: string }[]
}
const Scene = dynamic(() => import('./analytics-surface-3d'), {
  ssr: false,
  loading: () => <p role="status">Loading 3D surface…</p>,
})
class Boundary extends Component<
  { children: ReactNode; fail: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.fail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
export function SurfaceView({
  data,
  dark,
  onUnavailable,
  embedded = false,
}: {
  data: SurfaceData
  dark: boolean
  onUnavailable: () => void
  embedded?: boolean
}) {
  const [reset, setReset] = useState(0),
    [tip, setTip] = useState(''),
    ref = useRef<HTMLDivElement>(null)
  const fail = useCallback(() => onUnavailable(), [onUnavailable])
  return (
    <div ref={ref} className="surface-shell panel">
      <div className="simulation-controls">
        <span className="eyebrow">Interactive surface</span>
        <button
          type="button"
          className="button small"
          onClick={() => setReset((n) => n + 1)}
        >
          Reset camera
        </button>
        {!embedded && <button
          type="button"
          className="button small"
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen()
              else await ref.current?.requestFullscreen()
            } catch {
              setTip('Fullscreen unavailable in this browser.')
            }
          }}
        >
          Fullscreen
        </button>}
      </div>
      <div
        style={{ height: 'clamp(310px, 53vh, 680px)' }}
        onPointerLeave={() => setTip('')}
      >
        <Boundary fail={fail}>
          <Scene
            data={data}
            dark={dark}
            reset={reset}
            hover={setTip}
            fail={fail}
          />
        </Boundary>
      </div>
      <p className="method-note">
        {tip || 'Drag to rotate · Scroll or pinch to zoom · Point to inspect'}
      </p>
      {!embedded && <p className="method-note">
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 64,
            height: 8,
            background: 'linear-gradient(90deg,#3986be,#83bc40)',
          }}
        />{' '}
        Low → high {data.labels[2]}
        {[...(data.curves ?? []), ...(data.markers ?? [])].map((m) => (
          <span key={m.label}>
            {' '}
            · <b style={{ color: m.color }}>━</b> {m.label}
          </span>
        ))}
      </p>}
    </div>
  )
}
