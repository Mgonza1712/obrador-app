-- Email sending config per tenant (used by n8n Resend integration)
-- email_from:      the sender address, e.g. "pedidos@78sabores.com"
-- email_from_name: display name, e.g. "Grupo 78 Sabores"
ALTER TABLE erp_tenants
  ADD COLUMN IF NOT EXISTS email_from      TEXT,
  ADD COLUMN IF NOT EXISTS email_from_name TEXT;
