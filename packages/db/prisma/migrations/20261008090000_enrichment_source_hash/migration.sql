-- Fingerprint of the content sent to the LLM and the embedding model. When a
-- product update leaves it unchanged, only prices, policies and merchant
-- claims are refreshed, without paying for a new enrichment.
ALTER TABLE "products_enriched" ADD COLUMN "source_hash" VARCHAR(64);
