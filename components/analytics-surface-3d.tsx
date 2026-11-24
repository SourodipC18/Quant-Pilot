'use client'
import { Canvas } from '@react-three/fiber'
import { Color, DoubleSide } from 'three'
import { useMemo } from 'react'
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
  const { x, y, z, labels } = data,
    theme = colorSets[dark ? 'dark' : 'light']
  const mesh = useMemo(() => {
    const finite = z
        .flat()
        .filter((v): v is number => v != null && Number.isFinite(v)),
      min = Math.min(...finite),
      max = Math.max(...finite)
    const xyz = (i: number, j: number, v: number): [number, number, number] => [
      (5 * i) / Math.max(1, x.length - 1),
      max > min ? (3.6 * (v - min)) / (max - min) : 1.8,
      (4 * j) / Math.max(1, y.length - 1),
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
          ...new Color()
            .setHSL(
              0.58 -
                0.34 *
                  (v == null || max === min ? 0.5 : (v - min) / (max - min)),
              0.57,
              dark ? 0.51 : 0.37,
            )
            .toArray(),
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
  }, [x, y, z, dark])
  const detail = (k: number) => {
    const i = Math.floor(k / y.length),
      j = k % y.length
    hover(
      `${labels[0]}: ${x[i]} · ${labels[1]}: ${Number(y[j].toPrecision(6))} · ${labels[2]}: ${Number(z[i][j]!.toPrecision(5))}`,
    )
  }
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: cameraPosition, fov: 40 }}
    >
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
      {[0, 1].map((t) => (
        <group key={t}>
          <AxisLabel
            position={[5 * t, -0.15, 0]}
            text={String(x[t ? x.length - 1 : 0])}
            color={theme.text}
          />
          <AxisLabel
            position={[-0.55, 0, 4 * t]}
            text={Number(y[t ? y.length - 1 : 0].toPrecision(4)).toString()}
            color={theme.text}
          />
          <AxisLabel
            position={[-0.55, 3.6 * t, 0]}
            text={Number((t ? mesh.max : mesh.min).toPrecision(4)).toString()}
            color={theme.text}
          />
        </group>
      ))}
    </Canvas>
  )
}
