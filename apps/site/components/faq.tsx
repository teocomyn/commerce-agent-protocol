import { SectionHead } from './section-head'

const faqs = [
  {
    q: 'Is CAP a SaaS or a protocol?',
    a: 'Both. The CAP specification is open and free under Apache 2.0 (anyone can implement it). The hosted reference SaaS is a service: pay only if you do not want to run it yourself. Same playbook as Stripe vs ISO 20022.',
  },
  {
    q: 'How is CAP different from MCP?',
    a: 'MCP is a generic LLM-tool protocol. CAP is specialized for commerce: catalog ingestion, semantic search, checkout, signed transactions, fraud guardrails. CAP uses MCP as one of its transports — not as a replacement.',
  },
  {
    q: 'Why not just use schema.org?',
    a: 'schema.org is static, designed for Google indexers, and not transactional. CAP is dynamic: live stock, signed prices, deterministic checkout. schema.org tells Google what your products are. CAP lets agents buy them.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'Today: Shopify (full OAuth + webhooks + Cart API). v0.2: WooCommerce. v1.0: Salesforce Commerce. Custom catalogs via the open spec at any time.',
  },
  {
    q: 'How do you prevent agents from abusing checkouts?',
    a: 'Every API key is rate-limited per merchant plan. Checkout requests are scoped to the calling merchant, validate stock + variants, and persist an AgentCheckout row that is reconciled against the orders/paid webhook.',
  },
  {
    q: 'Is the spec stable?',
    a: 'No, v0.x is alpha. Breaking changes will happen before v1.0. They will be tracked in the changelog and require a Spec Proposal in the issue tracker before landing.',
  },
  {
    q: 'Who is behind CAP?',
    a: 'Built initially by Teo Comyn. The spec lives in the open and is governed by the contributor community. We expect maintainer expansion as adoption grows.',
  },
  {
    q: 'How do I contribute?',
    a: 'Read CONTRIBUTING.md. Open a PR against the reference implementation, or open a Spec Proposal for protocol changes. Issues labeled "good first issue" are a great entry point.',
  },
]

export function Faq() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="FAQ"
          title={<>Common questions.</>}
          sub="Honest answers about scope, status, and how CAP relates to other protocols you might already know."
          className="mb-16"
        />

        <div className="max-w-3xl mx-auto divide-y divide-edge border-y border-edge">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="group py-5 cursor-pointer"
            >
              <summary className="flex items-center justify-between gap-4 list-none">
                <span className="font-medium tracking-tight text-fg">{f.q}</span>
                <span
                  className="
                    flex-shrink-0 w-6 h-6 rounded-full border border-edge-strong
                    flex items-center justify-center text-muted
                    transition-transform duration-300 group-open:rotate-45 group-open:text-accent group-open:border-accent
                  "
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="text-sm text-muted leading-relaxed mt-3 pr-10">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
