import { cn } from '@/lib/cn'

interface BadgeProps {
  children: React.ReactNode
  pulse?: boolean
  className?: string
}

export function Badge({ children, pulse = false, className }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-muted',
        className,
      )}
    >
      {pulse && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-soft"
          style={{ boxShadow: '0 0 10px #00FFB7' }}
        />
      )}
      {children}
    </div>
  )
}
