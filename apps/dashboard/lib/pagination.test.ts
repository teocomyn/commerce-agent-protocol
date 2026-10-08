import { describe, expect, it } from 'vitest'
import { parsePageParam } from './pagination'

describe('page query parameter', () => {
  it('accepts plain positive integers', () => {
    expect(parsePageParam('1')).toBe(1)
    expect(parsePageParam('7')).toBe(7)
    expect(parsePageParam('0042')).toBe(42)
    expect(parsePageParam('9999999')).toBe(9_999_999)
  })

  it.each([undefined, '', 'abc', '0', '-2', '1.5', '2abc', ' 3', '1e3', '10000000'])(
    'falls back to page 1 for %j',
    (value) => {
      expect(parsePageParam(value)).toBe(1)
    },
  )

  it('falls back to page 1 for repeated parameters', () => {
    expect(parsePageParam(['2', '3'])).toBe(1)
  })
})
