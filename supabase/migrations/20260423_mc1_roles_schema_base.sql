-- MC-1: Roles, Permisos y Schema Base
-- Tabla de permisos granulares por local+sector (reemplaza venue_id/sector en profiles)

CREATE TABLE IF NOT EXISTS user_venue_sectors (
  user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES erp_venues(id) ON DELETE CASCADE,
  sector   TEXT NOT NULL CHECK (sector IN ('cocina','barra','salon','todos')),
  PRIMARY KEY (user_id, venue_id, sector)
);

-- Relacion N:M pedido <-> documento
CREATE TABLE IF NOT EXISTS erp_order_documents (
  order_id    UUID NOT NULL REFERENCES erp_purchase_orders(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES erp_documents(id) ON DELETE CASCADE,
  match_score NUMERIC,
  linked_by   TEXT NOT NULL DEFAULT 'auto',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, document_id)
);

-- Agregar shift_manager al constraint de roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer','shift_manager','local_admin','admin','owner'));

-- Nuevos campos en erp_purchase_orders
ALTER TABLE erp_purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','partially_delivered','delivered','invoiced')),
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES erp_venues(id),
  ADD COLUMN IF NOT EXISTS sector TEXT;

-- Asignar revisor a un documento
ALTER TABLE erp_documents
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES profiles(id);

-- Vigencia de precios pactados
ALTER TABLE erp_price_history
  ADD COLUMN IF NOT EXISTS valid_until DATE;

-- Token para QR de recepcion anonima (MC-3 prep)
ALTER TABLE erp_venues
  ADD COLUMN IF NOT EXISTS reception_token UUID DEFAULT gen_random_uuid();

-- Indices
CREATE INDEX IF NOT EXISTS idx_user_venue_sectors_venue ON user_venue_sectors(venue_id);
CREATE INDEX IF NOT EXISTS idx_erp_order_documents_doc ON erp_order_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_delivery ON erp_purchase_orders(delivery_status) WHERE delivery_status != 'invoiced';
CREATE INDEX IF NOT EXISTS idx_erp_venues_reception_token ON erp_venues(reception_token);

-- Migrar datos existentes de profiles.venue_id + profiles.sector a user_venue_sectors
INSERT INTO user_venue_sectors (user_id, venue_id, sector)
SELECT id, venue_id, LOWER(COALESCE(NULLIF(sector,''), 'todos'))
FROM profiles
WHERE venue_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS en user_venue_sectors
ALTER TABLE user_venue_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_scopes" ON user_venue_sectors
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admins_manage_tenant_scopes" ON user_venue_sectors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','owner')
        AND p.tenant_id = (SELECT tenant_id FROM profiles WHERE id = user_venue_sectors.user_id)
    )
  );

-- RLS en erp_order_documents
ALTER TABLE erp_order_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_order_documents" ON erp_order_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM erp_purchase_orders o
      JOIN profiles p ON p.tenant_id = o.tenant_id
      WHERE o.id = erp_order_documents.order_id
        AND p.id = auth.uid()
    )
  );
