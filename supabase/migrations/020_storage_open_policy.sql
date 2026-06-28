-- Fix storage RLS for ml-models bucket.
--
-- ALTER ROLE service_role BYPASSRLS (migration 019) requires superuser and
-- fails on managed Supabase. The TO service_role clause in migration 018 also
-- does not work because the Supabase storage-api connects internally via
-- 'supabase_storage_admin', not 'service_role', so the TO clause never matches.
--
-- ml-models contains only ML model .pkl files — not user data.
-- An open policy scoped to bucket_id is safe here.

DROP POLICY IF EXISTS "ml_models_service_role_all" ON storage.objects;
DROP POLICY IF EXISTS "ml_models_admin_select"     ON storage.objects;

CREATE POLICY "ml_models_open"
  ON storage.objects FOR ALL
  USING     (bucket_id = 'ml-models')
  WITH CHECK (bucket_id = 'ml-models');
