-- Extend profiles table with role enforcement + WA linking + sector
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name              TEXT,
  ADD COLUMN IF NOT EXISTS phone                  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_jid           TEXT,
  ADD COLUMN IF NOT EXISTS sector                 TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code     TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code_expires_at TIMESTAMPTZ;

-- Enforce valid roles (buyer is default)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'buyer';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer', 'local_admin', 'admin', 'owner'));

-- Evolution API + Chatwoot config per tenant
ALTER TABLE erp_tenants
  ADD COLUMN IF NOT EXISTS evolution_api_url          TEXT,
  ADD COLUMN IF NOT EXISTS evolution_bot_instance     TEXT,
  ADD COLUMN IF NOT EXISTS evolution_ordering_instance TEXT,
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_id          INTEGER,
  ADD COLUMN IF NOT EXISTS chatwoot_account_id        INTEGER;

-- WhatsApp JID per provider (auto-populated on first reply)
ALTER TABLE erp_providers
  ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT;

-- Track who created each purchase order
ALTER TABLE erp_purchase_orders
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Index for JID lookups (hot path in bot webhook)
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_jid ON profiles(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_whatsapp_jid ON erp_providers(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
