import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/hero'
import { Marquee } from '@/components/marquee'
import { Pillars } from '@/components/pillars'
import { CodeTabs } from '@/components/code-tabs'
import { Architecture } from '@/components/architecture'
import { WhyCap } from '@/components/why-cap'
import { Comparison } from '@/components/comparison'
import { GlobeSection } from '@/components/globe-section'
import { Pricing } from '@/components/pricing'
import { Roadmap } from '@/components/roadmap'
import { Faq } from '@/components/faq'
import { CtaBanner } from '@/components/cta-banner'

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Marquee />
        <Pillars />
        <CodeTabs />
        <Architecture />
        <WhyCap />
        <Comparison />
        <GlobeSection />
        <Pricing />
        <Roadmap />
        <Faq />
        <CtaBanner />
      </main>
      <SiteFooter />
    </>
  )
}
