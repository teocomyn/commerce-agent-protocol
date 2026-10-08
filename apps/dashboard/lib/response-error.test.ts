import { describe, expect, it } from 'vitest'
import { responseErrorMessage } from './response-error'

describe('dashboard API error messages', () => {
  it('returns the server error message', async () => {
    const response = Response.json({ error: 'Owner role required' }, { status: 403 })
    await expect(responseErrorMessage(response, 'fallback')).resolves.toBe('Owner role required')
  })

  it.each([
    ['a non-JSON body', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['a body without error', Response.json({ ok: false }, { status: 500 })],
    ['a non-string error', Response.json({ error: { code: 'X' } }, { status: 500 })],
    ['a blank error', Response.json({ error: '  ' }, { status: 500 })],
    ['a JSON null body', Response.json(null, { status: 500 })],
  ])('falls back for %s', async (_, response) => {
    await expect(responseErrorMessage(response, 'fallback')).resolves.toBe('fallback')
  })
})
