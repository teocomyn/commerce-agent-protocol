import { Hono } from 'hono'
import { CompareRequestSchema } from '@cap/shared'
import { capJsonValidator } from '../lib/validation.js'
import { sendOutcome } from '../lib/outcome-response.js'
import { compareProducts } from '../services/compare.js'

const compareRouter = new Hono()

// POST /v1/compare
compareRouter.post('/', capJsonValidator(CompareRequestSchema), async (c) =>
  sendOutcome(c, await compareProducts(c.req.valid('json'), { merchantId: c.get('auth').merchantId })))

export { compareRouter }
