ALTER TABLE public.erp_purchase_order_lines
  ADD COLUMN IF NOT EXISTS qty_cancelled NUMERIC NOT NULL DEFAULT 0 CHECK (qty_cancelled >= 0),
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.erp_purchase_order_lines.qty_cancelled IS
  'Cantidad pendiente cancelada/cerrada sin recibir. No representa mercancia entregada.';
COMMENT ON COLUMN public.erp_purchase_order_lines.cancelled_reason IS
  'Motivo operativo del cierre/cancelacion del pendiente.';
COMMENT ON COLUMN public.erp_purchase_order_lines.cancelled_at IS
  'Fecha en la que se cerro/cancelo el pendiente.';
