ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "merchant_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "role" "MerchantRole" NOT NULL DEFAULT 'ANALYST',
  "token_hash" VARCHAR(64) NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "merchant_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_invitations_token_hash_key"
  ON "merchant_invitations"("token_hash");
CREATE INDEX "merchant_invitations_merchant_id_email_idx"
  ON "merchant_invitations"("merchant_id", "email");
CREATE INDEX "merchant_invitations_expires_at_idx"
  ON "merchant_invitations"("expires_at");

ALTER TABLE "merchant_invitations" ADD CONSTRAINT "merchant_invitations_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchant_invitations" ADD CONSTRAINT "merchant_invitations_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
