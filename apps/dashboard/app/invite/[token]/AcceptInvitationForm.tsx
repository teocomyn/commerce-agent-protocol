'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'

const inputStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14,
}

const submitStyle = (isPending: boolean) => ({
  padding: 12, border: 0, borderRadius: 9, background: 'var(--accent)', color: 'white',
  fontWeight: 700, cursor: isPending ? 'wait' : 'pointer',
})

export default function AcceptInvitationForm({
  token,
  signedInAsInvitee,
}: {
  token: string
  signedInAsInvitee: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function accept(payload: { token: string; name?: string; password?: string }) {
    setError(null)
    startTransition(async () => {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({})) as { error?: string; redirect?: string }
      if (!response.ok) {
        setError(data.error ?? 'Unable to accept this invitation')
        return
      }
      router.replace(data.redirect ?? '/dashboard')
      router.refresh()
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signedInAsInvitee) {
      accept({ token })
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match')
      return
    }
    accept({ token, name, password })
  }

  if (signedInAsInvitee) {
    return (
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={isPending} style={submitStyle(isPending)}>
          {isPending ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Full name
        <input style={inputStyle} type="text" autoComplete="name" required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Password
        <input style={inputStyle} type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>12 characters minimum.</span>
      </label>
      <label style={{ display: 'grid', gap: 7, fontSize: 13 }}>
        Confirm password
        <input style={inputStyle} type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <button type="submit" disabled={isPending} style={submitStyle(isPending)}>
        {isPending ? 'Creating account…' : 'Accept invitation'}
      </button>
    </form>
  )
}
