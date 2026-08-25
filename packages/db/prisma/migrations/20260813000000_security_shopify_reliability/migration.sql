-- Dashboard identities and signed-session authorization.
CREATE TYPE "MerchantRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST');

ALTER TABLE "merchants"
  ALTER COLUMN "shopify_token" DROP NOT NULL,
  ADD COLUMN "shopify_refresh_token" TEXT,
  ADD COLUMN "access_token_expires_at" TIMESTAMPTZ,
  ADD COLUMN "refresh_token_expires_at" TIMESTAMPTZ,
  ADD COLUMN "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "shop_currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  ADD COLUMN "uninstalled_at" TIMESTAMPTZ;

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "external_id" VARCHAR(255) NOT NULL,
  "email" VARCHAR(320),
  "name" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

CREATE TABLE "merchant_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "role" "MerchantRole" NOT NULL DEFAULT 'ANALYST',
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "merchant_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "merchant_members_user_id_merchant_id_key" ON "merchant_members"("user_id", "merchant_id");
CREATE INDEX "merchant_members_merchant_id_idx" ON "merchant_members"("merchant_id");
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dashboard_login_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "dashboard_login_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dashboard_login_tokens_token_hash_key" ON "dashboard_login_tokens"("token_hash");
CREATE INDEX "dashboard_login_tokens_expires_at_idx" ON "dashboard_login_tokens"("expires_at");
ALTER TABLE "dashboard_login_tokens" ADD CONSTRAINT "dashboard_login_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dashboard_login_tokens" ADD CONSTRAINT "dashboard_login_tokens_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "webhook_id" VARCHAR(255) NOT NULL,
  "merchant_id" UUID NOT NULL,
  "topic" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'processing',
  "error" TEXT,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "processed_at" TIMESTAMPTZ,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_webhook_id_key" ON "webhook_events"("webhook_id");
CREATE INDEX "webhook_events_merchant_id_received_at_idx" ON "webhook_events"("merchant_id", "received_at");
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_checkouts" ADD COLUMN "tracking_token" VARCHAR(64);
UPDATE "agent_checkouts" SET "tracking_token" = REPLACE(gen_random_uuid()::TEXT, '-', '') WHERE "tracking_token" IS NULL;
ALTER TABLE "agent_checkouts" ALTER COLUMN "tracking_token" SET NOT NULL;
CREATE UNIQUE INDEX "agent_checkouts_tracking_token_key" ON "agent_checkouts"("tracking_token");
