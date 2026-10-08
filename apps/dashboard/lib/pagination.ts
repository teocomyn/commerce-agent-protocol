// Seven digits keep the row offset (page * page size) far inside Postgres and
// Prisma integer limits; anything longer cannot be a real page anyway.
const PAGE_PATTERN = /^\d{1,7}$/

/**
 * Parses a 1-based `?page=` query value. Anything that is not a plain positive
 * integer (missing, `abc`, `0`, `-2`, `1.5`, repeated) falls back to page 1.
 */
export function parsePageParam(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !PAGE_PATTERN.test(value)) return 1
  return Math.max(1, Number(value))
}
