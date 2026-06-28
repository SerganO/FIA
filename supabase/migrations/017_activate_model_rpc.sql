-- SECURITY DEFINER RPC for activating an ML model version.
--
-- Direct table INSERT on ml_model_logs fails for the service_role JWT when
-- supabase-py v2 doesn't forward the role claim correctly (see 008, 015).
-- A SECURITY DEFINER function runs as its owner (postgres) and bypasses RLS
-- entirely, the same pattern used by all the import batch RPCs.

CREATE OR REPLACE FUNCTION public.upsert_ml_model_log(
  p_version       TEXT,
  p_storage_path  TEXT,
  p_accuracy      NUMERIC  DEFAULT NULL,
  p_f1_score      NUMERIC  DEFAULT NULL,
  p_train_samples INT      DEFAULT NULL,
  p_feature_names TEXT[]   DEFAULT NULL,
  p_notes         TEXT     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deactivate all currently active models.
  UPDATE public.ml_model_logs
  SET    is_active = FALSE
  WHERE  is_active = TRUE;

  -- Insert new version, or update it if already logged (idempotent re-runs).
  INSERT INTO public.ml_model_logs
    (version, storage_path, accuracy, f1_score, train_samples, feature_names, is_active, notes)
  VALUES
    (p_version, p_storage_path, p_accuracy, p_f1_score, p_train_samples, p_feature_names, TRUE, p_notes)
  ON CONFLICT (version) DO UPDATE SET
    storage_path   = EXCLUDED.storage_path,
    accuracy       = EXCLUDED.accuracy,
    f1_score       = EXCLUDED.f1_score,
    train_samples  = EXCLUDED.train_samples,
    feature_names  = EXCLUDED.feature_names,
    is_active      = TRUE,
    notes          = EXCLUDED.notes;
END;
$$;
