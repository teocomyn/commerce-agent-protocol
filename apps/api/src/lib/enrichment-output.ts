import crypto from 'node:crypto'
import { z } from 'zod'
import { EnrichmentOutputSchema, type EnrichmentOutput } from '@cap/shared'

// Bump whenever the prompt, the model, the output schema or its normalization
// changes, so every product is enriched again on its next sync.
export const ENRICHMENT_VERSION = '2026-10-08.2'

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
    // Same text the prompt receives: a CDN URL change with an unchanged alt
    // text must not trigger a new (paid) enrichment.
    images: source.images.slice(0, 3).map((image) => image.alt ?? image.src),
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

// Shopper-visible fields must not carry certification, label or environmental
// claims: those come only from merchant metafields. Anything the model emits
// that looks like one is dropped, whatever the prompt said.
const CLAIM_PATTERN = /\b(certifi\w*|label(?:s|l?ed)?|award\w*|eco[- ]?friendly|eco[- ]?responsible|sustainab\w*|carbon[- ]?(neutral|negative|free)|climate[- ]?(neutral|positive)|biodegradable|compostable|organic|fair[- ]?trade|b[- ]?corp|gots|oeko[- ]?tex|vegan|cruelty[- ]?free)\b/i

// Spec names are often snake_case (`eco_label`): separators count as word
// boundaries so they are matched like plain words.
export function isClaimLike(value: string | number | boolean): boolean {
  return typeof value === 'string' && CLAIM_PATTERN.test(value.replace(/[_-]+/g, ' '))
}

// Free text keeps its other sentences: only the ones carrying a claim go.
function withoutClaimSentences(text: string): string {
  return text.split(/(?<=[.!?;])\s+/).filter((sentence) => !isClaimLike(sentence)).join(' ').trim()
}

// Object.fromEntries keeps the last duplicate; the first occurrence wins here
// so a repeated name cannot silently replace an earlier, usually better, value.
function firstEntries<V>(entries: Array<readonly [string, V]>): Record<string, V> {
  const result: Record<string, V> = {}
  for (const [key, value] of entries) {
    if (key.length > 0 && !Object.hasOwn(result, key)) result[key] = value
  }
  return result
}

export function normalizeLlmEnrichment(output: z.infer<typeof LlmEnrichmentSchema>): EnrichmentOutput {
  const specs = firstEntries(output.specs
    .filter((spec) => !isClaimLike(spec.name) && !isClaimLike(spec.value))
    .map((spec) => [spec.name.trim(), spec.value] as const))
  const careInfo = output.care_info ? withoutClaimSentences(output.care_info) : ''
  const sizeGuide = output.size_guide && output.size_guide.length > 0
    ? firstEntries(output.size_guide.map((row) => [row.size.trim(), row.measurements] as const))
    : undefined
  return EnrichmentOutputSchema.parse({
    category: output.category,
    subcategory: output.subcategory,
    specs,
    use_cases: output.use_cases.filter((useCase) => !isClaimLike(useCase)),
    target_audience: output.target_audience.filter((audience) => !isClaimLike(audience)),
    ...(careInfo && { care_info: careInfo }),
    ...(sizeGuide && { size_guide: sizeGuide }),
    // The summary feeds the embedding: a claim in it would still let agents
    // match products on certifications the merchant never declared.
    summary: withoutClaimSentences(output.summary),
  })
}
