'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BentoItem {
  title: string
  description: string
  icon: React.ReactNode
  status?: string
  tags?: string[]
  meta?: string
  cta?: string
  colSpan?: number
  hasPersistentHover?: boolean
}

interface BentoGridProps {
  items: BentoItem[]
  className?: string
}

export function BentoGrid({ items, className }: BentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            'group relative p-5 rounded-xl overflow-hidden transition-all duration-500',
            'border border-edge bg-surface/60 backdrop-blur-sm',
            'hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-glow-cyan',
            'will-change-transform',
            item.colSpan === 2 ? 'md:col-span-2' : 'md:col-span-1',
            {
              'border-edge-strong shadow-glow-cyan -translate-y-0.5': item.hasPersistentHover,
            },
          )}
        >
          {/* Pattern overlay */}
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-500',
              item.hasPersistentHover ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,214,255,0.06)_1px,transparent_1px)] bg-[length:6px_6px]" />
          </div>

          <div className="relative flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div
                className="
                  w-9 h-9 rounded-lg flex items-center justify-center
                  bg-gradient-to-br from-primary/15 to-accent/5
                  border border-edge-strong
                  group-hover:from-primary/25 group-hover:to-accent/10
                  transition-all duration-500
                "
              >
                {item.icon}
              </div>
              {item.status && (
                <span
                  className="
                    font-mono text-[10px] uppercase tracking-widest
                    px-2 py-0.5 rounded-full border
                    border-pulse/30 bg-pulse/5 text-pulse
                  "
                >
                  {item.status}
                </span>
              )}
            </div>

            <div className="space-y-1.5 mt-2">
              <h3 className="font-semibold tracking-tight text-base text-fg">
                {item.title}
                {item.meta && (
                  <span className="ml-2 font-mono text-[11px] text-subtle font-normal tracking-wide">
                    {item.meta}
                  </span>
                )}
              </h3>
              <p className="text-sm text-muted leading-relaxed">{item.description}</p>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-edge">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="
                      font-mono text-[10px] px-2 py-0.5 rounded-md
                      bg-edge/40 text-subtle
                      hover:bg-edge hover:text-muted
                      transition-colors duration-300
                    "
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {item.cta && (
                <span className="text-[11px] font-mono text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {item.cta} →
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
