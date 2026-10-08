-- Shopify updatedAt of the stored product revision. Overlapping enrichment
-- jobs compare against it so an older Shopify response never overwrites a
-- newer one.
ALTER TABLE "products_raw" ADD COLUMN "shopify_updated_at" TIMESTAMPTZ;
