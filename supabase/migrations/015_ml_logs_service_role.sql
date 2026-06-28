-- ml_model_logs: allow service_role to INSERT and UPDATE.
-- Same issue as in 008_service_role_import.sql — the Python SDK v2 sometimes
-- doesn't forward the JWT role claim, so we add explicit policies.

CREATE POLICY "ml_logs_insert_service"
  ON public.ml_model_logs FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "ml_logs_update_service"
  ON public.ml_model_logs FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'service_role');
