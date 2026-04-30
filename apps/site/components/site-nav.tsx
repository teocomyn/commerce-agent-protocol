import Link from 'next/link'
import { Button } from './button'
import { CapMark, GitHubIcon } from './icons'

const links = [
  { label: 'Protocol', href: '#protocol' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Spec', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec' },
  { label: 'GitHub', href: 'https://github.com/teocomyn/commerce-agent-protocol' },
]

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-edge glass-nav">
      <div className="max-w-container mx-auto flex items-center justify-between px-6 sm:px-8 py-3">
        <Link href="/" className="flex items-center gap-3 group">
          <CapMark />
          <span className="font-semibold tracking-tight text-base">CAP</span>
          <span className="hidden sm:inline-block font-mono text-[11px] text-subtle border border-edge rounded-full px-2 py-0.5">
            v0.1
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-muted">
          {links.map((l) =>
            l.href.startsWith('#') ? (
              <Link
                key={l.label}
                href={l.href}
                className="hover:text-fg transition-colors duration-200"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-fg transition-colors duration-200"
              >
                {l.label}
              </a>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            href="https://github.com/teocomyn/commerce-agent-protocol"
            external
            className="hidden sm:inline-flex"
          >
            <GitHubIcon className="w-4 h-4" />
            <span className="hidden lg:inline">Star on GitHub</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            href="https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec"
            external
          >
            Read the spec
          </Button>
        </div>
      </div>
    </nav>
  )
}
