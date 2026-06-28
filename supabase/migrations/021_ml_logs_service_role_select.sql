-- Allow service_role to SELECT from ml_model_logs.
--
-- The existing SELECT policy uses get_my_role() which requires auth.uid().
-- The FastAPI service_role client has auth.uid() = NULL, so get_my_role()
-- returns NULL and the SELECT returns 0 rows (empty model list in admin panel).
--
-- PostgREST does SET LOCAL ROLE service_role for service_role JWT requests,
-- so a TO service_role policy applies correctly for table queries.

CREATE POLICY "ml_logs_service_role_select"
  ON public.ml_model_logs FOR SELECT TO service_role
  USING (true);
