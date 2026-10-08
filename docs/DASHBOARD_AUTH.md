# Dashboard authentication and team access

CAP uses signed, HTTP-only dashboard sessions backed by live merchant membership checks. A session is bound to one user, one merchant, and one role. Every protected dashboard page and server mutation verifies that the membership still exists, has not been revoked, still has the role recorded in the session, and has not been modified since the session was issued.

## Access flows

### Shopify owner

The first owner connects through Shopify OAuth. The API callback creates the merchant owner membership, stores the SHA-256 hash of a single-use sign-in token that expires after five minutes, and redirects the browser to `GET /api/session/merchant?token=…` on the dashboard. Owners keep using the Shopify connection flow to enter the dashboard.

Because that redirect is cross-site, the dashboard cannot tell it apart from a login CSRF link planted by an attacker. Sign-in therefore takes an explicit same-origin confirmation:

1. `GET /api/session/merchant` checks the token format, moves the token into a five-minute HttpOnly `cap_owner_login` cookie, and answers `303` to `/session/confirm`. It never consumes the token or creates a session, and the token does not stay in the confirmation URL or the browser history.
2. `/session/confirm` reads the cookie and looks the token up without consuming it. An unknown, expired, consumed, or uninstalled token shows a generic "invalid or has expired" message. Otherwise the page asks "Continue as owner of `<shop>.myshopify.com`?".
3. The button sends `POST /api/session/merchant`. The route requires a same-origin `Origin`, reads the token from the cookie, verifies that the user still has an active membership of that merchant, consumes the token atomically, sets the session cookie with the member's current role, clears the handoff cookie, and returns `{ "authenticated": true, "redirect": "/dashboard" }`.

### Invited team member

1. The merchant owner opens **Dashboard → Team**.
2. The owner chooses `ADMIN` or `ANALYST` and creates an invitation.
3. CAP displays the invitation URL once. The owner shares it through a trusted private channel.
4. The invitee opens the URL:
   - **New email:** the invitee supplies a name and a password of 12 to 256 characters, and receives a signed session.
   - **Email that already has a CAP password:** the invitee first signs in at `/login` with that account, then reopens the link and clicks **Accept invitation**. No password is entered on the invitation page. A browser signed in with a different account is offered a sign-out first, because `/login` sends signed-in browsers straight to the dashboard.
5. Future sign-ins use the invitee's email, password, and the merchant's canonical `*.myshopify.com` domain at `/login`.

Invitation tokens contain 256 bits of randomness. Only their SHA-256 hashes are stored, they expire after seven days, and acceptance is atomic and single-use. Creating a new invitation for the same email revokes older pending invitations.

Invitation acceptance never verifies a password. An inviter controls the invited email, so a password check there would let anyone who owns a merchant invite a victim's email and guess the victim's password. Instead:

- If the invited email belongs to an account with a password, acceptance requires a valid dashboard session for that same user. Without it the route returns a generic `401` and the invitation stays unused.
- A password is written only when the account is created, or when the existing account still has no password. The account is re-read inside the acceptance transaction, so a concurrent request cannot overwrite a password.
- Acceptance attempts are limited in Redis to 10 per 15 minutes per invitation token, plus a loose ceiling of 100 per 15 minutes per client address so colleagues behind one office NAT can each accept their own invitation. The client address is the rightmost `X-Forwarded-For` entry, the one appended by Render's proxy. Excess attempts get `429` with `Retry-After`.

An existing account that has a password but no active membership cannot sign in, so it cannot accept a new invitation on its own yet; that case needs operator help until email-based account recovery exists. An existing account without a password accepts normally by choosing its first password.

## Role matrix

| Capability | Owner | Admin | Analyst |
|---|---:|---:|---:|
| View dashboard data | Yes | Yes | Yes |
| Create and revoke CAP API keys | Yes | Yes | No |
| Invite, change, or revoke team members | Yes | No | No |
| Change or revoke the owner | No | No | No |

Role changes and membership revocations invalidate existing sessions immediately because membership is checked in PostgreSQL on every authenticated server request.

## Session revocation

Each session payload carries `mv`, the membership version: `merchant_members.session_version` when the session was issued. On every authenticated request the dashboard reloads the membership and rejects the session when the membership is revoked, its role differs, or its `session_version` no longer equals `mv` (`isSessionMembershipCurrent` in `apps/dashboard/lib/dashboard-session.ts`). The counter is incremented atomically, so unlike a timestamp it cannot repeat across clocks or fast writes.

These changes increment it and sign out every session issued before them for that member and merchant, including on other devices:

- an owner changes the member's role or revokes the member;
- a revoked member is invited again and accepts;
- an owner who was revoked or demoted is reinstated by a Shopify reinstall, and uninstalling revokes every membership.

A routine Shopify OAuth re-authorization of an active owner (for example after a scope change) does not touch the membership, so it does not sign the owner out.

Cookies issued before membership versioning carry no `mv` and are rejected. After this change is deployed every signed-in user must sign in once more: team members at `/login`, owners through the Shopify connection flow.

## Security properties

- Passwords are hashed with Node.js `scrypt` (N=2^15, r=8, p=1, `maxmem` 64 MiB), a random 16-byte salt and a 64-byte key, and verified in constant time. The stored format records its parameters: `scrypt$N=32768,r=8,p=1$<salt base64>$<key base64>`.
- Hashes in the earlier format (`scrypt$<hex salt>$<hex key>`, Node's default N=16384 and a 32-byte key) still verify. A successful sign-in with such a hash, or with weaker parameters than the current ones, re-hashes the password in the current format (rehash-on-login). The update only applies if the stored hash is unchanged, and a failed upgrade never blocks the sign-in.
- Passwords must contain 12 to 256 characters. The login route rejects longer passwords with `400` before any hashing work.
- Login errors do not reveal whether an email, merchant, or password was wrong. Unknown accounts are checked against a dummy hash in the current format, so they take as long as accounts whose hash is current.
- Login attempts are limited in Redis over 15-minute windows in two independent buckets, and an attempt is rejected with `429` and `Retry-After` (the longer of the two waits) when either is exhausted:
  - **per account:** 10 attempts per email and merchant domain (`sha256(email:shop)`), whatever the client address. A successful sign-in resets only this bucket;
  - **per client address:** 50 attempts across all accounts. The address is the rightmost `X-Forwarded-For` entry, the one appended by Render's proxy (clients can only prepend values). The per-account bucket does not depend on it.

  The per-account limit also means repeated failures, including someone else's guesses, can lock an account out of password sign-in for up to 15 minutes.
- Session cookies are HTTP-only, `SameSite=Lax`, secure in production, and expire after eight hours.
- Mutating routes enforce same-origin requests (full origin: scheme, host and port, against `DASHBOARD_URL` in production) and merchant scoping on the server.
- Invitation pages, the owner sign-in confirmation page, and `GET /api/session/merchant` use a no-referrer policy to avoid leaking tokens through navigation headers.
- `DASHBOARD_SESSION_SECRET` must be at least 32 characters with at least 12 distinct characters; example and trivially patterned values are rejected at boot.
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
