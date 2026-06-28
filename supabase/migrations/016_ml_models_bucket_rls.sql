-- RLS policies for the private 'ml-models' Storage bucket.
--
-- The bucket must already exist (create it in Dashboard → Storage → New bucket,
-- set to private). These policies control who can read/write objects inside it.

-- service_role: full access — used by seed_model.py (upload) and the retrain
-- endpoint (upload + overwrite).
CREATE POLICY "ml_models_service_role_all"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'ml-models'
    AND (auth.jwt() ->> 'role') = 'service_role'
  )
  WITH CHECK (
    bucket_id = 'ml-models'
    AND (auth.jwt() ->> 'role') = 'service_role'
  );

-- admin users: read-only — allows downloading model files from the dashboard
-- or any future admin UI that serves model artefacts.
CREATE POLICY "ml_models_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ml-models'
    AND public.get_my_role() = 'admin'
  );
