import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface CodePreviewProps {
  filename?: string
  tab?: string
  className?: string
  children: ReactNode
}

export function CodePreview({ filename = 'agent.ts', tab = 'CAP SDK', className, children }: CodePreviewProps) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-edge bg-midnight overflow-hidden',
        'shadow-glow shadow-elev',
        className,
      )}
    >
      <div className="flex items-center px-4 py-3 border-b border-edge bg-white/[0.02]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-edge-strong" />
          <span className="w-2.5 h-2.5 rounded-full bg-edge-strong" />
          <span className="w-2.5 h-2.5 rounded-full bg-edge-strong" />
        </div>
        <div className="flex-1 text-center font-mono text-xs text-subtle">{filename}</div>
        <div className="px-2 py-0.5 rounded font-mono text-[11px] text-accent bg-accent/10">
          {tab}
        </div>
      </div>
      <pre className="p-6 font-mono text-[13px] leading-7 text-fg overflow-x-auto">
        {children}
      </pre>
    </div>
  )
}

// Token components for syntax highlighting
export const C = {
  comment: (props: { children: ReactNode }) => (
    <span className="text-subtle">{props.children}</span>
  ),
  keyword: (props: { children: ReactNode }) => (
    <span style={{ color: '#C586C0' }}>{props.children}</span>
  ),
  method: (props: { children: ReactNode }) => (
    <span className="text-accent">{props.children}</span>
  ),
  string: (props: { children: ReactNode }) => (
    <span style={{ color: '#00FFB7' }}>{props.children}</span>
  ),
  prop: (props: { children: ReactNode }) => (
    <span style={{ color: '#9CDCFE' }}>{props.children}</span>
  ),
  type: (props: { children: ReactNode }) => (
    <span style={{ color: '#4EC9B0' }}>{props.children}</span>
  ),
  num: (props: { children: ReactNode }) => (
    <span style={{ color: '#B5CEA8' }}>{props.children}</span>
  ),
}
