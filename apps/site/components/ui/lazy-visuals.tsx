'use client'

import dynamic from 'next/dynamic'

// Decorative canvas visuals render nothing meaningful on the server and pull
// in large libraries (tsparticles, cobe): they load after the page is
// interactive instead of weighing on the first load.
export const LazySparkles = dynamic(() => import('./sparkles').then((module) => module.Sparkles), { ssr: false })
export const LazyGlobe = dynamic(() => import('./cobe-globe-cdn').then((module) => module.GlobeCdn), {
  ssr: false,
  loading: () => <div className="relative aspect-square w-full max-w-[560px] mx-auto" aria-hidden />,
})
