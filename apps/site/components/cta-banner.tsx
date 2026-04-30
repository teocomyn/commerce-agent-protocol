import { Button } from './button'
import { ArrowRight, GitHubIcon } from './icons'
import { ShinyButton } from './ui/shiny-button'

export function CtaBanner() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(47,107,255,0.18), transparent 60%)',
        }}
      />
      <div className="absolute inset-0 bg-grid mask-fade-y opacity-40 pointer-events-none" />

      <div className="
        relative max-w-4xl mx-auto rounded-2xl
        border border-edge bg-gradient-to-b from-surface to-midnight
        p-10 sm:p-16 text-center
        shadow-elev shadow-glow
      ">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent mb-4">
          / SHIP IT
        </p>
        <h2 className="font-semibold tracking-tighter leading-[1.1] text-3xl sm:text-5xl text-gradient-fade max-w-3xl mx-auto">
          Make your store buyable<br />
          by every AI agent on Earth.
        </h2>
        <p className="text-base sm:text-lg text-muted leading-relaxed mt-6 max-w-xl mx-auto">
          The protocol is open. The reference is shipping. The agents are ready.
          Plug your catalog in 5 minutes.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-10 items-center">
          <ShinyButton href="https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec" external>
            <span className="inline-flex items-center gap-2">
              Read the spec
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </ShinyButton>
          <Button variant="secondary" size="lg" href="https://github.com/teocomyn/commerce-agent-protocol" external>
            <GitHubIcon className="w-4 h-4" />
            <span>github.com/teocomyn/cap</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
