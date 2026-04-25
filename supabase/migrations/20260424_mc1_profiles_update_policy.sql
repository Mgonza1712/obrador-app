-- MC-1 fix: Policies de UPDATE en profiles
-- Sin esto, updateUserProfile() fallaba silenciosamente (RLS bloqueaba sin error)

-- Allow admin/owner to update any profile within their tenant
CREATE POLICY "admins_update_tenant_profiles" ON profiles
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.tenant_id = profiles.tenant_id
  )
);

-- Allow users to update their own basic info (name, phone) but not role/tenant
-- Role changes are admin-only, handled above
CREATE POLICY "users_update_own_profile" ON profiles
FOR UPDATE USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  -- Prevent self-escalation: cannot change own role or tenant
  AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
);
