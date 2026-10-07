'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'

export default function ConfirmOwnerSessionForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      let response: Response
      try {
        // The sign-in token travels in an HttpOnly cookie, not in the body.
        response = await fetch('/api/session/merchant', { method: 'POST' })
      } catch {
        setError('Network error. Check your connection and try again.')
        return
      }
      const data = await response.json().catch(() => ({})) as { error?: string; redirect?: string }
      if (!response.ok) {
        setError(data.error ?? 'Unable to sign in')
        return
      }
      router.replace(data.redirect ?? '/dashboard')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <button
        type="submit"
        disabled={isPending}
        style={{ padding: 12, border: 0, borderRadius: 9, background: 'var(--accent)', color: 'white', fontWeight: 700, cursor: isPending ? 'wait' : 'pointer' }}
      >
        {isPending ? 'Signing in…' : 'Continue to dashboard'}
      </button>
    </form>
  )
}
