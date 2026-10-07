-- agent_queries.merchant_id was added as nullable without a backfill, so
-- older rows escape per-merchant erasure (shop/redact). Attribute them through
-- the product they selected or the checkout they led to, then drop the rows
-- that still cannot be attributed: they hold shopper text and no merchant.
UPDATE "agent_queries" AS q
SET "merchant_id" = pe."merchant_id"
FROM "products_enriched" AS pe
WHERE q."merchant_id" IS NULL AND q."selected_product" = pe."id";

UPDATE "agent_queries" AS q
SET "merchant_id" = c."merchant_id"
FROM "agent_checkouts" AS c
WHERE q."merchant_id" IS NULL AND c."agent_query_id" = q."id";

DELETE FROM "agent_queries" WHERE "merchant_id" IS NULL;
