'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { SectionHead } from './section-head'
import { CodePreview, C } from './code-preview'

type TabKey = 'ts' | 'curl' | 'python' | 'mcp'

const tabs: { key: TabKey; label: string; filename: string; tab: string }[] = [
  { key: 'ts', label: 'TypeScript', filename: 'agent.ts', tab: '@cap/sdk' },
  { key: 'curl', label: 'curl', filename: 'request.sh', tab: 'HTTP/JSON' },
  { key: 'python', label: 'Python', filename: 'agent.py', tab: 'cap-python' },
  { key: 'mcp', label: 'MCP', filename: 'config.json', tab: 'Claude Desktop' },
]

export function CodeTabs() {
  const [active, setActive] = useState<TabKey>('ts')

  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative" id="docs">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="DEVELOPER EXPERIENCE"
          title={<>Drop into your agent in minutes.</>}
          sub="One protocol, every language. Use the SDK or hit the API directly. Or wire MCP and let Claude Desktop talk to a CAP server out of the box."
          className="mb-16"
        />

        <div className="max-w-3xl mx-auto">
          <div className="flex gap-1 p-1 mb-4 rounded-lg border border-edge bg-surface w-fit mx-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={cn(
                  'px-4 py-1.5 rounded-md font-mono text-xs transition-all duration-200',
                  active === t.key
                    ? 'bg-edge-strong text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'text-muted hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <CodePreview
            filename={tabs.find((t) => t.key === active)!.filename}
            tab={tabs.find((t) => t.key === active)!.tab}
          >
            {active === 'ts' && <TsSnippet />}
            {active === 'curl' && <CurlSnippet />}
            {active === 'python' && <PythonSnippet />}
            {active === 'mcp' && <McpSnippet />}
          </CodePreview>
        </div>
      </div>
    </section>
  )
}

function TsSnippet() {
  return (
    <>
      <C.keyword>import</C.keyword> {'{ '}<C.method>CAP</C.method>{' } '}
      <C.keyword>from</C.keyword> <C.string>{"'@cap/sdk'"}</C.string>
      {'\n\n'}
      <C.keyword>const</C.keyword> <C.prop>cap</C.prop> = <C.keyword>new</C.keyword>{' '}
      <C.method>CAP</C.method>{'({ '}
      <C.prop>apiKey</C.prop>: process.env.<C.prop>CAP_API_KEY</C.prop>!
      {' })'}
      {'\n\n'}
      <C.comment>{'// Semantic search across every connected merchant'}</C.comment>
      {'\n'}
      <C.keyword>const</C.keyword> {'{ '}<C.prop>results</C.prop>{' } '}=
      <C.keyword> await</C.keyword> cap.<C.method>search</C.method>{'({'}
      {'\n'}
      {'  '}<C.prop>query</C.prop>: <C.string>{"'eco sneakers under $120 shipping to FR'"}</C.string>,
      {'\n'}
      {'  '}<C.prop>limit</C.prop>: <C.num>5</C.num>,
      {'\n'}
      {'}'})
      {'\n\n'}
      <C.comment>{'// Compare. Initiate checkout. Done.'}</C.comment>
      {'\n'}
      <C.keyword>const</C.keyword> <C.prop>checkout</C.prop> = <C.keyword>await</C.keyword> cap.
      <C.method>checkout</C.method>{'({ '}
      <C.prop>productId</C.prop>: results[<C.num>0</C.num>].id, <C.prop>quantity</C.prop>: <C.num>1</C.num>{' })'}
      {'\n'}
      <C.method>open</C.method>(checkout.<C.prop>url</C.prop>) <C.comment>{'// Cart API URL'}</C.comment>
    </>
  )
}

function CurlSnippet() {
  return (
    <>
      <C.method>curl</C.method> -X POST <C.string>https://api.cap-protocol.org/v1/search</C.string> {'\\'}
      {'\n'}
      {'  '}-H <C.string>{'"X-CAP-Key: cap_live_xxx"'}</C.string> {'\\'}
      {'\n'}
      {'  '}-H <C.string>{'"Content-Type: application/json"'}</C.string> {'\\'}
      {'\n'}
      {'  '}-d <C.string>{`'{"query": "eco sneakers", "limit": 3}'`}</C.string>
      {'\n\n'}
      <C.comment>{'# Response (truncated)'}</C.comment>
      {'\n'}
      {'{'}
      {'\n'}
      {'  '}<C.prop>{'"results"'}</C.prop>: [
      {'\n'}
      {'    '}{'{'}
      {'\n'}
      {'      '}<C.prop>{'"id"'}</C.prop>: <C.string>{'"prod_8f6c4d12"'}</C.string>,
      {'\n'}
      {'      '}<C.prop>{'"title"'}</C.prop>: <C.string>{'"VEJA Campo White"'}</C.string>,
      {'\n'}
      {'      '}<C.prop>{'"price"'}</C.prop>: {'{ '}<C.prop>{'"amount"'}</C.prop>: <C.num>110</C.num>, <C.prop>{'"currency"'}</C.prop>: <C.string>{'"EUR"'}</C.string>{' }'},
      {'\n'}
      {'      '}<C.prop>{'"checkout_url"'}</C.prop>: <C.string>{'"...:/v1/checkout/initiate"'}</C.string>
      {'\n'}
      {'    '}{'}'}
      {'\n'}
      {'  '}],
      {'\n'}
      {'  '}<C.prop>{'"latency_ms"'}</C.prop>: <C.num>197</C.num>
      {'\n'}
      {'}'}
    </>
  )
}

function PythonSnippet() {
  return (
    <>
      <C.keyword>from</C.keyword> cap <C.keyword>import</C.keyword> <C.method>CAP</C.method>
      {'\n\n'}
      cap = <C.method>CAP</C.method>(api_key=<C.string>{'"cap_live_xxx"'}</C.string>)
      {'\n\n'}
      <C.comment>{'# Search semantically'}</C.comment>
      {'\n'}
      results = cap.<C.method>search</C.method>(
      {'\n'}
      {'    '}query=<C.string>{'"organic cotton tee shipping to US"'}</C.string>,
      {'\n'}
      {'    '}filters={'{'}<C.string>{'"certifications"'}</C.string>: [<C.string>{'"GOTS"'}</C.string>]{'}'},
      {'\n'}
      )
      {'\n\n'}
      <C.comment>{'# One-shot checkout'}</C.comment>
      {'\n'}
      checkout = cap.<C.method>checkout</C.method>(
      {'\n'}
      {'    '}product_id=results[<C.num>0</C.num>][<C.string>{'"id"'}</C.string>],
      {'\n'}
      {'    '}quantity=<C.num>1</C.num>,
      {'\n'}
      )
      {'\n'}
      <C.method>print</C.method>(checkout[<C.string>{'"checkout_url"'}</C.string>])
    </>
  )
}

function McpSnippet() {
  return (
    <>
      <C.comment>{'// ~/Library/Application Support/Claude/claude_desktop_config.json'}</C.comment>
      {'\n'}
      {'{'}
      {'\n'}
      {'  '}<C.prop>{'"mcpServers"'}</C.prop>: {'{'}
      {'\n'}
      {'    '}<C.prop>{'"cap"'}</C.prop>: {'{'}
      {'\n'}
      {'      '}<C.prop>{'"command"'}</C.prop>: <C.string>{'"npx"'}</C.string>,
      {'\n'}
      {'      '}<C.prop>{'"args"'}</C.prop>: [<C.string>{'"-y"'}</C.string>, <C.string>{'"@cap/mcp-server"'}</C.string>],
      {'\n'}
      {'      '}<C.prop>{'"env"'}</C.prop>: {'{'}
      {'\n'}
      {'        '}<C.prop>{'"CAP_API_KEY"'}</C.prop>: <C.string>{'"cap_live_xxx"'}</C.string>
      {'\n'}
      {'      '}{'}'}
      {'\n'}
      {'    '}{'}'}
      {'\n'}
      {'  '}{'}'}
      {'\n'}
      {'}'}
      {'\n\n'}
      <C.comment>{'// Restart Claude. Try: "find me eco sneakers and start a checkout"'}</C.comment>
    </>
  )
}
