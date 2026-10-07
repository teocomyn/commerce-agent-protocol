import crypto from 'node:crypto'
import { z } from 'zod'
import { EnrichmentOutputSchema, type EnrichmentOutput } from '@cap/shared'

// Bump whenever the prompt, the model or the output schema changes, so every
// product is enriched again on its next sync.
export const ENRICHMENT_VERSION = '2026-10-07'

export interface EnrichmentSource {
  title: string
  description: string
  vendor: string
  productType: string
  tags: string[]
  images: Array<{ src: string; alt: string | null }>
}

/**
 * Fingerprint of everything the LLM and the embedding see. Price, stock,
 * policy and metafield changes do not alter it, so they are applied without
 * paying for a new enrichment.
 */
export function enrichmentSourceHash(source: EnrichmentSource): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    version: ENRICHMENT_VERSION,
    title: source.title,
    description: source.description.slice(0, 1500),
    vendor: source.vendor,
    productType: source.productType,
    tags: source.tags,
    images: source.images.slice(0, 3).map((image) => [image.src, image.alt]),
  })).digest('hex')
}

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
