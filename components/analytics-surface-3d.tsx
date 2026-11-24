'use client'
import { Canvas, useThree } from '@react-three/fiber'
import { Color, DoubleSide, PerspectiveCamera } from 'three'
import { useEffect, useMemo } from 'react'
import {
  Orbit,
  AxisLabel,
  ContextLoss,
  Lines,
  grid,
  axes,
  colorSets,
  cameraPosition,
} from './optimization-frontier-3d'
import type { SurfaceData } from './surface-view'

function ResponsiveFraming() {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = Math.max(0.4, size.width / Math.max(1, size.height))
    const halfFov = Math.min(Math.PI / 5, Math.max(Math.PI / 9, Math.atan(Math.tan(Math.PI / 9) / aspect)))
    camera.setFocalLength(camera.getFilmHeight() / (2 * Math.tan(halfFov)))
    invalidate()
  }, [camera, size.width, size.height, invalidate])
  return null
}

export default function SurfaceScene({
  data,
  dark,
  reset,
  hover,
  fail,
}: {
  data: SurfaceData
  dark: boolean
  reset: number
  hover: (s: string) => void
  fail: () => void
}) {
  const { x, y, z, labels, scale, ticks, describe, formatValue, linearAxes } = data,
    theme = colorSets[dark ? 'dark' : 'light']
  const mesh = useMemo(() => {
    const finite = z
        .flat()
        .filter((v): v is number => v != null && Number.isFinite(v)),
      min = scale ? -scale.extent : Math.min(...finite),
      max = scale ? scale.extent : Math.max(...finite)
    const stops = scale?.colors.map(color => new Color(color))
    const relative = (axis: number[], index: number) => linearAxes && axis.length > 1
      ? (axis[index] - axis[0]) / (axis.at(-1)! - axis[0])
      : index / Math.max(1, axis.length - 1)
    const xyz = (i: number, j: number, v: number): [number, number, number] => [
      5 * relative(x, i),
      max > min ? (3.6 * (v - min)) / (max - min) : 1.8,
      4 * relative(y, j),
    ]
    const pos: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      available: number[] = []
    x.forEach((_, i) =>
      y.forEach((_, j) => {
        const v = z[i][j],
          idx = i * y.length + j
        pos.push(...xyz(i, j, v ?? min))
        colors.push(
          ...(scale && stops ? stops[1].clone().lerp(stops[(v ?? 0) < 0 ? 0 : 2], Math.min(1, Math.abs(v ?? 0) / scale.extent)) : new Color()
            .setHSL(
              0.58 -
                0.34 *
                  (v == null || max === min ? 0.5 : (v - min) / (max - min)),
              0.57,
              dark ? 0.51 : 0.37,
            )
          ).toArray(),
        )
        if (v != null) available.push(idx)
        if (i && j) {
          const a = idx - y.length - 1,
            b = idx - y.length,
            c = idx - 1
          for (const tri of [
            [a, b, idx],
            [a, idx, c],
          ])
            if (
              tri.every(
                (k) => z[Math.floor(k / y.length)][k % y.length] != null,
              )
            )
              indices.push(...tri)
        }
      }),
    )
    return {
      pos: new Float32Array(pos),
      colors: new Float32Array(colors),
      indices: new Uint16Array(indices),
      available: new Uint16Array(available),
      xyz,
      min,
      max,
    }
  }, [x, y, z, dark, scale, linearAxes])
  const detail = (k: number) => {
    const i = Math.floor(k / y.length), j = k % y.length
    const value = z[i]?.[j]
    if (value == null) return
    hover(describe?.(i, j, value) ?? `${labels[0]}: ${ticks?.[0][i] ?? x[i]} · ${labels[1]}: ${ticks?.[1][j] ?? Number(y[j].toPrecision(6))} · ${labels[2]}: ${formatValue?.(value) ?? Number(value.toPrecision(5))}`)
  }
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: cameraPosition, fov: 40 }}
    >
      {linearAxes && <ResponsiveFraming />}
      <Orbit reset={reset} />
      <ContextLoss onUnavailable={fail} />
      <Lines positions={grid} color={theme.grid} />
      <Lines positions={axes} color={theme.text} />
      <mesh
        onPointerMove={(e) => {
          if (e.face)
            detail(
              [e.face.a, e.face.b, e.face.c].reduce((a, b) => {
                const dist = (k: number) =>
                  Math.hypot(
                    mesh.pos[3 * k] - e.point.x,
                    mesh.pos[3 * k + 1] - e.point.y,
                    mesh.pos[3 * k + 2] - e.point.z,
                  )
                return dist(a) < dist(b) ? a : b
              }),
            )
        }}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[mesh.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[mesh.colors, 3]} />
          <bufferAttribute attach="index" args={[mesh.indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial vertexColors side={DoubleSide} />
      </mesh>
      {y.length === 1 && <Lines color={theme.text} positions={new Float32Array(z.slice(1).flatMap(([v], i) => {
        const previous = z[i][0]
        return v == null || previous == null ? [] : [...mesh.xyz(i, 0, previous), ...mesh.xyz(i + 1, 0, v)]
      }))} />}
      <points
        onPointerMove={(e) => {
          if (e.index != null) detail(e.index)
        }}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[mesh.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[mesh.colors, 3]} />
          <bufferAttribute attach="index" args={[mesh.available, 1]} />
        </bufferGeometry>
        <pointsMaterial size={0.055} vertexColors />
      </points>
      {data.markers?.map((m) => (
        <mesh
          key={m.label}
          position={mesh.xyz(m.i, m.j, z[m.i][m.j]!)}
          onPointerOver={() => hover(m.label)}
        >
          <sphereGeometry args={[0.105, 12, 10]} />
          <meshBasicMaterial color={m.color} />
        </mesh>
      ))}
      {data.curves?.map((c) => (
        <Lines
          key={c.label}
          color={c.color}
          positions={
            new Float32Array(
              c.values.slice(1).flatMap((v, k) => {
                const p = (i: number, val: number) => {
                  const j = y.reduce(
                    (a, n, b) =>
                      Math.abs(n - val) < Math.abs(y[a] - val) ? b : a,
                    0,
                  )
                  const vec = mesh.xyz(i, j, z[i][j]!)
                  vec[1] += 0.035
                  vec[2] = (4 * (val - y[0])) / (y.at(-1)! - y[0])
                  return vec
                }
                return [...p(k, c.values[k]), ...p(k + 1, v)]
              }),
            )
          }
        />
      ))}
      <AxisLabel
        position={[3, -0.45, -0.4]}
        text={labels[0]}
        color={theme.text}
        title
      />
      <AxisLabel
        position={[-0.45, -0.45, 3]}
        text={labels[1]}
        color={theme.text}
        title
      />
      <AxisLabel
        position={[0, 4, 0]}
        text={labels[2]}
        color={theme.text}
        title
      />
      {[0, 1].map((t) => {
        const i = t ? x.length - 1 : 0, j = t ? y.length - 1 : 0
        const value = t ? mesh.max : mesh.min
        return <group key={t}>
          {(!t || x.length > 1) && <AxisLabel position={[5 * t, -0.15, 0]} text={ticks?.[0][i] ?? String(x[i])} color={theme.text} />}
          {(!t || y.length > 1) && <AxisLabel position={[-0.55, 0, 4 * t]} text={ticks?.[1][j] ?? Number(y[j].toPrecision(4)).toString()} color={theme.text} />}
          <AxisLabel position={[-0.55, 3.6 * t, 0]} text={formatValue?.(value) ?? Number(value.toPrecision(4)).toString()} color={theme.text} />
        </group>
      })}
    </Canvas>
  )
}
