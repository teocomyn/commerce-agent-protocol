import { Badge } from './badge'
import { Button } from './button'
import { ArrowRight, GitHubIcon } from './icons'
import { FlickeringGrid } from './ui/flickering-grid'
import { ShinyButton } from './ui/shiny-button'

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-32 sm:pt-36 sm:pb-40 min-h-[88vh]">
      {/* Layer 1: ambient flickering grid (low density, slow flicker) */}
      <div className="absolute inset-0">
        <FlickeringGrid
          className="absolute inset-0 [mask-image:radial-gradient(circle_at_center,white,transparent_75%)]"
          color="rgb(56, 214, 255)"
          maxOpacity={0.15}
          flickerChance={0.08}
          squareSize={4}
          gridGap={6}
        />
      </div>

      {/* Layer 2: brand glows */}
      <div
        aria-hidden
        className="absolute top-[-180px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(47,107,255,0.4), transparent 60%)',
          filter: 'blur(70px)',
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-[-140px] right-[8%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(56,214,255,0.18), transparent 70%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Top fade-out so the nav sits cleanly */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, #050505, transparent)' }}
      />

      <div className="relative max-w-container mx-auto px-6 sm:px-8 text-center">
        <div className="animate-fade-up">
          <Badge pulse className="mb-8">
            Alpha v0.1 · Apache 2.0 · Built in public
          </Badge>
        </div>

        <h1
          className="font-semibold tracking-tightest leading-[1.02] text-gradient-fade animate-fade-up max-w-hero mx-auto"
          style={{ fontSize: 'clamp(40px, 6.5vw, 80px)', animationDelay: '60ms' }}
        >
          The protocol that lets{' '}
          <span className="text-gradient-brand">AI agents</span>
          <br className="hidden sm:block" /> actually buy things.
        </h1>

        <p
          className="text-muted text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mt-7 animate-fade-up"
          style={{ animationDelay: '160ms' }}
        >
          Open infrastructure between e-commerce catalogs and shopping agents.{' '}
          <br className="hidden md:block" />
          Search, compare, transact. Signed, neutral, multi-vendor.
        </p>

        <div
          className="flex flex-wrap gap-3 justify-center mt-10 animate-fade-up items-center"
          style={{ animationDelay: '240ms' }}
        >
          <ShinyButton
            href="https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec"
            external
          >
            <span className="inline-flex items-center gap-2">
              Read the spec
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </ShinyButton>
          <Button
            variant="secondary"
            size="lg"
            href="https://github.com/teocomyn/commerce-agent-protocol"
            external
          >
            <GitHubIcon className="w-4 h-4" />
            <span>Star on GitHub</span>
          </Button>
        </div>

        {/* Trust strip — 4 micro-stats */}
        <div
          className="mt-20 grid grid-cols-2 sm:grid-cols-4 max-w-3xl mx-auto gap-px bg-edge rounded-xl overflow-hidden border border-edge animate-fade-up"
          style={{ animationDelay: '420ms' }}
        >
          {[
            { v: '< 300ms', l: 'p50 search' },
            { v: '1536d', l: 'embedding' },
            { v: 'MCP', l: 'native' },
            { v: 'Apache 2.0', l: 'license' },
          ].map((s) => (
            <div key={s.l} className="bg-void/80 backdrop-blur p-4 sm:p-5 text-center">
              <div className="font-semibold tracking-tight text-base sm:text-lg text-gradient-brand">{s.v}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-subtle mt-1">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom fade-out to next section */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(0deg, #050505, transparent)' }}
      />
    </section>
  )
}
