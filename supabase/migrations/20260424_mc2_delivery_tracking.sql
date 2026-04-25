-- MC-2: Delivery Tracking
-- Columns on purchase order lines to track received quantities and cancellations

ALTER TABLE erp_purchase_order_lines
  ADD COLUMN IF NOT EXISTS qty_received NUMERIC NOT NULL DEFAULT 0
    CHECK (qty_received >= 0),
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false;

-- Index to find pending lines efficiently
CREATE INDEX IF NOT EXISTS idx_erp_pol_pending
  ON erp_purchase_order_lines(order_id)
  WHERE is_cancelled = false;
