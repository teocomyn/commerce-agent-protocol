import { SectionHead } from './section-head'
import { Button } from './button'
import { Check } from './icons'
import { cn } from '@/lib/cn'

interface Tier {
  name: string
  price: string
  unit?: string
  desc: string
  cta: string
  href: string
  external?: boolean
  features: string[]
  featured?: boolean
  variant: 'primary' | 'secondary'
}

const tiers: Tier[] = [
  {
    name: 'OPEN',
    price: '$0',
    unit: 'forever',
    desc: 'Self-host the spec. Build your own implementation. Apache 2.0.',
    cta: 'Read the docs',
    href: 'https://github.com/teocomyn/commerce-agent-protocol',
    external: true,
    variant: 'secondary',
    features: [
      'Full protocol specification',
      'Reference implementation on GitHub',
      'Conformance test fixtures',
      'GitHub Discussions',
    ],
  },
  {
    name: 'HOSTED',
    price: '$99',
    unit: '/ month',
    desc: 'Plug your store. We handle the protocol.',
    cta: 'Start free trial',
    href: '#',
    featured: true,
    variant: 'primary',
    features: [
      '50k API calls per month',
      'Auto catalog enrichment',
      'Signed checkout flows',
      'Multi-store dashboard',
      'Email support',
    ],
  },
  {
    name: 'ENTERPRISE',
    price: 'Custom',
    desc: 'High-volume agents. Custom SLAs. White-glove integration.',
    cta: 'Talk to sales',
    href: 'mailto:hello@cap-protocol.org',
    variant: 'secondary',
    features: [
      'Unlimited API calls',
      '99.99% uptime SLA',
      'Dedicated infrastructure',
      'Custom contracts + DPA',
      'Slack support channel',
    ],
  },
]

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={cn(
        'relative rounded-xl p-8 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'border bg-surface flex flex-col',
        tier.featured
          ? 'border-primary shadow-glow'
          : 'border-edge hover:-translate-y-1 hover:border-edge-strong',
      )}
      style={
        tier.featured
          ? { background: 'linear-gradient(180deg, rgba(47,107,255,0.08), #0F1729)' }
          : undefined
      }
    >
      {tier.featured && (
        <div className="absolute -top-2.5 right-6 px-2.5 py-1 rounded-full bg-primary text-fg font-mono text-[10px] uppercase tracking-widest font-semibold">
          Most popular
        </div>
      )}

      <div className="font-mono text-xs uppercase tracking-widest text-muted mb-4">
        {tier.name}
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-5xl font-semibold tracking-tightest leading-none">{tier.price}</span>
        {tier.unit && <span className="text-sm text-muted">{tier.unit}</span>}
      </div>

      <p className="text-sm text-muted leading-relaxed mt-3 mb-6">{tier.desc}</p>

      <Button
        variant={tier.variant}
        href={tier.href}
        external={tier.external}
        className="w-full justify-center mb-6"
      >
        {tier.cta}
      </Button>

      <ul className="space-y-3 mt-auto pt-6 border-t border-edge">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-muted">
            <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32 px-6 sm:px-8 relative border-t border-edge">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="PRICING"
          title={
            <>
              Free to use.<br />
              Pay for scale.
            </>
          }
          sub="The protocol is open and free forever. Pay only when you use the hosted reference implementation at scale."
          className="mb-16"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tiers.map((t) => (
            <PricingCard key={t.name} tier={t} />
          ))}
        </div>

        <p className="text-center font-mono text-xs text-subtle mt-12">
          Hosted pricing is indicative. Final tiers will land with the public beta.
        </p>
      </div>
    </section>
  )
}
