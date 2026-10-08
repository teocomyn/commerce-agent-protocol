import { Hono } from 'hono'
import { SearchRequestSchema } from '@cap/shared'
import { capJsonValidator } from '../lib/validation.js'
import { detectAgentType, searchCatalog } from '../services/search.js'

const searchRouter = new Hono()

// POST /v1/search
searchRouter.post('/', capJsonValidator(SearchRequestSchema), async (c) => {
  const auth = c.get('auth')
  return c.json(await searchCatalog(c.req.valid('json'), {
    merchantId: auth.merchantId,
    agentId: c.req.header('X-Agent-ID') ?? auth.apiKeyId,
    agentType: detectAgentType(c.req.header('User-Agent') ?? ''),
  }))
})

export { searchRouter }
