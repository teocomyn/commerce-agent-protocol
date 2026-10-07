-- Dashboard sessions carry this counter. Every membership change that must
-- sign the member out increments it atomically, which, unlike updated_at,
-- cannot repeat across clocks or writes in the same millisecond.
ALTER TABLE "merchant_members" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
