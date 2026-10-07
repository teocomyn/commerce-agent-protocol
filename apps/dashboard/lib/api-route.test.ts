import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { clientAddress, isUuid, parseJsonBody } from './api-route'

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
}

const schema = z.object({ label: z.string().trim().max(5).nullish() })

describe('dashboard API route helpers', () => {
  it('recognizes database UUIDs only', () => {
    expect(isUuid('3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a')).toBe(true)
    expect(isUuid('3F2B8C1E-9D4A-4F6B-8A2C-1E5D7F9B0C3A')).toBe(true)
    for (const value of ['', 'abc', '1', '3f2b8c1e9d4a4f6b8a2c1e5d7f9b0c3a', '3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a ']) {
      expect(isUuid(value)).toBe(false)
    }
  })

  it('returns the parsed body when it matches the schema', async () => {
    const result = await parseJsonBody(jsonRequest('{"label":" key "}'), schema, 'Bad label')
    expect(result).toEqual({ ok: true, value: { label: 'key' } })
  })

  it('answers 400 for malformed JSON', async () => {
    const result = await parseJsonBody(jsonRequest('{"label":'), schema, 'Bad label')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    await expect(result.response.json()).resolves.toEqual({ error: 'Request body must be valid JSON' })
  })

  it.each(['null', '[]', '"text"', '{"label":42}', '{"label":"too long"}'])(
    'answers 400 with the route message for body %s',
    async (body) => {
      const result = await parseJsonBody(jsonRequest(body), schema, 'Bad label')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response.status).toBe(400)
      await expect(result.response.json()).resolves.toEqual({ error: 'Bad label' })
    },
  )

  it('takes the client address from the proxy-appended (rightmost) X-Forwarded-For hop', () => {
    // A client can prepend any value; Render's proxy appends the address it saw.
    expect(clientAddress(jsonRequest('{}', { 'x-forwarded-for': ' 198.51.100.9 , 203.0.113.7 ' }))).toBe('203.0.113.7')
    expect(clientAddress(jsonRequest('{}', { 'x-forwarded-for': '' }))).toBe('unknown')
    expect(clientAddress(jsonRequest('{}'))).toBe('unknown')
  })
})
