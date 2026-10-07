import { z } from 'zod'
import { EnrichmentOutputSchema, type EnrichmentOutput } from '@cap/shared'

// Strict structured outputs require every key to be required and every object
// to be closed, so free-form maps are requested as arrays and normalized below.
export const LlmEnrichmentSchema = z.object({
  category: z.string(),
  subcategory: z.string(),
  specs: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })),
  use_cases: z.array(z.string()),
  target_audience: z.array(z.string()),
  care_info: z.string().nullable(),
  size_guide: z.array(z.object({ size: z.string(), measurements: z.string() })).nullable(),
  summary: z.string(),
})

export const LLM_ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    subcategory: { type: 'string' },
    specs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
        },
        required: ['name', 'value'],
        additionalProperties: false,
      },
    },
    use_cases: { type: 'array', items: { type: 'string' } },
    target_audience: { type: 'array', items: { type: 'string' } },
    care_info: { type: ['string', 'null'] },
    size_guide: {
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object',
            properties: { size: { type: 'string' }, measurements: { type: 'string' } },
            required: ['size', 'measurements'],
            additionalProperties: false,
          },
        },
        { type: 'null' },
      ],
    },
    summary: { type: 'string' },
  },
  required: [
    'category', 'subcategory', 'specs', 'use_cases', 'target_audience',
    'care_info', 'size_guide', 'summary',
  ],
  additionalProperties: false,
}

export function normalizeLlmEnrichment(output: z.infer<typeof LlmEnrichmentSchema>): EnrichmentOutput {
  const specs = Object.fromEntries(output.specs
    .map((spec) => [spec.name.trim(), spec.value] as const)
    .filter(([name]) => name.length > 0))
  const sizeGuide = output.size_guide && output.size_guide.length > 0
    ? Object.fromEntries(output.size_guide.map((row) => [row.size, row.measurements]))
    : undefined
  return EnrichmentOutputSchema.parse({
    category: output.category,
    subcategory: output.subcategory,
    specs,
    use_cases: output.use_cases,
    target_audience: output.target_audience,
    ...(output.care_info && { care_info: output.care_info }),
    ...(sizeGuide && { size_guide: sizeGuide }),
    summary: output.summary,
  })
}
