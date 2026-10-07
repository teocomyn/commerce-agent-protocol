# Dashboard authentication and team access

CAP uses signed, HTTP-only dashboard sessions backed by live merchant membership checks. A session is bound to one user, one merchant, and one role. Every protected dashboard page and server mutation verifies that the membership still exists, has not been revoked, and still has the role recorded in the session.

## Access flows

### Shopify owner

The first owner connects through Shopify OAuth. The API callback creates the merchant owner membership, stores the SHA-256 hash of a single-use sign-in token that expires after five minutes, and redirects the browser to `GET /api/session/merchant?token=…` on the dashboard. Owners keep using the Shopify connection flow to enter the dashboard.

Because that redirect is cross-site, the dashboard cannot tell it apart from a login CSRF link planted by an attacker. Sign-in therefore takes an explicit same-origin confirmation:

1. `GET /api/session/merchant` checks the token format and answers `303` to `/session/confirm?token=…`. It never consumes the token or sets a cookie.
2. `/session/confirm` looks the token up without consuming it. An unknown, expired, consumed, or uninstalled token shows a generic "invalid or has expired" message. Otherwise the page asks "Continue as owner of `<shop>.myshopify.com`?".
3. The button sends `POST /api/session/merchant` with the token. The route requires a same-origin `Origin`, consumes the token atomically, verifies the owner membership, sets the session cookie, and returns `{ "redirect": "/dashboard" }`.

### Invited team member

1. The merchant owner opens **Dashboard → Team**.
2. The owner chooses `ADMIN` or `ANALYST` and creates an invitation.
3. CAP displays the invitation URL once. The owner shares it through a trusted private channel.
4. The invitee opens the URL:
   - **New email:** the invitee supplies a name and a password of at least 12 characters, and receives a signed session.
   - **Email that already has a CAP password:** the invitee first signs in at `/login` with that account, then reopens the link and clicks **Accept invitation**. No password is entered on the invitation page.
5. Future sign-ins use the invitee's email, password, and the merchant's canonical `*.myshopify.com` domain at `/login`.

Invitation tokens contain 256 bits of randomness. Only their SHA-256 hashes are stored, they expire after seven days, and acceptance is atomic and single-use. Creating a new invitation for the same email revokes older pending invitations.

Invitation acceptance never verifies a password. An inviter controls the invited email, so a password check there would let anyone who owns a merchant invite a victim's email and guess the victim's password. Instead:

- If the invited email belongs to an account with a password, acceptance requires a valid dashboard session for that same user. Without it the route returns a generic `401` and the invitation stays unused.
- A password is written only when the account is created, or when the existing account still has no password. The account is re-read inside the acceptance transaction, so a concurrent request cannot overwrite a password.
- Acceptance attempts are limited in Redis to 10 per 15 minutes, separately per client IP and per invitation token. Excess attempts get `429` with `Retry-After`.

An existing account with no active membership cannot sign in, so it cannot accept a new invitation on its own yet. That case needs operator help until account recovery exists.

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
- Invitation pages, the owner sign-in confirmation page, and `GET /api/session/merchant` use a no-referrer policy to avoid leaking tokens through navigation headers.
- Uninstalled merchants cannot be used for team login, owner sign-in, or invitation acceptance.

## HTTP security headers

`apps/dashboard/next.config.mjs` sends these headers on every route:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (`no-referrer` on `/invite/*`, `/session/*`, and `/api/session/merchant`) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (production builds only) |

The policy has no `script-src` or `style-src` directive because Next.js relies on inline bootstrap scripts and styles. Blocking framing protects the confirmation and invitation buttons against clickjacking.

## Current operational limitation

CAP does not send invitation or password-reset emails yet. Invitation URLs must be shared manually and securely. A lost team password currently requires trusted operator intervention; re-inviting a known account deliberately does not replace its existing password. Automated email delivery and a secure recovery flow must be completed before broad public beta.

## Required configuration

The dashboard requires:

```dotenv
DASHBOARD_SESSION_SECRET=<output of: openssl rand -hex 32>
DASHBOARD_URL=https://dashboard.example.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

`DASHBOARD_SESSION_SECRET` must contain at least 32 characters. Values containing `change_me` (any case) or starting with `your_`, such as the `.env.example` placeholder, are rejected. The check runs when the server starts (`instrumentation.ts`, Node.js runtime, skipped when `NODE_ENV=test` and during `next build`) and again whenever a session is signed or verified. A missing or placeholder secret therefore stops `next start` and `next dev` at boot. `next build` does not need the secret.

Rotate `DASHBOARD_SESSION_SECRET` only with an explicit sign-out plan: rotation invalidates every active dashboard session.
