-- SECURITY DEFINER function to read ml_model_logs.
--
-- Direct table SELECT via the service_role PostgREST client returns empty rows
-- because supabase-py v2 does not reliably forward the service_role JWT claim
-- into request.jwt.claims for table queries, so RLS policies never match.
-- A SECURITY DEFINER function runs as postgres and bypasses RLS entirely —
-- the same pattern used by upsert_ml_model_log and all import batch RPCs.

CREATE OR REPLACE FUNCTION public.get_ml_model_versions()
RETURNS TABLE (
  version       TEXT,
  storage_path  TEXT,
  is_active     BOOLEAN,
  accuracy      NUMERIC,
  f1_score      NUMERIC,
  train_samples INT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT version, storage_path, is_active, accuracy, f1_score, train_samples, created_at
  FROM   public.ml_model_logs
  ORDER  BY created_at DESC;
$$;
