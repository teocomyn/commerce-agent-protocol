import { Hono } from 'hono'
import { CheckoutInitiateSchema } from '@cap/shared'
import { capJsonValidator } from '../lib/validation.js'
import { sendOutcome } from '../lib/outcome-response.js'
import { initiateCheckout } from '../services/checkout.js'

const checkoutRouter = new Hono()

// POST /v1/checkout/initiate
checkoutRouter.post('/initiate', capJsonValidator(CheckoutInitiateSchema), async (c) =>
  sendOutcome(c, await initiateCheckout(c.req.valid('json'), {
    merchantId: c.get('auth').merchantId,
    idempotencyKey: c.req.header('Idempotency-Key'),
  })))

export { checkoutRouter }
