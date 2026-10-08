'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'
import { NETWORK_ERROR_MESSAGE, responseErrorMessage } from '@/lib/response-error'

const inputStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14,
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shop, setShop] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      let response: Response
      try {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, shop }),
        })
      } catch {
        setError(NETWORK_ERROR_MESSAGE)
        return
      }
      if (!response.ok) {
        setError(await responseErrorMessage(response, 'Unable to sign in'))
        return
      }
      const data = await response.json().catch(() => ({})) as { redirect?: string }
      router.replace(data.redirect ?? '/dashboard')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Email
        <input style={inputStyle} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Shopify domain
        <input style={inputStyle} type="text" autoComplete="organization" placeholder="your-store.myshopify.com" required value={shop} onChange={(event) => setShop(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Password
        <input style={inputStyle} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <button
        type="submit"
        disabled={isPending}
        style={{ padding: 12, border: 0, borderRadius: 9, background: 'var(--accent)', color: 'white', fontWeight: 700, cursor: isPending ? 'wait' : 'pointer' }}
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
