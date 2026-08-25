# Dashboard authentication and team access

CAP uses signed, HTTP-only dashboard sessions backed by live merchant membership checks. A session is bound to one user, one merchant, and one role. Every protected dashboard page and server mutation verifies that the membership still exists, has not been revoked, and still has the role recorded in the session.

## Access flows

### Shopify owner

The first owner connects through Shopify OAuth. The callback creates the merchant owner membership and issues the signed dashboard session. Owners keep using the Shopify connection flow to enter the dashboard.

### Invited team member

1. The merchant owner opens **Dashboard → Team**.
2. The owner chooses `ADMIN` or `ANALYST` and creates an invitation.
3. CAP displays the invitation URL once. The owner shares it through a trusted private channel.
4. The invitee opens the URL, supplies a name and a password of at least 12 characters, and receives a signed session.
5. Future sign-ins use the invitee's email, password, and the merchant's canonical `*.myshopify.com` domain at `/login`.

Invitation tokens contain 256 bits of randomness. Only their SHA-256 hashes are stored, they expire after seven days, and acceptance is atomic and single-use. Creating a new invitation for the same email revokes older pending invitations.

## Role matrix

| Capability | Owner | Admin | Analyst |
|---|---:|---:|---:|
| View dashboard data | Yes | Yes | Yes |
| Create and revoke CAP API keys | Yes | Yes | No |
| Invite, change, or revoke team members | Yes | No | No |
| Change or revoke the owner | No | No | No |

Role changes and membership revocations invalidate existing sessions immediately because membership is checked in PostgreSQL on every authenticated server request.

## Security properties

- Passwords are hashed with Node.js `scrypt`, a random per-password salt, and timing-safe verification.
- Login errors do not reveal whether an email, merchant, or password was wrong.
- Login attempts are limited in Redis per IP, email, and merchant domain.
- Session cookies are HTTP-only, `SameSite=Lax`, secure in production, and expire after eight hours.
- Mutating routes enforce same-origin requests and merchant scoping on the server.
- Invitation pages use a no-referrer policy to avoid leaking the token through navigation headers.
- Uninstalled merchants cannot be used for team login or invitation acceptance.

## Current operational limitation

CAP does not send invitation or password-reset emails yet. Invitation URLs must be shared manually and securely. A lost team password currently requires trusted operator intervention; re-inviting a known account deliberately does not replace its existing password. Automated email delivery and a secure recovery flow must be completed before broad public beta.

## Required configuration

The dashboard requires:

```dotenv
DASHBOARD_SESSION_SECRET=<at-least-32-random-characters>
DASHBOARD_URL=https://dashboard.example.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

Rotate `DASHBOARD_SESSION_SECRET` only with an explicit sign-out plan: rotation invalidates every active dashboard session.
