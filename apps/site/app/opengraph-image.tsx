import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CAP — Commerce Agent Protocol'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #050505 0%, #0A0F1F 100%)',
          color: '#F8FAFC',
          fontFamily: 'sans-serif',
          padding: 80,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at top, rgba(47,107,255,0.4), transparent 60%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 48,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2F6BFF, #38D6FF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              color: '#050505',
            }}
          >
            C
          </div>
          <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>CAP</span>
          <span
            style={{
              fontSize: 16,
              color: '#64748B',
              border: '1px solid #2D3A52',
              borderRadius: 999,
              padding: '4px 12px',
              fontFamily: 'monospace',
            }}
          >
            v0.1
          </span>
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            textAlign: 'center',
            position: 'relative',
            maxWidth: 960,
          }}
        >
          The protocol that lets AI agents actually buy things.
        </div>
        <div
          style={{
            fontSize: 24,
            color: '#94A3B8',
            marginTop: 32,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          Open infrastructure between e-commerce catalogs and shopping agents.
        </div>
      </div>
    ),
    { ...size },
  )
}
