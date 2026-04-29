'use client'

import { useState, useTransition } from 'react'

interface ApiKey {
  id: string
  prefix: string
  label?: string | null
  lastUsedAt: string | null
  createdAt: string
}

interface ApiKeysClientProps {
  keys: ApiKey[]
}

export default function ApiKeysClient({ keys }: ApiKeysClientProps) {
  const [apiKeys, setApiKeys] = useState(keys)
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [isPending, startTransition] = useTransition()

  function createKey() {
    startTransition(async () => {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json() as { key?: string; id?: string; prefix?: string; label?: string | null; createdAt?: string }
      if (data.key) {
        setNewKeyValue(data.key)
        setApiKeys(prev => [
          { id: data.id!, prefix: data.prefix!, label: data.label ?? null, lastUsedAt: null, createdAt: data.createdAt! },
          ...prev,
        ])
        setLabel('')
      }
    })
  }

  function revokeKey(id: string) {
    startTransition(async () => {
      await fetch(`/api/keys/${id}`, { method: 'DELETE' })
      setApiKeys(prev => prev.filter(k => k.id !== id))
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>API Keys</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 14 }}>
          Use these keys to authenticate requests to the CAP Agent API
        </p>
      </div>

      {/* Usage info */}
      <div className="glass" style={{ padding: 16, borderRadius: 12, marginBottom: 24, background: 'var(--accent-muted)', border: '1px solid rgba(108,99,255,0.2)' }}>
        <code style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
          curl -X POST https://api.commerceagent.io/v1/search \<br />
          &nbsp;&nbsp;-H "X-CAP-Key: cap_live_your_key_here" \<br />
          &nbsp;&nbsp;-d '{'{"query": "white sneakers", "filters": {"price_max": 120}}'}'
        </code>
      </div>

      {/* Create new key */}
      <div className="glass" style={{ padding: 24, borderRadius: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Create New Key</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Key label (e.g. Claude Plugin, Test)"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
          />
          <button
            onClick={createKey}
            disabled={isPending}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
              color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creating…' : '+ Create Key'}
          </button>
        </div>

        {/* Show newly created key */}
        {newKeyValue && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 8 }}>
              ✅ Key created — copy it now, it won&apos;t be shown again!
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {newKeyValue}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(newKeyValue)}
                style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keys list */}
      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{apiKeys.length} Active Key{apiKeys.length !== 1 ? 's' : ''}</h2>
        </div>

        {apiKeys.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            No API keys yet. Create one above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                {['Key', 'Label', 'Last Used', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key, i) => (
                <tr key={key.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {key.prefix}••••••••
                    </code>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13 }}>{key.label ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => revokeKey(key.id)}
                      style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
