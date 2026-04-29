-- CAP initial schema
-- Postgres extensions required for vector similarity, UUID generation and crypto helpers
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- merchants
-- ============================================================
CREATE TABLE "merchants" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "shopify_domain"   VARCHAR(255) NOT NULL,
  "shopify_token"    TEXT         NOT NULL,
  "storefront_token" TEXT,
  "plan"             VARCHAR(50)  NOT NULL DEFAULT 'free',
  "settings"         JSONB        NOT NULL DEFAULT '{}',
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "merchants_shopify_domain_key" ON "merchants"("shopify_domain");

-- ============================================================
-- products_raw
-- ============================================================
CREATE TABLE "products_raw" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"  UUID         NOT NULL,
  "shopify_id"   BIGINT       NOT NULL,
  "title"        TEXT         NOT NULL,
  "description"  TEXT,
  "vendor"       VARCHAR(255),
  "product_type" VARCHAR(255),
  "tags"         TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "variants"     JSONB        NOT NULL,
  "images"       JSONB,
  "metafields"   JSONB,
  "status"       VARCHAR(50),
  "synced_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "deleted_at"   TIMESTAMPTZ,
  CONSTRAINT "products_raw_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_raw_merchant_id_shopify_id_key" ON "products_raw"("merchant_id", "shopify_id");
ALTER TABLE "products_raw"
  ADD CONSTRAINT "products_raw_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- products_enriched
-- ============================================================
CREATE TABLE "products_enriched" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "product_raw_id"   UUID         NOT NULL,
  "merchant_id"      UUID         NOT NULL,
  "category"         VARCHAR(255),
  "subcategory"      VARCHAR(255),
  "specs"            JSONB        NOT NULL DEFAULT '{}',
  "use_cases"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "target_audience"  TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "certifications"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "care_info"        TEXT,
  "size_guide"       JSONB,
  "comparison_tags"  TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "price_min"        DECIMAL(10,2),
  "price_max"        DECIMAL(10,2),
  "currency"         VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  "shipping_info"    JSONB,
  "return_policy"    JSONB,
  "geo_score"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completeness"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Vector embedding column managed outside of Prisma (pgvector not natively supported)
  "embedding"        vector(1536),
  "enriched_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "version"          INTEGER      NOT NULL DEFAULT 1,
  "deleted_at"       TIMESTAMPTZ,
  CONSTRAINT "products_enriched_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_enriched_product_raw_id_key" ON "products_enriched"("product_raw_id");
CREATE INDEX "idx_enriched_merchant" ON "products_enriched"("merchant_id");
CREATE INDEX "idx_enriched_category" ON "products_enriched"("category", "subcategory");
-- Approximate nearest neighbour index for cosine distance
CREATE INDEX "idx_enriched_embedding_cosine" ON "products_enriched"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
ALTER TABLE "products_enriched"
  ADD CONSTRAINT "products_enriched_product_raw_id_fkey"
  FOREIGN KEY ("product_raw_id") REFERENCES "products_raw"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products_enriched"
  ADD CONSTRAINT "products_enriched_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- api_keys
-- ============================================================
CREATE TABLE "api_keys" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"  UUID         NOT NULL,
  "key_hash"     TEXT         NOT NULL,
  "key_prefix"   VARCHAR(16)  NOT NULL,
  "label"        VARCHAR(255),
  "last_used_at" TIMESTAMPTZ,
  "revoked_at"   TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- agent_queries
-- ============================================================
CREATE TABLE "agent_queries" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "agent_id"         VARCHAR(255) NOT NULL,
  "agent_type"       VARCHAR(100),
  "query_text"       TEXT,
  "filters"          JSONB,
  "results_count"    INTEGER,
  "selected_product" UUID,
  "converted"        BOOLEAN      NOT NULL DEFAULT FALSE,
  "latency_ms"       INTEGER,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "agent_queries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_agent_queries_created" ON "agent_queries"("created_at");
CREATE INDEX "idx_agent_queries_type"    ON "agent_queries"("agent_type");
ALTER TABLE "agent_queries"
  ADD CONSTRAINT "agent_queries_selected_product_fkey"
  FOREIGN KEY ("selected_product") REFERENCES "products_enriched"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- agent_checkouts
-- ============================================================
CREATE TABLE "agent_checkouts" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "agent_query_id"      UUID,
  "merchant_id"         UUID         NOT NULL,
  "product_id"          UUID         NOT NULL,
  "shopify_checkout_id" VARCHAR(255),
  "status"              VARCHAR(50)  NOT NULL DEFAULT 'pending',
  "amount"              DECIMAL(10,2),
  "currency"            VARCHAR(3),
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "agent_checkouts_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "agent_checkouts"
  ADD CONSTRAINT "agent_checkouts_agent_query_id_fkey"
  FOREIGN KEY ("agent_query_id") REFERENCES "agent_queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_checkouts"
  ADD CONSTRAINT "agent_checkouts_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_checkouts"
  ADD CONSTRAINT "agent_checkouts_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products_enriched"("id") ON DELETE CASCADE ON UPDATE CASCADE;
