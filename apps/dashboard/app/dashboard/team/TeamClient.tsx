'use client'

import { type FormEvent, useCallback, useEffect, useState, useTransition } from 'react'
import { NETWORK_ERROR_MESSAGE, responseErrorMessage } from '@/lib/response-error'

type Role = 'OWNER' | 'ADMIN' | 'ANALYST'

interface Member {
  id: string
  userId: string
  name: string | null
  email: string | null
  role: Role
  revokedAt: string | null
  isCurrentUser: boolean
}

interface Invitation {
  id: string
  email: string
  role: Role
  expiresAt: string
  createdAt: string
}

interface TeamData {
  members: Member[]
  invitations: Invitation[]
  canManage: boolean
}

const buttonStyle = {
  padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
}

export default function TeamClient({ role }: { role: Role | null }) {
  const [data, setData] = useState<TeamData | null>(null)
  // Team management is owner-only. This only hides controls; the API routes
  // enforce the same rule. The server-rendered role is used until /api/team
  // answers, then every reload follows the current membership.
  const canManage = data ? data.canManage : role === 'OWNER'
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'ANALYST'>('ANALYST')
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadTeam = useCallback(async () => {
    try {
      const response = await fetch('/api/team', { cache: 'no-store' })
      if (!response.ok) {
        setError(await responseErrorMessage(response, 'Unable to load the team'))
        return
      }
      setData(await response.json() as TeamData)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
    }
  }, [])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  async function mutation(url: string, method: 'PATCH' | 'DELETE', body?: object) {
    setError(null)
    let response: Response
    try {
      response = await fetch(url, body
        ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : { method })
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
      return false
    }
    if (!response.ok) {
      setError(await responseErrorMessage(response, 'The operation failed'))
      return false
    }
    await loadTeam()
    return true
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInvitationUrl(null)
    startTransition(async () => {
      let response: Response
      try {
        response = await fetch('/api/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: inviteRole }),
        })
      } catch {
        setError(NETWORK_ERROR_MESSAGE)
        return
      }
      if (!response.ok) {
        setError(await responseErrorMessage(response, 'Unable to create the invitation'))
        return
      }
      const result = await response.json().catch(() => ({})) as { invitationUrl?: string }
      setInvitationUrl(result.invitationUrl ?? null)
      setEmail('')
      await loadTeam()
    })
  }

  function runMutation(url: string, method: 'PATCH' | 'DELETE', body?: object) {
    startTransition(async () => {
      await mutation(url, method, body)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>Team</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 14 }}>
          Invite people and control who can administer this merchant.
        </p>
      </div>

      {canManage && (
        <div className="glass" style={{ padding: 24, borderRadius: 16, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 16px' }}>Invite a team member</h2>
          <form onSubmit={invite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@company.com"
              style={{ flex: '1 1 260px', padding: '10px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as 'ADMIN' | 'ANALYST')}
              style={{ padding: '10px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              <option value="ANALYST">Analyst</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button type="submit" disabled={isPending} style={{ padding: '10px 18px', border: 0, borderRadius: 8, background: 'var(--accent)', color: 'white', fontWeight: 700, cursor: isPending ? 'wait' : 'pointer' }}>
              Create invitation
            </button>
          </form>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '12px 0 0' }}>
            Admins can manage API keys. Analysts have read-only dashboard access. Only the owner can manage the team.
          </p>
          {invitationUrl && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 9, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <strong style={{ display: 'block', color: 'var(--success)', fontSize: 12, marginBottom: 8 }}>
                Invitation created — share this private link. It expires in 7 days.
              </strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={invitationUrl} style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12 }} />
                <button type="button" onClick={() => navigator.clipboard.writeText(invitationUrl)} style={buttonStyle}>Copy</button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
          Members ({data?.members.length ?? 0})
        </div>
        {!data ? (
          <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>Loading team…</div>
        ) : data.members.map((member) => (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 20px', borderTop: '1px solid var(--border)', opacity: member.revokedAt ? 0.5 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{member.name ?? member.email ?? 'Shopify owner'} {member.isCurrentUser && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>(you)</span>}</div>
              {member.email && member.name && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>{member.email}</div>}
            </div>
            {canManage && member.role !== 'OWNER' && !member.isCurrentUser && !member.revokedAt ? (
              <select
                value={member.role}
                disabled={isPending}
                onChange={(event) => runMutation(`/api/team/${member.id}`, 'PATCH', { role: event.target.value })}
                style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12 }}
              >
                <option value="ADMIN">Admin</option>
                <option value="ANALYST">Analyst</option>
              </select>
            ) : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{member.role.toLowerCase()}</span>}
            {canManage && member.role !== 'OWNER' && !member.isCurrentUser && !member.revokedAt && (
              <button type="button" disabled={isPending} onClick={() => runMutation(`/api/team/${member.id}`, 'DELETE')} style={{ ...buttonStyle, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>Revoke</button>
            )}
            {member.revokedAt && <span style={{ color: 'var(--danger)', fontSize: 11 }}>revoked</span>}
          </div>
        ))}
      </div>

      {data && data.invitations.length > 0 && (
        <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Pending invitations ({data.invitations.length})
          </div>
          {data.invitations.map((invitation) => (
            <div key={invitation.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{invitation.email}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</div>
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{invitation.role.toLowerCase()}</span>
              {canManage && <button type="button" disabled={isPending} onClick={() => runMutation(`/api/team/invitations/${invitation.id}`, 'DELETE')} style={{ ...buttonStyle, color: 'var(--danger)' }}>Cancel</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
