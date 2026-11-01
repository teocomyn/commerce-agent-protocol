import { zValidator } from '@hono/zod-validator'
import { z, type ZodType } from 'zod'

export function capJsonValidator<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body validation failed',
          details: z.flattenError(result.error),
        },
      }, 400)
    }
  })
}
