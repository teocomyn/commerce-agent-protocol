import { describe, expect, it } from 'vitest'
import {
  LLM_ENRICHMENT_JSON_SCHEMA,
  LlmEnrichmentSchema,
  enrichmentSourceHash,
  normalizeLlmEnrichment,
} from '../lib/enrichment-output.js'

type JsonSchema = {
  type?: unknown
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: unknown
  items?: JsonSchema
  anyOf?: JsonSchema[]
}

// OpenAI strict structured outputs reject any object that is open or has
// optional keys, which would make every enrichment job fail.
function assertStrictCompatible(schema: JsonSchema, path = '$'): void {
  if (schema.properties) {
    expect(schema.additionalProperties, `${path} must be closed`).toBe(false)
    expect([...(schema.required ?? [])].sort(), `${path} must require every key`)
      .toEqual(Object.keys(schema.properties).sort())
    for (const [key, child] of Object.entries(schema.properties)) {
      assertStrictCompatible(child, `${path}.${key}`)
    }
  } else if (schema.type === 'object') {
    throw new Error(`${path} is a free-form object, which strict mode rejects`)
  }
  if (schema.items) assertStrictCompatible(schema.items, `${path}[]`)
  for (const [index, option] of (schema.anyOf ?? []).entries()) {
    assertStrictCompatible(option, `${path}|${index}`)
  }
}

describe('LLM enrichment output', () => {
  it('uses a JSON schema accepted by strict structured outputs', () => {
    expect(LLM_ENRICHMENT_JSON_SCHEMA.type).toBe('object')
    assertStrictCompatible(LLM_ENRICHMENT_JSON_SCHEMA as JsonSchema)
    expect(Object.keys(LLM_ENRICHMENT_JSON_SCHEMA.properties)).not.toContain('certifications')
    expect(Object.keys(LLM_ENRICHMENT_JSON_SCHEMA.properties)).not.toContain('comparison_tags')
  })

  it('drops claim-like model output and keeps the first duplicate spec', () => {
    const output = LlmEnrichmentSchema.parse({
      category: 'Apparel > Tops',
      subcategory: 'T-shirts',
      specs: [
        { name: 'weight_g', value: 180 },
        { name: 'weight_g', value: 999 },
        { name: 'material', value: 'GOTS certified organic cotton' },
        { name: 'eco_label', value: true },
      ],
      use_cases: ['everyday wear', 'eco-friendly gifting'],
      target_audience: ['adults', 'vegan shoppers'],
      care_info: null,
      size_guide: null,
      summary: 'A cotton T-shirt.',
    })
    const normalized = normalizeLlmEnrichment(output)
    expect(normalized.specs).toEqual({ weight_g: 180, eco_label: true })
    expect(normalized.use_cases).toEqual(['everyday wear'])
    expect(normalized.target_audience).toEqual(['adults'])
  })

  it('normalizes array-shaped specs and size guides', () => {
    const output = LlmEnrichmentSchema.parse({
      category: 'Footwear > Sneakers',
      subcategory: 'Sneakers',
      specs: [{ name: 'weight_g', value: 310 }, { name: ' ', value: 'ignored' }],
      use_cases: ['city'],
      target_audience: ['adults'],
      care_info: null,
      size_guide: [{ size: '42', measurements: '27 cm' }],
      summary: 'A leather sneaker.',
    })
    expect(normalizeLlmEnrichment(output)).toEqual({
      category: 'Footwear > Sneakers',
      subcategory: 'Sneakers',
      specs: { weight_g: 310 },
      use_cases: ['city'],
      target_audience: ['adults'],
      size_guide: { '42': '27 cm' },
      summary: 'A leather sneaker.',
    })
  })
})

describe('enrichment source hash', () => {
  const source = {
    title: 'Leather sneaker',
    description: 'White leather.',
    vendor: 'Brand',
    productType: 'Shoes',
    tags: ['white'],
    images: [{ src: 'https://cdn.example/1.jpg', alt: null }],
  }

  it('is stable for identical content and changes with the content', () => {
    expect(enrichmentSourceHash(source)).toBe(enrichmentSourceHash({ ...source }))
    expect(enrichmentSourceHash(source)).not.toBe(enrichmentSourceHash({ ...source, description: 'Black leather.' }))
    expect(enrichmentSourceHash(source)).not.toBe(enrichmentSourceHash({ ...source, tags: ['black'] }))
  })
})
