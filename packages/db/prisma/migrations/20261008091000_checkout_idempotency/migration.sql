-- Idempotency-Key support for POST /v1/checkout/initiate: a retried request
-- with the same key replays the stored response instead of creating a second
-- Shopify cart.
ALTER TABLE "agent_checkouts"
  ADD COLUMN "idempotency_key" VARCHAR(255),
  ADD COLUMN "request_hash" VARCHAR(64),
  ADD COLUMN "response" JSONB;

CREATE UNIQUE INDEX "agent_checkouts_merchant_id_idempotency_key_key"
  ON "agent_checkouts"("merchant_id", "idempotency_key");

CREATE INDEX "agent_checkouts_merchant_id_created_at_idx"
  ON "agent_checkouts"("merchant_id", "created_at");
