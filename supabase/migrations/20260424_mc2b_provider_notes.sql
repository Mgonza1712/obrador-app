-- Per-provider notes on purchase orders
-- Stored as JSONB: { "provider_uuid": "note text", "__none__": "note for unassigned lines" }
ALTER TABLE erp_purchase_orders
  ADD COLUMN IF NOT EXISTS provider_notes JSONB DEFAULT '{}';
