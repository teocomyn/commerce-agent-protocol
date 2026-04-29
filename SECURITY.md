# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in CAP, please **do not open a public GitHub issue**. Instead, email:

**security@cap-protocol.org**

You can expect:

- An acknowledgement within **48 hours**
- An initial assessment within **5 business days**
- A coordinated disclosure timeline once the impact is understood

If you'd like to encrypt your report, request our PGP key in your first message.

## In scope

- Authentication / authorization flaws (API key bypass, cross-tenant data leak)
- Cryptography misuse (token storage, HMAC verification, OAuth state)
- SQL injection, SSRF, RCE, deserialization flaws
- Vulnerabilities in the reference implementation under [`apps/`](./apps) and [`packages/`](./packages)

## Out of scope

- Denial of service via brute force on rate-limited endpoints
- Vulnerabilities in third-party dependencies that have a published CVE and pending upstream fix (please report upstream)
- Self-XSS, clickjacking on pages without sensitive actions
- Social-engineering attacks against contributors

## Supported versions

CAP is in alpha. Only the `main` branch is supported. Once we ship `v1.0`, we'll publish a versioned support matrix here.

## Hall of fame

Researchers who report valid vulnerabilities and follow responsible disclosure will be credited in our release notes (with their consent).
