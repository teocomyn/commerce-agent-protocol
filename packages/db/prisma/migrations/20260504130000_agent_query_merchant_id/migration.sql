-- AlterTable
ALTER TABLE "agent_queries" ADD COLUMN IF NOT EXISTS "merchant_id" UUID;

-- ForeignKey (may fail if orphaned rows; fresh installs have none)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_queries_merchant_id_fkey'
  ) THEN
    ALTER TABLE "agent_queries"
      ADD CONSTRAINT "agent_queries_merchant_id_fkey"
      FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_agent_queries_merchant" ON "agent_queries" ("merchant_id");
