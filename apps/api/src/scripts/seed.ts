/**
 * Seed script — populates the local DB with a demo merchant, 8 realistic
 * eco-friendly products (with REAL OpenAI embeddings), and a test CAP API key
 * so you can smoke-test /v1/search, /v1/compare and /v1/checkout end-to-end.
 *
 * Usage:
 *   pnpm --filter=@cap/api seed
 *   # or:
 *   pnpm --filter=@cap/api exec tsx --env-file=../../.env src/scripts/seed.ts
 */

import crypto from 'node:crypto'
import OpenAI from 'openai'
import { prisma } from '@cap/db'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface SeedProduct {
  shopifyId: bigint
  title: string
  description: string
  vendor: string
  productType: string
  tags: string[]
  variants: Array<{
    id: number
    title: string
    price: string
    sku: string
    inventory_quantity: number
    option1: string
  }>
  images: Array<{ src: string; alt: string }>
  category: string
  subcategory: string
  specs: Record<string, string | number | boolean>
  useCases: string[]
  targetAudience: string[]
  certifications: string[]
  comparisonTags: string[]
  shippingInfo: { free: boolean; estimate: string }
  returnPolicy: { days: number }
  summary: string
}

const DEMO_DOMAIN = 'cap-demo.myshopify.com'

const PRODUCTS: SeedProduct[] = [
  {
    shopifyId: 1001n,
    title: 'Sneakers VEJA Campo Chromefree White',
    description: 'Sneakers blanches en cuir tanné sans chrome, semelle en caoutchouc Amazonien sauvage.',
    vendor: 'VEJA',
    productType: 'Sneakers',
    tags: ['sneakers', 'eco', 'vegan-friendly', 'leather', 'minimalist'],
    variants: [
      { id: 90001, title: '41', price: '110.00', sku: 'CMP-W-41', inventory_quantity: 5, option1: '41' },
      { id: 90002, title: '42', price: '110.00', sku: 'CMP-W-42', inventory_quantity: 3, option1: '42' },
      { id: 90003, title: '43', price: '110.00', sku: 'CMP-W-43', inventory_quantity: 0, option1: '43' },
    ],
    images: [{ src: 'https://demo.cap/img/veja-campo-white-1.jpg', alt: 'Sneakers Veja Campo blanches' }],
    category: 'Footwear',
    subcategory: 'Sneakers',
    specs: { upper_material: 'leather (chrome-free)', sole: 'wild rubber', weight_g: 360, color: 'white' },
    useCases: ['everyday', 'casual', 'minimalist outfit'],
    targetAudience: ['men', 'eco-conscious'],
    certifications: ['B-Corp', 'OEKO-TEX'],
    comparisonTags: ['Veja Esplar', 'Common Projects Achilles', 'Adidas Stan Smith'],
    shippingInfo: { free: true, estimate: '2-4 business days' },
    returnPolicy: { days: 30 },
    summary: 'Sneakers blanches éco-responsables en cuir sans chrome avec semelle en caoutchouc sauvage.',
  },
  {
    shopifyId: 1002n,
    title: 'Allbirds Wool Runners Charcoal',
    description: 'Sneakers en laine mérinos, légères et respirantes, parfaites pour le quotidien.',
    vendor: 'Allbirds',
    productType: 'Sneakers',
    tags: ['sneakers', 'wool', 'eco', 'comfortable'],
    variants: [
      { id: 90011, title: '42', price: '120.00', sku: 'AWR-CH-42', inventory_quantity: 8, option1: '42' },
      { id: 90012, title: '43', price: '120.00', sku: 'AWR-CH-43', inventory_quantity: 4, option1: '43' },
    ],
    images: [{ src: 'https://demo.cap/img/allbirds-wool-runners-charcoal.jpg', alt: 'Allbirds Wool Runners' }],
    category: 'Footwear',
    subcategory: 'Sneakers',
    specs: { upper_material: 'merino wool', sole: 'sugarcane EVA', weight_g: 300, color: 'charcoal' },
    useCases: ['everyday', 'travel', 'office'],
    targetAudience: ['men', 'women', 'eco-conscious'],
    certifications: ['B-Corp', 'ZQ Merino'],
    comparisonTags: ['Veja Campo', 'Rothy\'s', 'Adidas Ultraboost'],
    shippingInfo: { free: true, estimate: '3-5 business days' },
    returnPolicy: { days: 30 },
    summary: 'Sneakers ultra-confortables en laine mérinos certifiée pour le quotidien.',
  },
  {
    shopifyId: 1003n,
    title: 'T-shirt blanc en coton bio Patagonia',
    description: 'T-shirt unisexe en coton biologique GOTS, coupe regular, fabriqué en Inde.',
    vendor: 'Patagonia',
    productType: 'T-shirt',
    tags: ['tshirt', 'organic-cotton', 'fair-trade', 'unisex'],
    variants: [
      { id: 90021, title: 'M', price: '45.00', sku: 'PAT-WHT-M', inventory_quantity: 12, option1: 'M' },
      { id: 90022, title: 'L', price: '45.00', sku: 'PAT-WHT-L', inventory_quantity: 7, option1: 'L' },
    ],
    images: [{ src: 'https://demo.cap/img/patagonia-tshirt-white.jpg', alt: 'T-shirt blanc Patagonia' }],
    category: 'Apparel',
    subcategory: 'T-shirts',
    specs: { material: 'organic cotton', weight_gsm: 180, color: 'white', fit: 'regular' },
    useCases: ['everyday', 'layering', 'activewear'],
    targetAudience: ['men', 'women', 'unisex'],
    certifications: ['GOTS', 'Fair Trade Certified', 'B-Corp'],
    comparisonTags: ['Everlane Heavyweight', 'Colorful Standard'],
    shippingInfo: { free: true, estimate: '2-3 business days' },
    returnPolicy: { days: 60 },
    summary: 'T-shirt classique en coton bio certifié, coupe regular, durable et confortable.',
  },
  {
    shopifyId: 1004n,
    title: 'Sac à dos en chanvre HempActive 22L',
    description: 'Sac à dos minimaliste en chanvre brut résistant, doublure en coton recyclé, 22 litres.',
    vendor: 'HempActive',
    productType: 'Backpack',
    tags: ['backpack', 'hemp', 'minimalist', 'commute'],
    variants: [
      { id: 90031, title: '22L', price: '95.00', sku: 'HA-BP-22', inventory_quantity: 15, option1: 'Standard' },
    ],
    images: [{ src: 'https://demo.cap/img/hempactive-backpack.jpg', alt: 'Sac à dos en chanvre' }],
    category: 'Accessories',
    subcategory: 'Backpacks',
    specs: { material: 'hemp', capacity_l: 22, weight_g: 800, color: 'natural' },
    useCases: ['commute', 'travel', 'laptop carry'],
    targetAudience: ['men', 'women', 'students', 'commuters'],
    certifications: ['OEKO-TEX', 'PETA Vegan'],
    comparisonTags: ['Fjällräven Kanken', 'Patagonia Black Hole 25L'],
    shippingInfo: { free: false, estimate: '4-6 business days' },
    returnPolicy: { days: 30 },
    summary: 'Sac à dos minimaliste en chanvre durable, idéal pour le commute urbain.',
  },
  {
    shopifyId: 1005n,
    title: 'Chaussettes bambou Bombas (lot de 4)',
    description: 'Chaussettes en viscose de bambou ultra-douces et anti-bactériennes, lot de 4 paires.',
    vendor: 'Bombas',
    productType: 'Socks',
    tags: ['socks', 'bamboo', 'anti-bacterial', 'gift'],
    variants: [
      { id: 90041, title: '40-43', price: '28.00', sku: 'BMB-BAM-M', inventory_quantity: 50, option1: '40-43' },
    ],
    images: [{ src: 'https://demo.cap/img/bombas-bamboo-socks.jpg', alt: 'Chaussettes bambou' }],
    category: 'Apparel',
    subcategory: 'Socks',
    specs: { material: 'bamboo viscose', pairs: 4, color: 'mixed' },
    useCases: ['everyday', 'sport', 'gift'],
    targetAudience: ['unisex'],
    certifications: ['OEKO-TEX'],
    comparisonTags: ['Stance', 'Happy Socks'],
    shippingInfo: { free: true, estimate: '2-3 business days' },
    returnPolicy: { days: 14 },
    summary: 'Chaussettes en bambou très douces, en lot de 4 paires.',
  },
  {
    shopifyId: 1006n,
    title: 'Bonnet en laine recyclée Finisterre',
    description: 'Bonnet chaud en laine recyclée tricoté en Italie, doublure en polaire bio.',
    vendor: 'Finisterre',
    productType: 'Hat',
    tags: ['beanie', 'wool', 'recycled', 'winter'],
    variants: [
      { id: 90051, title: 'One Size', price: '38.00', sku: 'FIN-BN-OS', inventory_quantity: 20, option1: 'One Size' },
    ],
    images: [{ src: 'https://demo.cap/img/finisterre-beanie.jpg', alt: 'Bonnet recyclé Finisterre' }],
    category: 'Apparel',
    subcategory: 'Hats',
    specs: { material: 'recycled wool', color: 'navy', weight_g: 90 },
    useCases: ['winter', 'outdoor', 'urban'],
    targetAudience: ['men', 'women', 'unisex'],
    certifications: ['B-Corp', 'GRS'],
    comparisonTags: ['Patagonia Beanie', 'Carhartt Watch Hat'],
    shippingInfo: { free: false, estimate: '3-5 business days' },
    returnPolicy: { days: 30 },
    summary: 'Bonnet chaud en laine recyclée certifiée pour l\'hiver.',
  },
  {
    shopifyId: 1007n,
    title: 'Chemise en lin Asket The Linen Shirt White',
    description: 'Chemise blanche en lin européen, coupe contemporaine, fabriquée au Portugal.',
    vendor: 'Asket',
    productType: 'Shirt',
    tags: ['shirt', 'linen', 'minimalist', 'summer'],
    variants: [
      { id: 90061, title: 'M', price: '95.00', sku: 'ASK-LIN-M', inventory_quantity: 6, option1: 'M' },
      { id: 90062, title: 'L', price: '95.00', sku: 'ASK-LIN-L', inventory_quantity: 4, option1: 'L' },
    ],
    images: [{ src: 'https://demo.cap/img/asket-linen-shirt.jpg', alt: 'Chemise en lin Asket' }],
    category: 'Apparel',
    subcategory: 'Shirts',
    specs: { material: 'European linen', color: 'white', fit: 'contemporary' },
    useCases: ['summer', 'office', 'smart-casual'],
    targetAudience: ['men'],
    certifications: ['Masters of Linen'],
    comparisonTags: ['Uniqlo Linen Shirt', 'COS Linen Shirt'],
    shippingInfo: { free: true, estimate: '3-5 business days' },
    returnPolicy: { days: 100 },
    summary: 'Chemise en lin européen, parfaite pour l\'été, fabrication portugaise.',
  },
  {
    shopifyId: 1008n,
    title: 'Portefeuille vegan Matt & Nat Jadis',
    description: 'Portefeuille bifold en cuir végan recyclé, doublure en bouteilles plastique recyclées.',
    vendor: 'Matt & Nat',
    productType: 'Wallet',
    tags: ['wallet', 'vegan', 'recycled', 'minimalist'],
    variants: [
      { id: 90071, title: 'One Size', price: '70.00', sku: 'MN-JAD-OS', inventory_quantity: 25, option1: 'Standard' },
    ],
    images: [{ src: 'https://demo.cap/img/mattnat-wallet.jpg', alt: 'Portefeuille végan' }],
    category: 'Accessories',
    subcategory: 'Wallets',
    specs: { material: 'vegan leather (recycled)', card_slots: 8, color: 'black' },
    useCases: ['everyday', 'gift'],
    targetAudience: ['unisex', 'vegan'],
    certifications: ['PETA Vegan'],
    comparisonTags: ['Bellroy', 'Saddleback Vegan'],
    shippingInfo: { free: false, estimate: '4-7 business days' },
    returnPolicy: { days: 30 },
    summary: 'Portefeuille végan minimaliste fabriqué à partir de matières recyclées.',
  },
]

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return response.data[0]?.embedding ?? []
}

async function main() {
  console.log('🌱 Seeding CAP demo data...')

  // ============================================================
  // 1. Demo merchant
  // ============================================================
  const merchant = await prisma.merchant.upsert({
    where: { shopifyDomain: DEMO_DOMAIN },
    update: { plan: 'free' },
    create: {
      shopifyDomain: DEMO_DOMAIN,
      shopifyToken: 'demo-encrypted-admin-token',
      storefrontToken: null, // No real Shopify token; checkout will return STOREFRONT_NOT_PROVISIONED
      plan: 'free',
      settings: { demo: true, seededAt: new Date().toISOString() },
    },
  })
  console.log(`  ✓ Merchant: ${merchant.shopifyDomain} (${merchant.id})`)

  // Wipe previously seeded products to keep the demo idempotent
  await prisma.productEnriched.deleteMany({ where: { merchantId: merchant.id } })
  await prisma.productRaw.deleteMany({ where: { merchantId: merchant.id } })

  // ============================================================
  // 2. Test API key
  // ============================================================
  const rawKey = `cap_test_${crypto.randomBytes(20).toString('hex')}`
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 16)

  // Revoke any previous demo keys
  await prisma.apiKey.updateMany({
    where: { merchantId: merchant.id, label: 'demo-seed', revokedAt: null },
    data: { revokedAt: new Date() },
  })

  const apiKey = await prisma.apiKey.create({
    data: {
      merchantId: merchant.id,
      keyHash,
      keyPrefix,
      label: 'demo-seed',
    },
  })
  console.log(`  ✓ API key: ${apiKey.id}`)

  // ============================================================
  // 3. Products + embeddings
  // ============================================================
  for (const p of PRODUCTS) {
    const raw = await prisma.productRaw.upsert({
      where: { merchantId_shopifyId: { merchantId: merchant.id, shopifyId: p.shopifyId } },
      update: {
        title: p.title,
        description: p.description,
        variants: p.variants,
        images: p.images,
        syncedAt: new Date(),
      },
      create: {
        merchantId: merchant.id,
        shopifyId: p.shopifyId,
        title: p.title,
        description: p.description,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        variants: p.variants,
        images: p.images,
        status: 'active',
      },
    })

    const embeddingText = `${p.title}. ${p.summary}. ${p.useCases.join(', ')}. ${Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join(', ')}`
    const embedding = await generateEmbedding(embeddingText)
    const prices = p.variants.map((v) => parseFloat(v.price))
    const priceMin = Math.min(...prices)
    const priceMax = Math.max(...prices)
    // Heuristic GEO score from completeness signals
    const geoScore = Math.min(
      100,
      30 +
        (p.specs && Object.keys(p.specs).length >= 3 ? 20 : 10) +
        (p.certifications.length > 0 ? 15 : 0) +
        (p.shippingInfo ? 10 : 0) +
        (p.returnPolicy ? 10 : 0) +
        Math.min(p.images.length * 5, 15),
    )

    await prisma.$executeRaw`
      INSERT INTO products_enriched (
        id, product_raw_id, merchant_id,
        category, subcategory, specs, use_cases, target_audience,
        certifications, comparison_tags,
        price_min, price_max, currency,
        shipping_info, return_policy,
        geo_score, completeness, embedding,
        enriched_at, version
      ) VALUES (
        gen_random_uuid(), ${raw.id}::uuid, ${merchant.id}::uuid,
        ${p.category}, ${p.subcategory},
        ${JSON.stringify(p.specs)}::jsonb,
        ${p.useCases}::text[],
        ${p.targetAudience}::text[],
        ${p.certifications}::text[],
        ${p.comparisonTags}::text[],
        ${priceMin}, ${priceMax}, 'EUR',
        ${JSON.stringify(p.shippingInfo)}::jsonb,
        ${JSON.stringify(p.returnPolicy)}::jsonb,
        ${geoScore}, ${Math.min(100, Object.keys(p.specs).length * 15)},
        ${JSON.stringify(embedding)}::vector,
        NOW(), 1
      )
      ON CONFLICT (product_raw_id) DO UPDATE SET
        category = EXCLUDED.category,
        subcategory = EXCLUDED.subcategory,
        specs = EXCLUDED.specs,
        use_cases = EXCLUDED.use_cases,
        target_audience = EXCLUDED.target_audience,
        certifications = EXCLUDED.certifications,
        comparison_tags = EXCLUDED.comparison_tags,
        price_min = EXCLUDED.price_min,
        price_max = EXCLUDED.price_max,
        shipping_info = EXCLUDED.shipping_info,
        return_policy = EXCLUDED.return_policy,
        geo_score = EXCLUDED.geo_score,
        completeness = EXCLUDED.completeness,
        embedding = EXCLUDED.embedding,
        enriched_at = NOW(),
        version = products_enriched.version + 1
    `

    console.log(`  ✓ ${p.title} — geo_score=${geoScore}`)
  }

  // ============================================================
  // Done
  // ============================================================
  console.log('\n✅ Seed complete.\n')
  console.log('────────────────────────────────────────────────────────────')
  console.log(`  Merchant ID  : ${merchant.id}`)
  console.log(`  Products     : ${PRODUCTS.length}`)
  console.log(`  CAP API key  : ${rawKey}`)
  console.log('────────────────────────────────────────────────────────────')
  console.log('\nTry it:')
  console.log(`  curl -X POST http://localhost:3000/v1/search \\`)
  console.log(`    -H "X-CAP-Key: ${rawKey}" \\`)
  console.log(`    -H "Content-Type: application/json" \\`)
  console.log(`    -d '{"query":"sneakers blanches éco","limit":3}' | jq`)
  console.log('')
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
