import { cn } from '@/lib/cn'
import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  variant?: Variant
  size?: Size
  href?: string
  external?: boolean
  className?: string
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'text-fg bg-gradient-to-b from-primary to-primary-deep ' +
    'shadow-[0_0_0_1px_rgba(56,214,255,0.2),0_8px_24px_-8px_rgba(47,107,255,0.6),inset_0_1px_0_rgba(255,255,255,0.15)] ' +
    'hover:shadow-[0_0_0_1px_#38D6FF,0_16px_32px_-8px_rgba(47,107,255,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] ' +
    'hover:-translate-y-px',
  secondary:
    'text-fg bg-surface border border-edge-strong hover:bg-surface-2 hover:border-accent',
  ghost: 'text-muted hover:text-fg',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1',
  md: 'px-4 py-2 text-sm gap-1.5',
  lg: 'px-5 py-3 text-sm gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  href,
  external,
  className,
  children,
  ...rest
}: ButtonProps & Omit<ComponentPropsWithoutRef<'a'>, keyof ButtonProps>) {
  const classes = cn(
    'inline-flex items-center justify-center rounded-md font-medium tracking-snug',
    'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
    'border border-transparent select-none whitespace-nowrap',
    variantClasses[variant],
    sizeClasses[size],
    className,
  )

  if (href && external) {
    return (
      <a className={classes} href={href} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    )
  }

  if (href) {
    return (
      <Link className={classes} href={href} {...(rest as Record<string, unknown>)}>
        {children}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...(rest as Record<string, unknown>)}>
      {children}
    </button>
  )
}
