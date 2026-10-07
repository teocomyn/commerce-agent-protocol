#!/usr/bin/env bash
# Fails when prisma/schema.prisma and a database migrated with
# `prisma migrate deploy` disagree. Run against a fresh, migrated database.
#
# Prisma 5 cannot express pgvector index types, so the diff always proposes to
# drop the ivfflat index created by the initial migration. That line is the
# only tolerated difference.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a migrated database}"
cd "$(dirname "$0")/.."

diff_sql="$(PRISMA_HIDE_UPDATE_MESSAGE=1 pnpm --silent exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script)"

unexpected="$(printf '%s\n' "$diff_sql" \
  | grep -vE '^[[:space:]]*$|^--|^DROP INDEX "idx_enriched_embedding_cosine";$' || true)"

if [ -n "$unexpected" ]; then
  echo "schema.prisma does not match the migrations. Unexpected changes:" >&2
  printf '%s\n' "$unexpected" >&2
  echo "Add a migration (or fix schema.prisma) so both describe the same database." >&2
  exit 1
fi
echo "schema.prisma matches the migrations."
