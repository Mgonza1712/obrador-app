-- Scheduled and recurring orders support
-- Run in Supabase SQL editor

ALTER TABLE erp_purchase_orders
  ADD COLUMN IF NOT EXISTS scheduled_for     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_template       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_cron   TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_label  TEXT,
  ADD COLUMN IF NOT EXISTS next_run_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_id       UUID REFERENCES erp_purchase_orders(id) ON DELETE SET NULL;

-- Index for the n8n cron query (scheduled but not template)
CREATE INDEX IF NOT EXISTS idx_orders_scheduled
  ON erp_purchase_orders (tenant_id, scheduled_for)
  WHERE status = 'draft' AND is_template = FALSE AND scheduled_for IS NOT NULL;

-- Index for recurring templates
CREATE INDEX IF NOT EXISTS idx_orders_templates
  ON erp_purchase_orders (tenant_id, next_run_at)
  WHERE is_template = TRUE;
