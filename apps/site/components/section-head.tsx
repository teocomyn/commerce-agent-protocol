import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface SectionHeadProps {
  overline?: string
  title: ReactNode
  sub?: ReactNode
  align?: 'center' | 'left'
  className?: string
}

export function SectionHead({ overline, title, sub, align = 'center', className }: SectionHeadProps) {
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' ? 'mx-auto text-center' : 'mr-auto text-left',
        className,
      )}
    >
      {overline && (
        <div className="inline-block font-mono text-[11px] uppercase tracking-widest text-accent mb-4">
          {overline}
        </div>
      )}
      <h2 className="font-semibold tracking-tighter leading-[1.1] text-3xl sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {sub && (
        <p className="text-base sm:text-lg text-muted leading-relaxed mt-4">{sub}</p>
      )}
    </div>
  )
}
