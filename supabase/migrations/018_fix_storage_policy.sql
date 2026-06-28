-- Fix storage RLS for the ml-models bucket.
--
-- The previous policy (016) checked (auth.jwt() ->> 'role') = 'service_role',
-- but the Supabase Storage API sets the PostgreSQL database role directly to
-- 'service_role' without writing JWT claims to request.jwt.claims, so the
-- auth.jwt() expression evaluates to NULL and the policy never matches.
--
-- Using the TO <role> clause targets the policy at the database role itself,
-- which IS set correctly when the Storage API handles a service_role JWT.

DROP POLICY IF EXISTS "ml_models_service_role_all" ON storage.objects;
DROP POLICY IF EXISTS "ml_models_admin_select"     ON storage.objects;

-- service_role (seed script + retrain endpoint): full read/write access.
CREATE POLICY "ml_models_service_role_all"
  ON storage.objects FOR ALL TO service_role
  USING     (bucket_id = 'ml-models')
  WITH CHECK (bucket_id = 'ml-models');

-- admin users: read-only (download model artefacts from the admin UI).
CREATE POLICY "ml_models_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ml-models'
    AND public.get_my_role() = 'admin'
  );
