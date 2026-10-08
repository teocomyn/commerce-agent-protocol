import { Card, CardHeader, CardContent } from './ui/card'
import { BentoGrid, type BentoItem } from './ui/bento-grid'
import { SectionHead } from './section-head'
import { cn } from '@/lib/utils'
import {
  Search,
  ShoppingCart,
  Cpu,
  Layers,
  ShieldCheck,
  Globe,
  Zap,
  GitBranch,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

// Corner decorators à la Tailark (4 brackets)
function CornerDecorator() {
  return (
    <>
      <span className="absolute -left-px -top-px block size-2.5 border-l-2 border-t-2 border-accent" />
      <span className="absolute -right-px -top-px block size-2.5 border-r-2 border-t-2 border-accent" />
      <span className="absolute -bottom-px -left-px block size-2.5 border-b-2 border-l-2 border-accent" />
      <span className="absolute -bottom-px -right-px block size-2.5 border-b-2 border-r-2 border-accent" />
    </>
  )
}

interface FeatureCardProps {
  children: ReactNode
  className?: string
}

function FeatureCard({ children, className }: FeatureCardProps) {
  return (
    <Card
      className={cn(
        'group relative rounded-none border-edge bg-surface/40 backdrop-blur-sm shadow-card overflow-hidden',
        'transition-colors duration-500 hover:bg-surface/60',
        className,
      )}
    >
      <CornerDecorator />
      {children}
    </Card>
  )
}

interface CardHeadingProps {
  icon: LucideIcon
  title: string
  description: string
}

function CardHeading({ icon: Icon, title, description }: CardHeadingProps) {
  return (
    <div className="p-6">
      <span className="text-muted font-mono text-[11px] uppercase tracking-widest flex items-center gap-2">
        <Icon className="size-4 text-accent" />
        {title}
      </span>
      <p className="mt-6 text-2xl sm:text-[26px] font-semibold tracking-tight leading-[1.2] text-fg">
        {description}
      </p>
    </div>
  )
}

// Visual: animated semantic-search demo
function SearchVisual() {
  const queries = ['white sneakers under €120', 'organic cotton tee', 'merchant-declared GOTS']
  const result = {
    title: 'Leather sneaker, white (sample)',
    price: '€110',
    geo: 87,
  }
  return (
    <div className="relative px-6 pb-6">
      <div className="absolute inset-0 [background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,rgba(47,107,255,0.12),rgba(56,214,255,0.05)_125%)]" />
      <div className="relative space-y-2 mt-2">
        {queries.map((q, i) => (
          <div
            key={q}
            className={cn(
              'flex items-center gap-3 rounded-md border border-edge bg-void/60 px-3 py-2.5 font-mono text-[12px]',
              i === 0 ? 'opacity-100' : i === 1 ? 'opacity-70' : 'opacity-40',
            )}
          >
            <Search className="size-3 text-accent flex-shrink-0" />
            <span className="text-muted truncate">{q}</span>
            {i === 0 && (
              <span className="ml-auto text-pulse text-[10px] uppercase tracking-widest font-medium">
                semantic
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="relative mt-4 rounded-md border border-accent/30 bg-gradient-to-br from-primary/10 to-accent/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-8 rounded bg-edge-strong flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-fg text-[13px] font-medium truncate">{result.title}</div>
              <div className="font-mono text-[10px] text-subtle truncate">demo data · geo {result.geo}/100 · in stock</div>
            </div>
          </div>
          <span className="font-semibold text-base text-gradient-brand flex-shrink-0">{result.price}</span>
        </div>
      </div>
    </div>
  )
}

// Visual: checkout creation flow (the shopper completes payment on Shopify)
function CheckoutVisual() {
  return (
    <div className="relative px-6 pb-6">
      <div className="absolute -inset-6 [background:radial-gradient(50%_50%_at_75%_50%,transparent,rgba(0,0,0,0.6)_100%)]" />
      <div className="relative space-y-2.5 mt-2">
        {[
          { label: 'POST /v1/checkout/initiate', tone: 'method' as const },
          { label: 'merchant ✓ variant ✓ stock ✓', tone: 'check' as const },
          { label: 'cartCreate → Shopify Storefront', tone: 'pulse' as const },
          { label: 'checkout.url returned · shopper pays on Shopify', tone: 'success' as const },
        ].map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border border-edge bg-void/60 px-3 py-2 font-mono text-[12px]"
          >
            <span
              className={cn(
                'size-1.5 rounded-full flex-shrink-0',
                step.tone === 'method' && 'bg-accent',
                step.tone === 'check' && 'bg-pulse',
                step.tone === 'pulse' && 'bg-primary',
                step.tone === 'success' && 'bg-pulse animate-pulse-soft',
              )}
            />
            <span
              className={cn(
                'truncate',
                step.tone === 'success' ? 'text-pulse' : 'text-muted',
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Circular UI decoration for the wide bottom card
interface CircleConfig {
  pattern: 'none' | 'border' | 'primary' | 'accent'
}

function CircularUI({
  label,
  circles,
  className,
}: {
  label: string
  circles: CircleConfig[]
  className?: string
}) {
  return (
    <div className={className}>
      <div className="bg-gradient-to-b from-edge size-fit rounded-2xl to-transparent p-px">
        <div className="bg-gradient-to-b from-surface to-midnight relative flex aspect-square w-fit items-center -space-x-4 rounded-[15px] p-4">
          {circles.map((circle, i) => (
            <div
              key={i}
              className={cn('size-7 rounded-full border sm:size-9', {
                'border-accent': circle.pattern === 'none',
                'border-edge bg-[repeating-linear-gradient(-45deg,#1F2A40,#1F2A40_1px,transparent_1px,transparent_4px)]':
                  circle.pattern === 'border',
                'border-primary bg-void bg-[repeating-linear-gradient(-45deg,#2F6BFF,#2F6BFF_1px,transparent_1px,transparent_4px)]':
                  circle.pattern === 'primary',
                'z-10 border-accent bg-void bg-[repeating-linear-gradient(-45deg,#38D6FF,#38D6FF_1px,transparent_1px,transparent_4px)]':
                  circle.pattern === 'accent',
              })}
            />
          ))}
        </div>
      </div>
      <span className="text-subtle font-mono text-[10px] uppercase tracking-widest mt-2 block text-center">
        {label}
      </span>
    </div>
  )
}

const bentoItems: BentoItem[] = [
  {
    title: 'Shopify today',
    meta: 'OAuth',
    description:
      'Shopify OAuth install, catalog sync via Admin GraphQL, HMAC-verified webhooks. Open spec for other platforms.',
    icon: <Globe className="w-4 h-4 text-accent" />,
    status: 'v0.1',
    tags: ['Shopify', 'Open spec'],
    colSpan: 2,
    hasPersistentHover: true,
  },
  {
    title: 'Vector embeddings',
    meta: '1536d',
    description: 'pgvector cosine similarity over text-embedding-3-small, with a lexical fallback.',
    icon: <Layers className="w-4 h-4 text-accent" />,
    status: 'v0.1',
    tags: ['Postgres', 'Search'],
  },
  {
    title: 'Authenticated access',
    meta: 'SHA-256',
    description:
      'API keys stored as SHA-256 hashes, per-plan rate limits, Shopify tokens encrypted with AES-256-GCM.',
    icon: <ShieldCheck className="w-4 h-4 text-pulse" />,
    status: 'v0.1',
    tags: ['Auth', 'Security'],
  },
  {
    title: 'Enrichment + GEO score',
    meta: '0-100',
    description:
      'GPT-4o-mini enriches product data, and a GEO score flags how complete each listing is for agents. Each API key is scoped to one merchant.',
    icon: <Zap className="w-4 h-4 text-accent" />,
    status: 'v0.1',
    tags: ['LLM', 'Catalog'],
    colSpan: 2,
  },
]

export function FeaturesBento() {
  return (
    <section id="protocol" className="py-24 sm:py-32 px-6 sm:px-8 relative">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="THE PROTOCOL"
          title={
            <>
              The plumbing between commerce agents
              <br className="hidden sm:block" /> and real store catalogs.
            </>
          }
          sub="Three pillars, one open protocol. Catalog sync and enrichment, checkout through the Shopify Cart API, and an MCP server. Open spec, self-hosted reference implementation."
          className="mb-16"
        />

        {/* 2 large cards with corner decorators */}
        <div className="mx-auto grid gap-4 lg:grid-cols-2">
          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={Search}
                title="01 / SEMANTIC CATALOG"
                description="Agents search products by intent, not keywords."
              />
            </CardHeader>
            <div className="border-t border-edge border-dashed">
              <SearchVisual />
            </div>
          </FeatureCard>

          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={ShoppingCart}
                title="02 / CART CHECKOUT"
                description="One API call. Cart created. The shopper pays on Shopify."
              />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <CheckoutVisual />
            </CardContent>
          </FeatureCard>

          {/* Wide bottom card with circular UI */}
          <FeatureCard className="p-8 lg:col-span-2">
            <p className="mx-auto max-w-md text-balance text-center text-2xl sm:text-[26px] font-semibold leading-[1.25] text-fg">
              Native <span className="text-gradient-brand">MCP</span> server. Three tools.
              <br />
              Runs over stdio in Claude Desktop, Cursor and other local MCP clients.
            </p>

            <div className="flex justify-center gap-6 sm:gap-10 mt-10 overflow-hidden">
              <CircularUI
                label="search"
                circles={[{ pattern: 'border' }, { pattern: 'border' }]}
              />
              <CircularUI
                label="compare"
                circles={[{ pattern: 'none' }, { pattern: 'primary' }]}
              />
              <CircularUI
                label="checkout"
                circles={[{ pattern: 'accent' }, { pattern: 'none' }]}
              />
              <CircularUI
                label="stdio"
                circles={[{ pattern: 'primary' }, { pattern: 'none' }]}
                className="hidden sm:block"
              />
            </div>
          </FeatureCard>
        </div>

        {/* Bento grid with 4 more capabilities */}
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
              CAPABILITIES
            </span>
            <span className="h-px flex-1 bg-edge" />
            <span className="font-mono text-[10px] text-subtle">
              <GitBranch className="inline size-3 mr-1" />
              v0.1 alpha
            </span>
          </div>
          <BentoGrid items={bentoItems} />
        </div>
      </div>
    </section>
  )
}
