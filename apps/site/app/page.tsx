import { SiteNav } from '@/components/site-nav'
import { Footer } from '@/components/ui/footer-section'
import { Hero } from '@/components/hero'
import { Marquee } from '@/components/marquee'
import { FeaturesBento } from '@/components/features-bento'
import { Architecture } from '@/components/architecture'
import { WhyCap } from '@/components/why-cap'
import { GlobeSection } from '@/components/globe-section'
import { Faq } from '@/components/faq'
import { CpuSection } from '@/components/cpu-section'
import { CtaBanner } from '@/components/cta-banner'

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Marquee />
        <FeaturesBento />
        <Architecture />
        <WhyCap />
        <GlobeSection />
        <CpuSection />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
    </>
  )
}
