/*
  RLS hardening.

  The original org_members policies queried org_members from inside policies on
  org_members, which can recurse. A SECURITY DEFINER membership helper avoids
  that recursion while keeping tenant isolation.
*/

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "members_select_own" ON org_members;
CREATE POLICY "members_select_own" ON org_members FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "members_insert_own" ON org_members;
CREATE POLICY "members_insert_own" ON org_members FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "members_update_own" ON org_members;
CREATE POLICY "members_update_own" ON org_members FOR UPDATE TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "members_delete_own" ON org_members;
CREATE POLICY "members_delete_own" ON org_members FOR DELETE TO authenticated
USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations FOR SELECT TO authenticated
USING (public.is_org_member(id));

DROP POLICY IF EXISTS "org_update_own" ON organizations;
CREATE POLICY "org_update_own" ON organizations FOR UPDATE TO authenticated
USING (public.is_org_admin(id))
WITH CHECK (public.is_org_admin(id));
