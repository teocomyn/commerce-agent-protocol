'use client'

import React, { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type GlowColor = 'blue' | 'cyan' | 'pulse' | 'purple'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: GlowColor
  // CAP uses brand-aligned hue ranges. base/spread are HSL hue numbers.
}

const glowColorMap: Record<GlowColor, { base: number; spread: number }> = {
  blue: { base: 220, spread: 80 },
  cyan: { base: 190, spread: 60 },
  pulse: { base: 160, spread: 40 },
  purple: { base: 280, spread: 80 },
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  glowColor = 'blue',
}) => {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = (e: PointerEvent) => {
      const node = cardRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      node.style.setProperty('--x', x.toFixed(2))
      node.style.setProperty('--y', y.toFixed(2))
      node.style.setProperty('--xp', (x / rect.width).toFixed(3))
      node.style.setProperty('--yp', (y / rect.height).toFixed(3))
    }
    document.addEventListener('pointermove', sync)
    return () => document.removeEventListener('pointermove', sync)
  }, [])

  const { base, spread } = glowColorMap[glowColor]

  const styles: React.CSSProperties & Record<string, string | number> = {
    '--base': base,
    '--spread': spread,
    '--radius': '16',
    '--border': '1',
    '--backdrop': 'rgba(15, 23, 41, 0.6)',
    '--backup-border': 'rgba(45, 58, 82, 0.6)',
    '--size': '260',
    '--outer': '1',
    '--border-size': 'calc(var(--border, 1) * 1px)',
    '--spotlight-size': 'calc(var(--size, 260) * 1px)',
    '--hue': 'calc(var(--base) + (var(--xp, 0.5) * var(--spread, 80)))',
    backgroundImage: `radial-gradient(
      var(--spotlight-size) var(--spotlight-size) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) 90% 65% / var(--bg-spot-opacity, 0.12)),
      transparent 60%
    )`,
    backgroundColor: 'var(--backdrop, transparent)',
    backgroundSize: 'calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))',
    backgroundPosition: '50% 50%',
    border: 'var(--border-size) solid var(--backup-border)',
    position: 'relative',
    touchAction: 'none',
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: glowStyles }} />
      <div
        ref={cardRef}
        data-glow
        style={styles}
        className={cn(
          'rounded-2xl relative backdrop-blur-[6px]',
          'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'will-change-transform',
          className,
        )}
      >
        <div data-glow />
        {children}
      </div>
    </>
  )
}

const glowStyles = `
  [data-glow]::before,
  [data-glow]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: calc(var(--border-size) * -1);
    border: var(--border-size) solid transparent;
    border-radius: calc(var(--radius) * 1px);
    background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
    background-repeat: no-repeat;
    background-position: 50% 50%;
    -webkit-mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    -webkit-mask-clip: padding-box, border-box;
    -webkit-mask-composite: xor;
    mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    mask-clip: padding-box, border-box;
    mask-composite: intersect;
  }
  [data-glow]::before {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.7) calc(var(--spotlight-size) * 0.7) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) 95% 65% / 0.85),
      transparent 100%
    );
    filter: brightness(1.4);
  }
  [data-glow]::after {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.45) calc(var(--spotlight-size) * 0.45) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      rgba(255, 255, 255, 0.85),
      transparent 100%
    );
  }
  [data-glow] [data-glow] {
    position: absolute;
    inset: 0;
    will-change: filter;
    opacity: var(--outer, 1);
    border-radius: calc(var(--radius) * 1px);
    border-width: calc(var(--border-size) * 18);
    filter: blur(calc(var(--border-size) * 8));
    background: none;
    pointer-events: none;
    border: none;
  }
  [data-glow] > [data-glow]::before {
    inset: -10px;
    border-width: 10px;
  }
`
