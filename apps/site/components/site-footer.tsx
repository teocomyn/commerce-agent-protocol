import Link from 'next/link'
import { CapMark } from './icons'

const cols = [
  {
    title: 'Protocol',
    links: [
      { label: 'Specification', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec' },
      { label: 'Reference impl', href: 'https://github.com/teocomyn/commerce-agent-protocol' },
      { label: 'Conformance', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec/v0.1/tests/conformance' },
      { label: 'Changelog', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/CHANGELOG.md' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '#protocol' },
      { label: 'OpenAPI', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/cap-spec/v0.1/openapi.yaml' },
      { label: 'Examples', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec/v0.1/examples' },
      { label: 'Discussions', href: 'https://github.com/teocomyn/commerce-agent-protocol/discussions' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Apache 2.0', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/LICENSE' },
      { label: 'Security', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/SECURITY.md' },
      { label: 'Code of conduct', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/CODE_OF_CONDUCT.md' },
      { label: 'Contributing', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/CONTRIBUTING.md' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-edge px-6 sm:px-8 pt-16 pb-8">
      <div className="max-w-container mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-8 mb-12">
          <div>
            <Link href="/" className="flex items-center gap-3 mb-4">
              <CapMark />
              <span className="font-semibold tracking-tight">CAP</span>
            </Link>
            <p className="text-sm text-muted leading-relaxed max-w-xs">
              The open protocol connecting e-commerce catalogs to AI shopping agents.
              Neutral. Signed. Multi-vendor.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h5 className="font-mono text-[11px] uppercase tracking-widest text-subtle mb-4 font-medium">
                {col.title}
              </h5>
              <ul className="space-y-1.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.href.startsWith('http') ? '_blank' : undefined}
                      rel={l.href.startsWith('http') ? 'noreferrer' : undefined}
                      className="text-sm text-muted hover:text-fg transition-colors py-1 inline-block"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-8 border-t border-edge flex flex-wrap justify-between items-center font-mono text-[11px] text-subtle gap-4">
          <span>cap-protocol.org · built by @teocomyn · apache 2.0</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-soft" />
            v0.1 alpha
          </span>
        </div>
      </div>
    </footer>
  )
}
