'use client'

import { useEffect, useId, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'

interface SparklesProps {
  className?: string
  size?: number
  minSize?: number | null
  density?: number
  speed?: number
  minSpeed?: number | null
  opacity?: number
  opacitySpeed?: number
  minOpacity?: number | null
  color?: string
  background?: string
  options?: Record<string, unknown>
}

export function Sparkles({
  className,
  size = 1.4,
  minSize = null,
  density = 800,
  speed = 1,
  minSpeed = null,
  opacity = 1,
  opacitySpeed = 3,
  minOpacity = null,
  color = '#FFFFFF',
  background = 'transparent',
  options = {},
}: SparklesProps) {
  const [isReady, setIsReady] = useState(false)
  // Reduced motion: the same field of particles, standing still.
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine)
    }).then(() => setIsReady(true))
  }, [])

  const id = useId()

  const defaultOptions = {
    background: { color: { value: background } },
    fullScreen: { enable: false, zIndex: 1 },
    fpsLimit: 120,
    particles: {
      color: { value: color },
      move: {
        enable: !reducedMotion,
        direction: 'none' as const,
        speed: { min: minSpeed ?? speed / 10, max: speed },
        straight: false,
      },
      number: { value: density },
      opacity: {
        value: { min: minOpacity ?? opacity / 10, max: opacity },
        animation: { enable: !reducedMotion, sync: false, speed: opacitySpeed },
      },
      size: { value: { min: minSize ?? size / 2.5, max: size } },
    },
    detectRetina: true,
  }

  if (!isReady) return null

  return <Particles id={id} options={{ ...defaultOptions, ...options }} className={className} />
}
