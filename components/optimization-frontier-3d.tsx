'use client'

import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { LabPoint } from '@/lib/optimization-lab'

type Vector = [number, number, number]
const size: Vector = [5, 3.6, 4]
const divisions = 4
const target: Vector = [2.5, 1.65, 2]
const cameraPosition: Vector = [9, 6.6, 11]
const colorSets = {
  dark: { grid: '#39443a', text: '#b0bcaf', candidate: '#8eaa97', frontier: '#a7e66a', current: '#e8eee7', minimum: '#75b7e8', sharpe: '#e0b064' },
  light: { grid: '#c8d6ca', text: '#3b4e42', candidate: '#62796b', frontier: '#477b32', current: '#273b2c', minimum: '#296aa5', sharpe: '#935e14' },
}

function Orbit({ reset }: { reset: number }) {
  const { camera, gl, invalidate } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.target.set(...target)
    orbit.enablePan = false
    orbit.minDistance = 6
    orbit.maxDistance = 23
    orbit.rotateSpeed = 0.75
    orbit.update()
    orbit.saveState()
    const redraw = () => invalidate()
    orbit.addEventListener('change', redraw)
    controls.current = orbit
    redraw()
    return () => { orbit.removeEventListener('change', redraw); orbit.dispose(); controls.current = null }
  }, [camera, gl, invalidate])
  useEffect(() => { controls.current?.reset() }, [reset])
  return null
}

function AxisLabel({ position, text, color, title = false }: { position: Vector; text: string; color: string; title?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.font = `${title ? 650 : 500} ${title ? 42 : 36}px Inter, system-ui, sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 40)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  }, [text, color, title])
  useEffect(() => () => texture.dispose(), [texture])
  return <sprite position={position} scale={title ? [3.65, 0.57, 1] : [3.1, 0.48, 1]}>
    <spriteMaterial map={texture} depthTest={false} toneMapped={false} />
  </sprite>
}

function Lines({ positions, color, opacity = 1 }: { positions: Float32Array; color: string; opacity?: number }) {
  return <lineSegments>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <lineBasicMaterial color={color} opacity={opacity} transparent={opacity !== 1} />
  </lineSegments>
}

function domain(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values)
  const padding = max > min ? (max - min) * 0.07 : Math.max(Math.abs(max) * 0.08, 0.01)
  return { min: min - padding, max: max + padding }
}

function Marker({ point, position, color, onHover, onSelect }: { point: LabPoint; position: Vector; color: string; onHover: (point: LabPoint | null) => void; onSelect: (point: LabPoint) => void }) {
  const featured = point.kind === 'current' || point.kind === 'minimum' || point.kind === 'sharpe'
  function hover(event: ThreeEvent<PointerEvent>) { event.stopPropagation(); onHover(point) }
  return <mesh position={position} onPointerOver={hover} onPointerOut={() => onHover(null)} onClick={event => { if (event.delta < 4) { event.stopPropagation(); onSelect(point) } }}>
    {point.kind === 'minimum' ? <boxGeometry args={[0.2, 0.2, 0.2]} /> : point.kind === 'sharpe' ? <octahedronGeometry args={[0.17]} /> : <sphereGeometry args={[point.kind === 'current' ? 0.145 : point.kind === 'frontier' ? 0.058 : 0.047, 10, 8]} />}
    <meshBasicMaterial color={color} transparent={!featured && point.kind === 'candidate'} opacity={point.kind === 'candidate' ? 0.65 : 1} />
  </mesh>
}

const grid = new Float32Array(Array.from({ length: divisions + 1 }, (_, i) => {
  const [x, y, z] = size.map(length => length * i / divisions)
  return [x, 0, 0, x, 0, size[2], 0, 0, z, size[0], 0, z, x, 0, 0, x, size[1], 0, 0, y, 0, size[0], y, 0, 0, y, 0, 0, y, size[2], 0, 0, z, 0, size[1], z]
}).flat())
const axes = new Float32Array([0, 0, 0, size[0] + 0.13, 0, 0, 0, 0, 0, 0, size[1] + 0.13, 0, 0, 0, 0, 0, 0, size[2] + 0.13])

export default function OptimizationFrontier3D({ points, frontier, dark, reset, onHover, onSelect, onUnavailable }: {
  points: LabPoint[]; frontier: LabPoint[]; dark: boolean; reset: number
  onHover: (point: LabPoint | null) => void; onSelect: (point: LabPoint) => void; onUnavailable: () => void
}) {
  const colors = colorSets[dark ? 'dark' : 'light']
  const { positions, ranges, frontierLine } = useMemo(() => {
    const valid = points.filter(point => point.sharpe != null)
    const ranges = [domain(valid.map(point => point.volatility)), domain(valid.map(point => point.expectedReturn)), domain(valid.map(point => point.sharpe!))]
    const positions = new Map(valid.map(point => [point.id, ([point.volatility, point.expectedReturn, point.sharpe!] as Vector).map((value, index) => (value - ranges[index].min) / (ranges[index].max - ranges[index].min) * size[index]) as Vector]))
    const path = frontier.flatMap(point => positions.has(point.id) ? [positions.get(point.id)!] : [])
    return { positions, ranges, frontierLine: new Float32Array(path.slice(1).flatMap((position, index) => [...path[index], ...position])) }
  }, [points, frontier])

  return <div className="optimization-canvas" aria-hidden="true" onPointerLeave={() => onHover(null)} onContextMenu={event => event.preventDefault()}>
    <Canvas frameloop="demand" gl={{ antialias: true, alpha: true }} dpr={[1, 1.75]} camera={{ position: cameraPosition, fov: 39, near: 0.1, far: 90 }} fallback={<p className="optimization-plot-message">Canvas is unavailable. Use the results table below.</p>}>
      <Orbit reset={reset} />
      <ContextLoss onUnavailable={onUnavailable} />
      <Lines positions={grid} color={colors.grid} opacity={0.7} />
      <Lines positions={axes} color={colors.text} opacity={0.65} />
      {frontierLine.length > 0 && <Lines positions={frontierLine} color={colors.frontier} />}
      {Array.from({ length: divisions + 1 }, (_, i) => {
        const t = i / divisions
        const value = (index: number) => ranges[index].min + (ranges[index].max - ranges[index].min) * t
        return <group key={i}>
          <AxisLabel position={[size[0] * t, -0.13, -0.22]} text={`${(value(0) * 100).toFixed(1)}%`} color={colors.text} />
          <AxisLabel position={[-0.6, size[1] * t, 0]} text={`${(value(1) * 100).toFixed(1)}%`} color={colors.text} />
          {i > 0 && <AxisLabel position={[-0.26, -0.15, size[2] * t]} text={value(2).toFixed(2)} color={colors.text} />}
        </group>
      })}
      <AxisLabel position={[size[0] * 0.64, -0.43, -0.35]} text="Volatility (%)" color={colors.text} title />
      <AxisLabel position={[-0.32, size[1] + 0.43, 0]} text="Return (%)" color={colors.text} title />
      <AxisLabel position={[-0.28, -0.49, size[2] * 0.72]} text="Sharpe ratio" color={colors.text} title />
      {points.map(point => {
        const position = positions.get(point.id)
        return position && <Marker key={point.id} point={point} position={position} color={colors[point.kind]} onHover={onHover} onSelect={onSelect} />
      })}
    </Canvas>
  </div>
}

function ContextLoss({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useThree(state => state.gl.domElement)
  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onUnavailable)
    return () => canvas.removeEventListener('webglcontextlost', onUnavailable)
  }, [canvas, onUnavailable])
  return null
}
