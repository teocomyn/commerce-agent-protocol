import { Badge } from './badge'
import { Button } from './button'
import { ArrowRight, GitHubIcon } from './icons'
import { CodePreview, C } from './code-preview'

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div className="absolute inset-0 bg-grid mask-fade-top pointer-events-none" />
      <div
        aria-hidden
        className="absolute top-[-200px] left-[10%] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #2F6BFF, transparent 70%)', filter: 'blur(80px)', opacity: 0.5 }}
      />
      <div
        aria-hidden
        className="absolute top-[100px] right-[5%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #38D6FF, transparent 70%)', filter: 'blur(80px)', opacity: 0.3 }}
      />

      <div className="relative max-w-container mx-auto px-6 sm:px-8 text-center">
        <div className="animate-fade-up">
          <Badge pulse className="mb-8">
            Alpha v0.1 · Apache 2.0 · Built in public
          </Badge>
        </div>

        <h1
          className="font-semibold tracking-tightest leading-[1.02] text-gradient-fade animate-fade-up max-w-hero mx-auto"
          style={{ fontSize: 'clamp(40px, 6vw, 72px)', animationDelay: '60ms' }}
        >
          The protocol that lets{' '}
          <span className="text-gradient-brand">AI agents</span>
          <br className="hidden sm:block" /> actually buy things.
        </h1>

        <p
          className="text-muted text-lg leading-relaxed max-w-xl mx-auto mt-6 animate-fade-up"
          style={{ animationDelay: '160ms' }}
        >
          Open infrastructure between e-commerce catalogs and shopping agents.
          Search, compare, transact. Signed, neutral, multi-vendor.
        </p>

        <div className="flex flex-wrap gap-3 justify-center mt-10 animate-fade-up" style={{ animationDelay: '240ms' }}>
          <Button variant="primary" size="lg" href="https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec" external>
            <span>Read the spec</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="secondary" size="lg" href="https://github.com/teocomyn/commerce-agent-protocol" external>
            <GitHubIcon className="w-4 h-4" />
            <span>Star on GitHub</span>
          </Button>
        </div>

        <div className="mt-20 max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: '360ms' }}>
          <CodePreview filename="agent.ts" tab="CAP SDK">
            <C.comment>{'// An AI agent searches and buys, in 4 lines.'}</C.comment>
            {'\n'}
            <C.keyword>const</C.keyword> <C.prop>cap</C.prop> = <C.keyword>new</C.keyword>{' '}
            <C.method>CAP</C.method>{'({ '}
            <C.prop>apiKey</C.prop>: <C.string>{'"cap_live_xxx"'}</C.string>
            {' })'}
            {'\n\n'}
            <C.keyword>const</C.keyword> <C.prop>products</C.prop> = <C.keyword>await</C.keyword> cap.
            <C.method>search</C.method>{'({ '}
            <C.prop>query</C.prop>: <C.string>{'"eco sneakers under $120"'}</C.string>
            {' })'}
            {'\n'}
            <C.keyword>const</C.keyword> <C.prop>checkout</C.prop> = <C.keyword>await</C.keyword> cap.
            <C.method>checkout</C.method>{'({ '}
            <C.prop>productId</C.prop>: products[<C.num>0</C.num>].id
            {' })'}
            {'\n'}
            <C.comment>{'// → checkout.url, signed and ready to be paid.'}</C.comment>
          </CodePreview>
        </div>
      </div>
    </section>
  )
}
