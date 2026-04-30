'use client'

import * as React from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { GitHubIcon, CapMark } from '@/components/icons'

interface FooterLink {
  title: string
  href: string
  external?: boolean
  icon?: React.ComponentType<{ className?: string }>
}

interface FooterSection {
  label: string
  links: FooterLink[]
}

const footerLinks: FooterSection[] = [
  {
    label: 'Protocol',
    links: [
      { title: 'Specification', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec', external: true },
      { title: 'Reference impl', href: 'https://github.com/teocomyn/commerce-agent-protocol', external: true },
      { title: 'Conformance', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec/v0.1/tests/conformance', external: true },
      { title: 'Changelog', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/CHANGELOG.md', external: true },
    ],
  },
  {
    label: 'Resources',
    links: [
      { title: 'Documentation', href: '#protocol' },
      { title: 'OpenAPI', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/cap-spec/v0.1/openapi.yaml', external: true },
      { title: 'Examples', href: 'https://github.com/teocomyn/commerce-agent-protocol/tree/main/cap-spec/v0.1/examples', external: true },
      { title: 'Discussions', href: 'https://github.com/teocomyn/commerce-agent-protocol/discussions', external: true },
    ],
  },
  {
    label: 'Company',
    links: [
      { title: 'About', href: '#protocol' },
      { title: 'Roadmap', href: '#roadmap' },
      { title: 'Pricing', href: '#pricing' },
      { title: 'FAQ', href: '#faq' },
    ],
  },
  {
    label: 'Connect',
    links: [
      { title: 'GitHub', href: 'https://github.com/teocomyn/commerce-agent-protocol', external: true, icon: GitHubIcon },
      { title: 'Security', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/SECURITY.md', external: true },
      { title: 'License', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/LICENSE', external: true },
      { title: 'Code of conduct', href: 'https://github.com/teocomyn/commerce-agent-protocol/blob/main/CODE_OF_CONDUCT.md', external: true },
    ],
  },
]

export function Footer() {
  return (
    <footer
      className="
        relative w-full max-w-7xl mx-auto px-6 py-14 lg:py-20 mt-12
        flex flex-col items-center justify-center
        rounded-t-3xl md:rounded-t-[40px] border-t border-edge
      "
      style={{
        background:
          'radial-gradient(35% 128px at 50% 0%, rgba(56,214,255,0.08), transparent)',
      }}
    >
      <div className="absolute top-0 right-1/2 left-1/2 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 blur" />

      <div className="grid w-full gap-10 xl:grid-cols-3 xl:gap-8">
        <AnimatedContainer className="space-y-4">
          <div className="flex items-center gap-3">
            <CapMark />
            <span className="font-semibold tracking-tight text-base">CAP</span>
            <span className="font-mono text-[11px] text-subtle border border-edge rounded-full px-2 py-0.5">
              v0.1
            </span>
          </div>
          <p className="text-muted text-sm leading-relaxed max-w-xs">
            The open protocol connecting e-commerce catalogs to AI shopping agents.
            Neutral. Signed. Multi-vendor.
          </p>
          <p className="text-subtle text-xs mt-8 font-mono">
            © {new Date().getFullYear()} CAP contributors · Apache 2.0
          </p>
        </AnimatedContainer>

        <div className="mt-2 grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2 xl:mt-0">
          {footerLinks.map((section, index) => (
            <AnimatedContainer key={section.label} delay={0.1 + index * 0.08}>
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-subtle mb-4">
                  {section.label}
                </h3>
                <ul className="text-muted space-y-2.5 text-sm">
                  {section.links.map((link) => (
                    <li key={link.title}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noreferrer' : undefined}
                        className="hover:text-fg inline-flex items-center transition-colors duration-300"
                      >
                        {link.icon && <link.icon className="me-1.5 size-3.5" />}
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedContainer>
          ))}
        </div>
      </div>

      <div className="w-full pt-12 mt-12 border-t border-edge flex flex-wrap justify-between items-center font-mono text-[11px] text-subtle gap-4">
        <span>cap-protocol.org · built by @teocomyn</span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse-soft" />
          alpha · stable enough to break things
        </span>
      </div>
    </footer>
  )
}

type ViewAnimationProps = {
  delay?: number
  className?: ComponentProps<typeof motion.div>['className']
  children: ReactNode
}

function AnimatedContainer({ className, delay = 0.1, children }: ViewAnimationProps) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return <>{children}</>
  return (
    <motion.div
      initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
      whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
