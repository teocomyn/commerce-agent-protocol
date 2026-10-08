import { z, type ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { CheckoutInitiateSchema, CompareRequestSchema, SearchRequestSchema } from '@cap/shared'
import type { CapOutcome } from '../services/outcome.js'
import { detectAgentType, searchCatalog } from '../services/search.js'
import { compareProducts } from '../services/compare.js'
import { IDEMPOTENCY_KEY_PATTERN, initiateCheckout } from '../services/checkout.js'

// The MCP tools take the same arguments as the REST bodies (same zod schemas,
// published as the tool input schemas) and call the same services, so both
// channels share validation, visibility rules, error codes and idempotency.

const CheckoutToolSchema = CheckoutInitiateSchema.extend({
  idempotency_key: z.string().regex(IDEMPOTENCY_KEY_PATTERN).optional()
    .describe('Same role as the Idempotency-Key header: retrying with the same key and arguments returns the first result instead of creating a second cart'),
})

interface ToolDefinition {
  description: string
  schema: ZodTypeAny
  run: (args: never, context: McpToolContext) => Promise<CapOutcome>
}

export interface McpToolContext {
  merchantId: string
  /** Name the MCP client reported when it connected (e.g. "claude-ai"), for analytics. */
  clientName?: string | undefined
}

const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  commerce_search: {
    description:
      'Search the merchant catalog for products the shopper can buy. Returns price, variants, stock, merchant-declared certifications, shipping and return information. Pass agent_query_id from the result as agent_session_id to commerce_checkout.',
    schema: SearchRequestSchema,
    run: async (request: z.output<typeof SearchRequestSchema>, context) => ({
      status: 200,
      body: await searchCatalog(request, {
        merchantId: context.merchantId,
        agentId: `mcp:${context.clientName ?? 'unknown'}`,
        agentType: context.clientName ? detectAgentType(context.clientName) : 'mcp',
      }),
    }),
  },
  commerce_compare: {
    description:
      'Compare 2-10 products from a search side by side on price, certifications, shipping, specs and return policy. Returns a matrix and the winner by price and by number of merchant-declared certifications.',
    schema: CompareRequestSchema,
    run: (request: z.output<typeof CompareRequestSchema>, context) =>
      compareProducts(request, { merchantId: context.merchantId }),
  },
  commerce_checkout: {
    description:
      'Create a checkout for one product and return the checkout_url the shopper opens to pay on the merchant store. The agent never pays: it hands the URL to the shopper.',
    schema: CheckoutToolSchema,
    run: ({ idempotency_key, ...request }: z.output<typeof CheckoutToolSchema>, context) =>
      initiateCheckout(request, { merchantId: context.merchantId, idempotencyKey: idempotency_key }),
  },
}

export const COMMERCE_TOOLS: Tool[] = Object.entries(TOOL_DEFINITIONS).map(([name, definition]) => ({
  name,
  description: definition.description,
  inputSchema: zodToJsonSchema(definition.schema, { $refStrategy: 'none' }) as Tool['inputSchema'],
}))

/**
 * Validates the arguments and runs one tool. Invalid arguments get the same
 * VALIDATION_ERROR body as an invalid REST request.
 */
export async function callCommerceTool(
  name: string,
  args: unknown,
  context: McpToolContext,
): Promise<CapOutcome> {
  const definition = TOOL_DEFINITIONS[name]
  if (!definition) {
    return { status: 404, body: { error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` } } }
  }
  const parsed = definition.schema.safeParse(args ?? {})
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Tool arguments validation failed',
          details: parsed.error.flatten(),
        },
      },
    }
  }
  return definition.run(parsed.data as never, context)
}

/** MCP tool result for a service outcome: the JSON body, flagged as an error from 400 up. */
export function toToolResult(outcome: CapOutcome) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(outcome.body, null, 2) }],
    ...(outcome.status >= 400 && { isError: true }),
  }
}
