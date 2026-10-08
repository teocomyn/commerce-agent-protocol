// Build-time guard for NEXT_PUBLIC_API_URL, which is inlined into the client
// bundle: it must be the public https API, never a loopback or unspecified
// address that would send every user's browser to their own machine. The
// WHATWG URL parser normalizes alternate spellings (0x7f.1, 2130706433,
// [::ffff:127.0.0.1], 0) before the host is checked.
const value = process.env.NEXT_PUBLIC_API_URL ?? ''

function localHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (/^127\./.test(host) || host === '0.0.0.0') return true
  // IPv6 loopback, unspecified, and IPv4-mapped loopback/unspecified.
  return host === '::1' || host === '::' || /^::ffff:(7f[0-9a-f]{2}:|0:0$)/.test(host)
}

let url
try {
  url = new URL(value)
} catch {
  console.error(`NEXT_PUBLIC_API_URL must be an absolute https URL, got "${value}"`)
  process.exit(1)
}
if (url.protocol !== 'https:' || localHost(url.hostname)) {
  console.error(`NEXT_PUBLIC_API_URL must be the public https URL of the API, got "${value}"`)
  process.exit(1)
}
