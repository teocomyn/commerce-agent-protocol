-- Foreign keys without an index make every cascade or SET NULL on the parent
-- (app uninstall, shop/redact, retention deletes) scan the child table, and
-- per-merchant listings (API keys, sign-in links) scan it too.
CREATE INDEX IF NOT EXISTS "merchant_invitations_invited_by_user_id_idx" ON "merchant_invitations"("invited_by_user_id");
CREATE INDEX IF NOT EXISTS "dashboard_login_tokens_user_id_idx" ON "dashboard_login_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "dashboard_login_tokens_merchant_id_idx" ON "dashboard_login_tokens"("merchant_id");
CREATE INDEX IF NOT EXISTS "api_keys_merchant_id_idx" ON "api_keys"("merchant_id");
CREATE INDEX IF NOT EXISTS "agent_queries_selected_product_idx" ON "agent_queries"("selected_product");
CREATE INDEX IF NOT EXISTS "agent_checkouts_agent_query_id_idx" ON "agent_checkouts"("agent_query_id");
CREATE INDEX IF NOT EXISTS "agent_checkouts_product_id_idx" ON "agent_checkouts"("product_id");
