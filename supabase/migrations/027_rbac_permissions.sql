-- ─── Permission-based ACL tables and helpers ───────────────────────────────────

CREATE TABLE public.permissions (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE public.role_permissions (
  role          TEXT NOT NULL CHECK (role IN ('guest', 'user', 'city_official', 'admin')),
  permission_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_all" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "role_permissions_select_all" ON public.role_permissions FOR SELECT USING (true);

-- ─── Seed permissions ────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, description) VALUES
  ('map.read',             'View map and public data'),
  ('proposals.create',     'Draw and create proposals'),
  ('proposals.submit',     'Submit own draft for review'),
  ('proposals.review',     'Approve or reject proposals'),
  ('proposals.delete.own', 'Delete own proposals'),
  ('proposals.delete.any', 'Delete any proposal'),
  ('hazards.report',       'Report hazards on the map'),
  ('hazards.review',       'Update hazard report status'),
  ('votes.cast',           'Vote on proposals'),
  ('comments.write',       'Write comments on proposals'),
  ('admin.ml',             'Manage ML models'),
  ('admin.import',         'Import geographic data'),
  ('admin.users',          'Manage user roles');

-- guest
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('guest', 'map.read');

-- user
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('user', 'map.read'),
  ('user', 'proposals.create'),
  ('user', 'proposals.submit'),
  ('user', 'proposals.delete.own'),
  ('user', 'hazards.report'),
  ('user', 'votes.cast'),
  ('user', 'comments.write');

-- city_official (inherits user permissions)
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('city_official', 'map.read'),
  ('city_official', 'proposals.create'),
  ('city_official', 'proposals.submit'),
  ('city_official', 'proposals.review'),
  ('city_official', 'proposals.delete.own'),
  ('city_official', 'hazards.report'),
  ('city_official', 'hazards.review'),
  ('city_official', 'votes.cast'),
  ('city_official', 'comments.write');

-- admin (all permissions)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id FROM public.permissions;

-- ─── Helper functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_permission(p TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role = public.get_my_role() AND rp.permission_id = p
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_role() = ANY(roles)
$$;

-- ─── Migrate key RLS policies to permission checks ───────────────────────────

DROP POLICY IF EXISTS "proposals_update_official" ON public.proposals;
CREATE POLICY "proposals_update_official" ON public.proposals FOR UPDATE
  USING (public.has_permission('proposals.review'));

DROP POLICY IF EXISTS "hazards_update_official" ON public.hazard_reports;
CREATE POLICY "hazards_update_official" ON public.hazard_reports FOR UPDATE
  USING (public.has_permission('hazards.review'));

DROP POLICY IF EXISTS "ml_logs_select_official" ON public.ml_model_logs;
CREATE POLICY "ml_logs_select_official" ON public.ml_model_logs FOR SELECT
  USING (public.has_permission('admin.ml'));

DROP POLICY IF EXISTS "ml_logs_all_admin" ON public.ml_model_logs;
CREATE POLICY "ml_logs_all_admin" ON public.ml_model_logs FOR ALL
  USING (public.has_permission('admin.ml'));

DROP POLICY IF EXISTS "proposals_delete_admin" ON public.proposals;
CREATE POLICY "proposals_delete_admin" ON public.proposals FOR DELETE
  USING (public.has_permission('proposals.delete.any'));

DROP POLICY IF EXISTS "comments_delete_admin" ON public.comments;
CREATE POLICY "comments_delete_admin" ON public.comments FOR DELETE
  USING (public.has_permission('proposals.delete.any'));

DROP POLICY IF EXISTS "accidents_insert_admin" ON public.accidents;
CREATE POLICY "accidents_insert_admin" ON public.accidents FOR INSERT
  WITH CHECK (public.has_permission('admin.import'));

DROP POLICY IF EXISTS "accidents_delete_admin" ON public.accidents;
CREATE POLICY "accidents_delete_admin" ON public.accidents FOR DELETE
  USING (public.has_permission('admin.import'));

DROP POLICY IF EXISTS "bike_lanes_all_admin" ON public.bike_lanes;
CREATE POLICY "bike_lanes_all_admin" ON public.bike_lanes FOR ALL
  USING (public.has_permission('admin.import'));

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.has_permission('admin.users'));
