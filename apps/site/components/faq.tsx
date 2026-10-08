import { SectionHead } from './section-head'

const faqs = [
  {
    q: 'Is CAP a SaaS or a protocol?',
    a: 'A protocol with a reference implementation. The CAP specification and the reference code are both open source under Apache 2.0, and anyone can implement the spec. Today you self-host it. A hosted version is not available yet.',
  },
  {
    q: 'How is CAP different from MCP?',
    a: 'MCP is a generic LLM-tool protocol. CAP is specialized for commerce: catalog ingestion, semantic search, comparison and checkout creation. CAP ships a stdio MCP server with three tools as one transport, alongside its REST API. It builds on MCP rather than replacing it.',
  },
  {
    q: 'Why not just use schema.org?',
    a: 'schema.org is static, designed for Google indexers, and not transactional. CAP is queryable: stock and prices kept in sync through Shopify webhooks, semantic search, and deterministic checkout through the Shopify Cart API. schema.org tells Google what your products are. CAP lets agents find them and hand the shopper a ready cart.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'Shopify only, today: OAuth install, catalog sync via Admin GraphQL, HMAC-verified webhooks and checkout via the Cart API. The spec is platform-neutral, and adapters for other platforms are open to contributions. None exist yet.',
  },
  {
    q: 'How do you prevent agents from abusing checkouts?',
    a: 'Every API key is rate-limited per merchant plan. Checkout requests are scoped to the calling merchant, validate stock + variants, and persist an AgentCheckout row that is reconciled against the orders/paid webhook. There is no fraud detection in v0.1: agents never pay, and the shopper completes payment on Shopify.',
  },
  {
    q: 'Is the spec stable?',
    a: 'No, v0.x is alpha. Breaking changes will happen before v1.0. They will be tracked in the changelog and require a Spec Proposal in the issue tracker before landing.',
  },
  {
    q: 'Who is behind CAP?',
    a: 'CAP is built and maintained by Teo Comyn, currently the only maintainer. The spec and the code are developed in the open on GitHub, and contributions are welcome.',
  },
  {
    q: 'How do I contribute?',
    a: 'Read CONTRIBUTING.md. Open a PR against the reference implementation, or open a Spec Proposal for protocol changes. Issues labeled "good first issue" are a great entry point.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="py-24 sm:py-32 px-6 sm:px-8 relative">
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
