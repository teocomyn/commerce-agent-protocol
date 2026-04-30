'use client'

import { useEffect, useRef, useCallback } from 'react'
import createGlobe from 'cobe'
import { cn } from '@/lib/utils'

interface CapMarker {
  id: string
  location: [number, number]
  region: string
}

interface CapArc {
  id: string
  from: [number, number]
  to: [number, number]
}

interface CapGlobeProps {
  markers?: CapMarker[]
  arcs?: CapArc[]
  className?: string
  speed?: number
}

// Major commerce + agent infrastructure hubs.
const defaultMarkers: CapMarker[] = [
  { id: 'sfo', location: [37.77, -122.42], region: 'sfo · agents' },
  { id: 'nyc', location: [40.71, -74.0], region: 'nyc · commerce' },
  { id: 'lon', location: [51.51, -0.13], region: 'lon · finance' },
  { id: 'par', location: [48.86, 2.35], region: 'par · commerce' },
  { id: 'ber', location: [52.52, 13.4], region: 'ber · tech' },
  { id: 'sto', location: [59.33, 18.07], region: 'sto · payments' },
  { id: 'tlv', location: [32.08, 34.78], region: 'tlv · tech' },
  { id: 'dxb', location: [25.2, 55.27], region: 'dxb · me' },
  { id: 'sin', location: [1.35, 103.82], region: 'sin · apac' },
  { id: 'tyo', location: [35.68, 139.65], region: 'tyo · apac' },
  { id: 'syd', location: [-33.87, 151.21], region: 'syd · apac' },
  { id: 'gru', location: [-23.55, -46.63], region: 'gru · latam' },
]

const defaultArcs: CapArc[] = [
  { id: 'sfo-lon', from: [37.77, -122.42], to: [51.51, -0.13] },
  { id: 'nyc-ber', from: [40.71, -74.0], to: [52.52, 13.4] },
  { id: 'lon-tyo', from: [51.51, -0.13], to: [35.68, 139.65] },
  { id: 'par-gru', from: [48.86, 2.35], to: [-23.55, -46.63] },
  { id: 'sin-syd', from: [1.35, 103.82], to: [-33.87, 151.21] },
  { id: 'tlv-nyc', from: [32.08, 34.78], to: [40.71, -74.0] },
  { id: 'sto-par', from: [59.33, 18.07], to: [48.86, 2.35] },
  { id: 'dxb-sin', from: [25.2, 55.27], to: [1.35, 103.82] },
]

export function GlobeCdn({
  markers = defaultMarkers,
  arcs = defaultArcs,
  className,
  speed = 0.0035,
}: CapGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
    isPausedRef.current = true
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('pointercancel', handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [handlePointerUp])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId = 0
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      // cobe v0.6 supports arcs at runtime but the published .d.ts only types markers.
      // We use a type assertion so we can pass arcs + arc-* props.
      const cobeOptions = {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.25,
        dark: 1,
        diffuse: 1.4,
        mapSamples: 16000,
        mapBrightness: 4,
        // Deep blue base, cyan-to-blue glow, cyan markers + arcs.
        baseColor: [0.06, 0.09, 0.16] as [number, number, number],
        markerColor: [0.22, 0.84, 1.0] as [number, number, number],
        glowColor: [0.18, 0.42, 1.0] as [number, number, number],
        markers: markers.map((m) => ({ location: m.location, size: 0.05 })),
        arcs: arcs.map((a) => ({ from: a.from, to: a.to })),
        arcColor: [0.22, 0.84, 1.0] as [number, number, number],
        arcWidth: 1.4,
        arcHeight: 0.32,
        opacity: 0.85,
        onRender: (state: Record<string, number>) => {
          if (!isPausedRef.current) phi += speed
          state['phi'] = phi + phiOffsetRef.current + dragOffset.current.phi
          state['theta'] = 0.25 + thetaOffsetRef.current + dragOffset.current.theta
          state['width'] = width * 2
          state['height'] = width * 2
        },
      }
      globe = createGlobe(canvas, cobeOptions as Parameters<typeof createGlobe>[1])

      // Fade-in once the canvas has actually painted.
      setTimeout(() => {
        if (canvas) canvas.style.opacity = '1'
      }, 16)
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if ((entries[0]?.contentRect.width ?? 0) > 0) {
          ro.disconnect()
          init()
        }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [markers, arcs, speed])

  return (
    <div className={cn('relative aspect-square select-none', className)}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'grab',
          opacity: 0,
          transition: 'opacity 1.2s ease',
          touchAction: 'none',
        }}
      />
    </div>
  )
}
