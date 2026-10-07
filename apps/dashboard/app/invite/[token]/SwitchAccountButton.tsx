'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { NETWORK_ERROR_MESSAGE } from '@/lib/response-error'

// /login sends a signed-in browser straight to /dashboard, so a different
// account has to sign out first before it can sign in as the invitee.
export default function SwitchAccountButton() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function switchAccount() {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/session/logout', { method: 'POST' })
        if (!response.ok) {
          setError('Unable to sign out. Try again.')
          return
        }
      } catch {
        setError(NETWORK_ERROR_MESSAGE)
        return
      }
      router.push('/login')
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={switchAccount}
        disabled={isPending}
        style={{ padding: 0, border: 0, background: 'none', color: 'var(--accent)', font: 'inherit', cursor: isPending ? 'wait' : 'pointer' }}
      >
        {isPending ? 'Signing out…' : 'Sign out and use the invited account'}
      </button>
      {error && <span role="alert" style={{ display: 'block', color: 'var(--danger)' }}>{error}</span>}
    </>
  )
}
